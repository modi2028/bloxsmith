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
 * Properties that are NEVER plain strings in Roblox — a string here always
 * means the model forgot the $type wrapper. Failing fast server-side gives
 * corrective feedback without a Studio roundtrip.
 */
const NEVER_STRING_PROPS = new Set([
  "CFrame",
  "Position",
  "Orientation",
  "Rotation",
  "Size",
  "Color",
  "Velocity",
  "AssemblyLinearVelocity",
  "PivotOffset",
]);

function stringValueError(name: string): string {
  return (
    `Invalid arguments: ${name} cannot be a plain string. Use the wrapper format — ` +
    `{"$type":"Vector3","value":[x,y,z]} for Position/Orientation/Size/Velocity, ` +
    `{"$type":"CFrame","value":[12 numbers]} for CFrame, ` +
    `{"$type":"Color3","value":[r,g,b]} (0-1 floats) for Color.`
  );
}

/** Validate model-produced args for a tool; returns a friendly error string. */
export function validateToolArgs(
  tool: string,
  args: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const schema = toolArgSchemas[tool as ToolName];
  if (!schema) return { ok: false, error: `Unknown tool: ${tool}` };
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid arguments: ${issues}` };
  }

  if (tool === "set_property") {
    const a = parsed.data as { name: string; value: unknown };
    if (typeof a.value === "string" && NEVER_STRING_PROPS.has(a.name)) {
      return { ok: false, error: stringValueError(a.name) };
    }
  }
  if (tool === "create_instance") {
    const a = parsed.data as { properties?: Record<string, unknown> };
    for (const [name, value] of Object.entries(a.properties ?? {})) {
      if (typeof value === "string" && NEVER_STRING_PROPS.has(name)) {
        return { ok: false, error: stringValueError(name) };
      }
    }
  }

  return { ok: true, args: parsed.data as Record<string, unknown> };
}
