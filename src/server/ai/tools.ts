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
  opts: { assetTools?: boolean } = {},
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
        "Create a new instance (Part, Model, Folder, RemoteEvent, etc.) under a parent. Use for everything except scripts — scripts are created with write_script. Set properties in the same call when you know them.",
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

  // NOTE: a run_luau (arbitrary code execution) tool was intentionally removed
  // — see the plugin. All building goes through the structured tools above.
  return tools;
}
