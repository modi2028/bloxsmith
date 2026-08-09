import { z } from "zod";

/**
 * Tool-call contract v1 — the shared language between the backend agent loop
 * and the Studio plugin. See docs/tool-contract.md for the full spec.
 * Everything crossing that boundary validates against these schemas.
 */
export const CONTRACT_VERSION = 1;

/** Opaque instance handle minted by the plugin, plus well-known roots. */
export const refSchema = z
  .string()
  .regex(/^ref:[a-z0-9_]+$/i, "Expected an instance ref like 'ref:i_abc123'");

export const WELL_KNOWN_REFS = [
  "ref:workspace",
  "ref:replicated_storage",
  "ref:server_script_service",
  "ref:server_storage",
  "ref:starter_gui",
  "ref:starter_player",
  "ref:lighting",
  "ref:selection",
] as const;

/**
 * JSON encoding for Roblox property values. Primitives pass through; rich
 * types use a `$type` wrapper; instance references are ref strings.
 */
export const propertyValueSchema: z.ZodType<unknown> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({
    $type: z.enum([
      "Vector3",
      "Vector2",
      "Color3",
      "CFrame",
      "UDim2",
      "UDim",
      "Rect",
    ]),
    value: z.array(z.number()),
  }),
  z.object({
    $type: z.literal("Enum"),
    enum: z.string(),
    item: z.string(),
  }),
  z.object({
    $type: z.literal("BrickColor"),
    value: z.string(),
  }),
  z.object({
    // Constant `n`, or [min, max].
    $type: z.literal("NumberRange"),
    value: z.union([z.number(), z.array(z.number())]),
  }),
  z.object({
    // Constant `n`, or keypoints [[time, value, envelope?], ...] (0..1).
    $type: z.literal("NumberSequence"),
    value: z.union([z.number(), z.array(z.array(z.number()))]),
  }),
  z.object({
    // Constant [r,g,b], or keypoints [[time, [r,g,b]], ...] (0..1).
    $type: z.literal("ColorSequence"),
    value: z.union([
      z.array(z.number()),
      z.array(z.tuple([z.number(), z.array(z.number())])),
    ]),
  }),
]);

const propertiesRecord = z.record(z.string(), propertyValueSchema);

/**
 * One part inside a build_model call.
 *
 * `position` is relative to the model's origin and `rotation` is degrees on
 * each axis — both chosen over a raw CFrame because a 12-number matrix is the
 * single thing models get wrong most often, and getting it wrong means the
 * build silently falls apart rather than failing loudly.
 */
const modelPartSchema = z
  .object({
    name: z.string().min(1).max(60),
    className: z.string().min(1).max(40).optional(),
    shape: z.enum(["Block", "Ball", "Cylinder", "Wedge", "CornerWedge"]).optional(),
    size: z.array(z.number()).length(3),
    position: z.array(z.number()).length(3),
    rotation: z.array(z.number()).length(3).optional(),
    color: z.array(z.number().min(0).max(1)).length(3).optional(),
    material: z.string().max(40).optional(),
    transparency: z.number().min(0).max(1).optional(),
    anchored: z.boolean().optional(),
    // Anything the shorthand above does not cover.
    properties: propertiesRecord.optional(),
  })
  .strict();

/**
 * A solid-modelling step, run after every part exists. Parts are addressed by
 * their `name` within the same call — refs do not exist yet at authoring time.
 */
const csgOpSchema = z
  .object({
    action: z.enum(["union", "subtract"]),
    // subtract only: the solid being cut.
    base: z.string().min(1).max(60).optional(),
    parts: z.array(z.string().min(1).max(60)).min(1).max(20),
    name: z.string().min(1).max(60).optional(),
  })
  .strict();

// --- Per-tool argument schemas (what the model produces) -------------------

export const toolArgSchemas = {
  get_selection: z.object({}).strict(),
  list_children: z
    .object({
      parent: refSchema,
      depth: z.number().int().min(1).max(3).optional(),
    })
    .strict(),
  get_properties: z
    .object({
      target: refSchema,
      names: z.array(z.string()).max(50).optional(),
    })
    .strict(),
  create_instance: z
    .object({
      className: z.string().min(1),
      parent: refSchema,
      name: z.string().optional(),
      properties: propertiesRecord.optional(),
    })
    .strict(),
  set_property: z
    .object({
      target: refSchema,
      name: z.string().min(1),
      value: propertyValueSchema,
    })
    .strict(),
  write_script: z
    .object({
      target: refSchema.optional(),
      parent: refSchema.optional(),
      name: z.string().optional(),
      scriptType: z.enum(["Script", "LocalScript", "ModuleScript"]).optional(),
      source: z.string().max(200_000),
    })
    .strict()
    .refine((v) => v.target || (v.parent && v.name && v.scriptType), {
      message:
        "Provide either target (existing script) or parent+name+scriptType (new script)",
    }),
  delete_instance: z.object({ target: refSchema }).strict(),
  // Server-side Creator Store search (never reaches the plugin).
  search_assets: z
    .object({
      query: z.string().min(1).max(120),
      limit: z.number().int().min(1).max(10).optional(),
    })
    .strict(),
  // Server-side live web search (never reaches the plugin). A tool missing
  // from this table is rejected as "Unknown tool", which the model reports to
  // the user as the feature being unavailable — so anything added to
  // getStudioTools must be added here too.
  web_search: z
    .object({
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(10).optional(),
    })
    .strict(),
  insert_asset: z
    .object({
      assetId: z.number().int().positive(),
      parent: refSchema.optional(),
      name: z.string().max(80).optional(),
      position: propertyValueSchema.optional(),
    })
    .strict(),
  run_luau: z
    .object({
      source: z.string().max(50_000),
      timeoutMs: z.number().int().min(100).max(10_000).optional(),
    })
    .strict(),
  // User-initiated only (the "Revert this build" button) — never offered to
  // the model. Undoes `steps` Studio history waypoints.
  revert_build: z
    .object({ steps: z.number().int().min(1).max(200) })
    .strict(),
  // Server-side: save a durable note so later sessions know it. Never
  // Build a whole model in ONE call.
  //
  // The point of this tool is that it is bulk AND that it lets the model
  // think in the shape's own space: every part's position is relative to the
  // model origin and rotation is three plain degrees, so the model is not
  // hand-computing world CFrames per part. One call per model also means one
  // undo waypoint, which is what a user expects "undo the tree" to do.
  build_model: z
    .object({
      name: z.string().min(1).max(60),
      parent: refSchema,
      origin: z.array(z.number()).length(3).optional(),
      parts: z.array(modelPartSchema).min(1).max(150),
      csg: z.array(csgOpSchema).max(40).optional(),
    })
    .strict(),
  // Roblox's own text-to-3D (Cube 3D), run inside Studio by the plugin.
  generate_model: z
    .object({
      prompt: z.string().trim().min(3).max(200),
      // Roblox only ships two predefined schemas today.
      schema: z.enum(["Body1", "Car5"]).optional(),
      parent: refSchema.optional(),
      name: z.string().min(1).max(60).optional(),
      position: z.array(z.number()).length(3).optional(),
    })
    .strict(),
  // Meshy: a real generated mesh, rebuilt in Studio as an EditableMesh. The
  // server does the generating and the plugin does the building, so this
  // schema is what the MODEL writes; build_ugc below is what the plugin gets.
  generate_ugc: z
    .object({
      subject: z.string().trim().min(3).max(200),
      // The LOD dial. Low numbers are the point — UGC lives on poly budget.
      polycount: z.number().int().min(100).max(300_000).optional(),
      parent: refSchema.optional(),
      name: z.string().min(1).max(60).optional(),
      position: z.array(z.number()).length(3).optional(),
    })
    .strict(),
  // Plugin-facing: geometry, already parsed. Never written by a model — the
  // loop synthesises it from Meshy's OBJ, which is why the vertex and
  // triangle arrays have no practical size limit here.
  build_ugc: z
    .object({
      name: z.string().min(1).max(60),
      parent: refSchema.optional(),
      position: z.array(z.number()).length(3).optional(),
      vertices: z.array(z.array(z.number()).length(3)),
      triangles: z.array(z.array(z.number().int().nonnegative()).length(3)),
      /** Studs along the longest axis. Meshy works in arbitrary units. */
      scale: z.number().positive().max(500).optional(),
      /** Stamped on the part so the LOD wheel can regenerate it. */
      subject: z.string().max(200).optional(),
      polycount: z.number().int().min(100).max(300_000).optional(),
      /** Replace this part in place — an LOD change, not a second copy. */
      replaceRef: refSchema.optional(),
    })
    .strict(),
  // Server-side: draw a reference picture the model then looks at. Never
  // reaches the plugin.
  reference_image: z
    .object({
      subject: z.string().trim().min(3).max(200),
    })
    .strict(),
  // reaches the plugin.
  remember: z
    .object({
      note: z.string().trim().min(3).max(300),
      scope: z.enum(["project", "user"]).default("project"),
    })
    .strict(),
  // Server-side: ask the user one multiple-choice question when the request
  // is too vague to build well. Never reaches the plugin.
  ask_user: z
    .object({
      question: z.string().min(3).max(200),
      options: z.array(z.string().min(1).max(60)).min(2).max(4),
    })
    .strict(),
} as const;

export type ToolName = keyof typeof toolArgSchemas;
export const TOOL_NAMES = Object.keys(toolArgSchemas) as ToolName[];

// --- Wire envelopes ---------------------------------------------------------

/** backend -> plugin */
export const toolCallEnvelopeSchema = z.object({
  v: z.literal(CONTRACT_VERSION),
  id: z.string(),
  tool: z.enum(TOOL_NAMES as [ToolName, ...ToolName[]]),
  args: z.record(z.string(), z.unknown()),
  deadline: z.string(), // ISO timestamp
});
export type ToolCallEnvelope = z.infer<typeof toolCallEnvelopeSchema>;

export const toolErrorCodes = [
  "not_found",
  "invalid_args",
  "forbidden_class",
  "script_error",
  "timeout",
  "unsupported_version",
  "internal",
] as const;

/** plugin -> backend */
export const toolResultEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({
    v: z.literal(CONTRACT_VERSION),
    id: z.string(),
    ok: z.literal(true),
    value: z.unknown(),
    durationMs: z.number().nonnegative().optional(),
  }),
  z.object({
    v: z.literal(CONTRACT_VERSION),
    id: z.string(),
    ok: z.literal(false),
    error: z.object({
      code: z.enum(toolErrorCodes),
      message: z.string().max(2000),
    }),
    durationMs: z.number().nonnegative().optional(),
  }),
]);
export type ToolResultEnvelope = z.infer<typeof toolResultEnvelopeSchema>;

/**
 * Geometric/vector property names are NEVER plain strings in Roblox — a
 * string here always means the model forgot the $type wrapper. Matched by
 * suffix so it covers the whole family (Position, GripPos, PivotOffset,
 * AssemblyLinearVelocity, BackgroundColor3, …) without a hand-kept list.
 */
const GEOMETRIC_PROP_RE =
  /(CFrame|Position|Orientation|Rotation|Size|Velocity|Offset|Pivot|Color3|Color|Pos|Up|Right|Forward|Extents)$/;

function stringValueError(name: string): string {
  return (
    `Invalid arguments: ${name} cannot be a plain string. Use the wrapper format — ` +
    `{"$type":"Vector3","value":[x,y,z]} for positions/orientations/sizes/velocities, ` +
    `{"$type":"CFrame","value":[12 numbers]} for CFrames, ` +
    `{"$type":"Color3","value":[r,g,b]} (0-1 floats) for colors, ` +
    `{"$type":"BrickColor","value":"Bright red"} for BrickColor, ` +
    `{"$type":"Enum","enum":"AutomaticSize","item":"XY"} for enum properties.`
  );
}

/**
 * Un-stringify property wrappers the model double-encoded.
 *
 * Models are told to write {"$type":"Enum","enum":"Material","item":"Neon"}
 * and a good fraction of the time they write that object as a JSON STRING
 * instead. Postgres, the queue and zod all pass it along happily —
 * propertyValueSchema accepts strings, because plenty of properties really
 * are strings — and it dies in Studio as `Invalid value "{"$type": "Enum"...`.
 * The model then retries the identical call, because nothing told it what was
 * wrong, and burns the budget doing it. That is the loop in the screenshot.
 *
 * The intent is unambiguous, so this repairs rather than rejects: a string
 * that parses to an object carrying `$type` was meant to be that object.
 * Anything else is left exactly as it is — a genuine string property must
 * survive untouched.
 */
function repairWrappers(value: unknown): unknown {
  if (typeof value === "string") {
    const t = value.trim();
    if (!t.startsWith('{"$type"') && !t.startsWith("{ \"$type\"")) return value;
    try {
      const parsed: unknown = JSON.parse(t);
      if (parsed && typeof parsed === "object" && "$type" in parsed) {
        return parsed;
      }
    } catch {
      // Not JSON after all; it was just a string that looked like it.
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(repairWrappers);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        repairWrappers(v),
      ]),
    );
  }
  return value;
}

/** Validate model-produced args for a tool; returns a friendly error string. */
export function validateToolArgs(
  tool: string,
  args: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const schema = toolArgSchemas[tool as ToolName];
  if (!schema) return { ok: false, error: `Unknown tool: ${tool}` };
  // Before validation, not after: a double-encoded wrapper is valid against
  // the schema (it is a string), so there is no later point at which it can
  // be caught.
  const parsed = schema.safeParse(repairWrappers(args));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid arguments: ${issues}` };
  }

  if (tool === "set_property") {
    const a = parsed.data as unknown as { name: string; value: unknown };
    if (typeof a.value === "string" && GEOMETRIC_PROP_RE.test(a.name)) {
      return { ok: false, error: stringValueError(a.name) };
    }
  }
  if (tool === "create_instance") {
    const a = parsed.data as unknown as {
      properties?: Record<string, unknown>;
    };
    for (const [name, value] of Object.entries(a.properties ?? {})) {
      if (typeof value === "string" && GEOMETRIC_PROP_RE.test(name)) {
        return { ok: false, error: stringValueError(name) };
      }
    }
  }

  // build_model carries the same escape hatch per part, so it can be got
  // wrong the same way — and there it is worse, because one bad string in a
  // sixty-part call would land most of the model correctly and one part in
  // the wrong place.
  if (tool === "build_model") {
    const a = parsed.data as unknown as {
      parts: { name: string; properties?: Record<string, unknown> }[];
    };
    for (const part of a.parts) {
      for (const [name, value] of Object.entries(part.properties ?? {})) {
        if (typeof value === "string" && GEOMETRIC_PROP_RE.test(name)) {
          return { ok: false, error: `${part.name}: ${stringValueError(name)}` };
        }
      }
    }
  }

  return { ok: true, args: parsed.data as Record<string, unknown> };
}
