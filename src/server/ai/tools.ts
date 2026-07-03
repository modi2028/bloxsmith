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
    "Property value. Primitives pass through. Rich types use a wrapper: " +
    '{"$type":"Vector3","value":[x,y,z]}, {"$type":"Color3","value":[r,g,b]} (0-1 floats), ' +
    '{"$type":"CFrame","value":[12 numbers]}, {"$type":"UDim2","value":[xScale,xOffset,yScale,yOffset]}, ' +
    '{"$type":"Enum","enum":"Material","item":"Neon"}. Instance references are ref strings.',
};

export function getStudioTools(opts: { runLuau: boolean }): ModelToolDef[] {
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

  if (opts.runLuau) {
    tools.push({
      name: "run_luau",
      description:
        "Execute arbitrary Luau in Studio and return its print output. Last resort for things the other tools cannot express (bulk edits, queries across many instances). Keep snippets short and side-effect-aware.",
      input_schema: {
        type: "object",
        properties: {
          source: { type: "string" },
          timeoutMs: { type: "integer", minimum: 100, maximum: 10000 },
        },
        required: ["source"],
        additionalProperties: false,
      },
    });
  }

  return tools;
}
