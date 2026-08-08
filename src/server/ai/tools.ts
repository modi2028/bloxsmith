import "server-only";

/**
 * Model-facing Studio tool definitions (provider-agnostic JSON Schema).
 * Descriptions are prescriptive about WHEN to call each tool — that
 * measurably improves tool selection. Argument validation against the strict
 * zod contract happens in the loop before anything is queued.
 */
export type ModelToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

const ref = {
  type: "string",
  pattern: "^ref:",
  description:
    "An instance ref, e.g. 'ref:workspace' or a ref returned by another tool.",
};

const propertyValue = {
  description:
    "Property value. Primitives (number/string/boolean) pass through. Rich types use a wrapper: " +
    '{"$type":"Vector3","value":[x,y,z]}, {"$type":"Vector2","value":[x,y]}, ' +
    '{"$type":"Color3","value":[r,g,b]} (0-1 floats), {"$type":"CFrame","value":[12 numbers]}, ' +
    '{"$type":"UDim2","value":[xScale,xOffset,yScale,yOffset]}, {"$type":"UDim","value":[scale,offset]}, ' +
    '{"$type":"Enum","enum":"Material","item":"Neon"}, {"$type":"NumberRange","value":[min,max]}, ' +
    '{"$type":"BrickColor","value":"Bright red"}, {"$type":"Rect","value":[minX,minY,maxX,maxY]}. ' +
    "IMPORTANT for ParticleEmitter/Beam/Trail properties: Size, Transparency, Lifetime, etc. are " +
    "NOT plain numbers. Use NumberSequence for Size/Transparency, ColorSequence for Color, and " +
    "NumberRange for Lifetime/Speed/Rotation. Sequences take keypoints from time 0 to time 1: " +
    '{"$type":"NumberSequence","value":[[0,1],[1,0]]} (each keypoint [time,value], optional 3rd envelope) ' +
    'or {"$type":"NumberSequence","value":0.5} for a constant; ' +
    '{"$type":"ColorSequence","value":[[0,[1,0,0]],[1,[0,0,1]]]} (each [time,[r,g,b]]) or ' +
    '{"$type":"ColorSequence","value":[1,0,0]} for a constant. Instance references are ref strings.',
};

export function getStudioTools(
  opts: {
    assetTools?: boolean;
    webSearchTool?: boolean;
    referenceImages?: boolean;
  } = {},
): ModelToolDef[] {
  const tools: ModelToolDef[] = [
    {
      name: "get_selection",
      description:
        "Get what the user currently has selected in Studio. Call this first when the user says 'this', 'the selected part', or refers to something without naming a path.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "list_children",
      description:
        "List the children of an instance. Call this to discover what exists before creating or modifying anything — never assume an instance exists. Start from well-known roots: ref:workspace, ref:replicated_storage, ref:server_script_service, ref:server_storage, ref:starter_gui, ref:starter_player, ref:lighting.",
      input_schema: {
        type: "object",
        properties: {
          parent: ref,
          depth: {
            type: "integer",
            minimum: 1,
            maximum: 3,
            description: "Levels to descend (default 1). Keep small.",
          },
        },
        required: ["parent"],
        additionalProperties: false,
      },
    },
    {
      name: "get_properties",
      description:
        "Read property values of an instance. Call before editing an existing instance so changes build on its real current state (position, size, source, etc.).",
      input_schema: {
        type: "object",
        properties: {
          target: ref,
          names: {
            type: "array",
            items: { type: "string" },
            description:
              "Property names to read. Omit for a sensible default set for the class.",
          },
        },
        required: ["target"],
        additionalProperties: false,
      },
    },
    {
      name: "create_instance",
      description:
        "Create ONE instance (Part, Model, Folder, RemoteEvent, etc.) under a parent. Use for single instances and for non-visual objects. To build anything made of several parts — a tree, a vehicle, a building, a prop — use build_model instead; creating a model one part at a time here will exhaust your budget before the model is finished.",
      input_schema: {
        type: "object",
        properties: {
          className: {
            type: "string",
            description: "Roblox class name, e.g. 'Part', 'Model', 'Folder'.",
          },
          parent: ref,
          name: { type: "string", description: "Instance Name (optional)." },
          properties: {
            type: "object",
            description: "Initial property values.",
            additionalProperties: propertyValue,
          },
        },
        required: ["className", "parent"],
        additionalProperties: false,
      },
    },
    {
      name: "build_model",
      description:
        "Build a complete model in ONE call — this is the RIGHT way to make anything with more than two or three parts (a tree, a car, a house, a weapon, furniture, a character). Do NOT build models by calling create_instance repeatedly; that wastes your budget on round-trips and is why builds come out blocky and unfinished. " +
        "Every part's position is RELATIVE to the model origin, and rotation is three plain degrees — so design the shape in its own space around (0,0,0) and let origin place it in the world. " +
        "Spend your detail here: 30-80 parts makes something that reads as a real object, 6 parts makes a pile of bricks. Use small parts for trim, edges, handles and panel lines — those details are what separate a good model from a blocky one. " +
        "Use csg to cut holes and shape curves: subtract removes the listed parts from base (windows, doorways, barrels, hollows), union merges parts into one smooth solid. Parts consumed by csg disappear, so add helper parts purely to cut with.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the Model." },
          parent: ref,
          origin: {
            type: "array",
            items: { type: "number" },
            minItems: 3,
            maxItems: 3,
            description:
              "[x,y,z] world position the model is built around. Default [0,0,0]. Every part's position is measured from here.",
          },
          parts: {
            type: "array",
            minItems: 1,
            maxItems: 150,
            description: "The parts making up the model.",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Unique within this call. csg refers to parts by this name.",
                },
                className: {
                  type: "string",
                  description: "Default 'Part'. Use 'WedgePart' for ramps and roof slopes.",
                },
                shape: {
                  type: "string",
                  enum: ["Block", "Ball", "Cylinder", "Wedge", "CornerWedge"],
                  description: "Part.Shape. Cylinder and Ball are how you avoid an all-boxes look.",
                },
                size: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 3,
                  maxItems: 3,
                  description: "[x,y,z] studs.",
                },
                position: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 3,
                  maxItems: 3,
                  description: "[x,y,z] RELATIVE to origin, part centre.",
                },
                rotation: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 3,
                  maxItems: 3,
                  description: "[x,y,z] degrees. Omit for none.",
                },
                color: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 3,
                  maxItems: 3,
                  description: "[r,g,b] as 0-1 floats.",
                },
                material: {
                  type: "string",
                  description:
                    "Enum.Material name: Wood, Brick, Metal, Grass, Slate, Neon, Glass, Concrete, Sand, Fabric, Marble, Plastic.",
                },
                transparency: { type: "number", minimum: 0, maximum: 1 },
                anchored: {
                  type: "boolean",
                  description: "Default true. Only set false for parts meant to fall or be welded.",
                },
                properties: {
                  type: "object",
                  description:
                    "Anything the fields above do not cover, in full property-value form.",
                  additionalProperties: propertyValue,
                },
              },
              required: ["name", "size", "position"],
              additionalProperties: false,
            },
          },
          csg: {
            type: "array",
            maxItems: 40,
            description:
              "Solid modelling, applied once every part exists. Parts are named, not refs.",
            items: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["union", "subtract"],
                  description:
                    "'subtract' cuts parts out of base; 'union' merges parts into one solid.",
                },
                base: {
                  type: "string",
                  description: "subtract only: the part being cut into.",
                },
                parts: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 1,
                  description:
                    "subtract: the cutters. union: the parts to merge.",
                },
                name: { type: "string", description: "Name for the result." },
              },
              required: ["action", "parts"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "parent", "parts"],
        additionalProperties: false,
      },
    },
    {
      name: "set_property",
      description:
        "Set one property on an existing instance. For several properties on a NEW instance, prefer create_instance's properties field.",
      input_schema: {
        type: "object",
        properties: {
          target: ref,
          name: { type: "string" },
          value: propertyValue,
        },
        required: ["target", "name", "value"],
        additionalProperties: false,
      },
    },
    {
      name: "write_script",
      description:
        "Create a new script or replace the full source of an existing one. For a new script give parent+name+scriptType; to overwrite an existing script give target. Write complete, idiomatic Luau — this replaces the entire source. Server logic goes in ServerScriptService as 'Script'; client logic in StarterPlayer/StarterGui as 'LocalScript'; shared code as 'ModuleScript' in ReplicatedStorage.",
      input_schema: {
        type: "object",
        properties: {
          target: { ...ref, description: "Existing script to overwrite." },
          parent: { ...ref, description: "Parent for a new script." },
          name: { type: "string", description: "Name for a new script." },
          scriptType: {
            type: "string",
            enum: ["Script", "LocalScript", "ModuleScript"],
          },
          source: { type: "string", description: "Full Luau source." },
        },
        required: ["source"],
        additionalProperties: false,
      },
    },
    {
      name: "delete_instance",
      description:
        "Delete an instance and all its descendants. Only delete things you created this session or that the user explicitly asked to remove.",
      input_schema: {
        type: "object",
        properties: { target: ref },
        required: ["target"],
        additionalProperties: false,
      },
    },
  ];

  // Durable memory: what's worth knowing next time, not a transcript.
  tools.push({
    name: "remember",
    description:
      "Save a short fact you'll want in a LATER session. Use it when you learn something durable: how the place is organised, names and conventions the user expects, decisions they made ('coins not gems'), or what their game is. Use scope 'user' for things true of this person across all their projects (preferences, style), and 'project' for facts about this specific place. Do NOT use it for one-off details, things visible from list_children, or a summary of what you just did.",
    input_schema: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description: "One short sentence, written for your future self.",
        },
        scope: {
          type: "string",
          enum: ["project", "user"],
          description: "'project' = this place, 'user' = this person always.",
        },
      },
      required: ["note"],
      additionalProperties: false,
    },
  });

  // Vague requests get ONE multiple-choice question before any building, so
  // the user steers the direction instead of receiving a generic guess.
  tools.push({
    name: "ask_user",
    description:
      "Ask the user ONE multiple-choice question when their request is too vague to build well (e.g. 'make an obby' - lava, classic, or sky themed?). Use this ONLY before you start building, at most once per request, and only when the answer genuinely changes what you would make. Never use it for details you can reasonably decide yourself, and never after you have started building. Give 2-4 short, concrete options that are meaningfully different.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "One short question, e.g. 'What kind of obby?'",
        },
        options: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 4,
          description: "2-4 short, concrete choices (a few words each).",
        },
      },
      required: ["question", "options"],
      additionalProperties: false,
    },
  });

  // Pro-only: real Creator Store models for scenery/props — far better than
  // hand-built parts for organic things like trees.
  if (opts.assetTools) {
    tools.push(
      {
        name: "search_assets",
        description:
          "Search the Roblox Creator Store for FREE models (trees, rocks, furniture, vehicles, buildings). Use this for scenery and props — real models look far better than parts. Returns asset ids for insert_asset. Use short keywords ('pine tree', not sentences).",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Short search keywords." },
            limit: { type: "integer", minimum: 1, maximum: 10 },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        name: "insert_asset",
        description:
          "Insert a free Creator Store model (found with search_assets) into the place. Prefer this over building scenery from parts. The FIRST time you insert a given asset id, the user is automatically shown an Allow/Deny card — you don't need to ask in text; later copies of the same asset need no approval. If denied, build from parts or offer alternatives. Position it with the position property; inspect it afterwards with list_children if you need to modify it.",
        input_schema: {
          type: "object",
          properties: {
            assetId: { type: "integer", description: "Creator Store asset id." },
            parent: { ...ref, description: "Parent (default ref:workspace)." },
            name: { type: "string", description: "Rename the inserted model." },
            position: {
              description:
                'Where to place it: {"$type":"Vector3","value":[x,y,z]}.',
            },
          },
          required: ["assetId"],
          additionalProperties: false,
        },
      },
    );
  }

  // Nano Banana reference images: the agent draws the thing, looks at it, then
  // builds from it. Gated on the key being present so the tool is never
  // offered when it cannot run.
  if (opts.referenceImages) {
    tools.push({
      name: "reference_image",
      description:
        "Draw a reference picture of what you are about to build, then LOOK at it and build to match. Call this ONCE before a build_model call for anything whose appearance matters — a vehicle, building, weapon, creature, prop, piece of furniture. The picture comes back in your next turn and you build from it: match the silhouette, the proportions between parts, the colours, and the details you can see (panel lines, trim, handles, windows). It is a reference drawing, NOT geometry — nothing in it becomes a part, you still build every part yourself with build_model. Describe the object only, in a few words ('rusty 1950s pickup truck', 'stone wizard tower with wooden balcony'), no scene or camera direction.",
      input_schema: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "The object, in a few words. No scene, no camera.",
          },
        },
        required: ["subject"],
        additionalProperties: false,
      },
    });
  }

  // Live web search, run server-side by us (see web-search.ts). Offered as a
  // real tool rather than a provider feature so the call is observable — the
  // chat can show the user what was searched and why.
  if (opts.webSearchTool) {
    tools.push({
      name: "web_search",
      description:
        "Search the live web. ALWAYS call this when the user asks you to search, look something up, or find ideas — you have this tool, so never claim you cannot. Otherwise use it FREELY for inspiration and reference before building anything visual or thematic — what a real version of this looks like, how popular Roblox games do it, colour palettes, layouts, mechanics — and for facts or Roblox APIs you're unsure about. Prefer short English keyword queries ('neon cyberpunk city street', not a sentence). Searching costs the user very little and makes builds dramatically better, so reach for it early rather than guessing.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Short English keywords.",
          },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    });
  }

  // NOTE: a run_luau (arbitrary code execution) tool was intentionally removed
  // — see the plugin. All building goes through the structured tools above.
  return tools;
}
