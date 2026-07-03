# Tool-call contract — v1

The JSON contract between the backend agent loop and the Studio plugin. Both
sides carry `v: 1` on every payload so either can evolve independently; a
plugin seeing an unknown major version must refuse the call with
`code: "unsupported_version"` instead of guessing.

## Transport

| Direction         | Endpoint                  | Auth                          |
| ----------------- | ------------------------- | ----------------------------- |
| plugin ← backend  | `GET /api/plugin/poll`    | `Authorization: Bearer <plugin token>` |
| plugin → backend  | `POST /api/plugin/results`| same                          |
| pairing           | `POST /api/plugin/pair`   | body: `{ code }` → `{ token }` |

The plugin polls every ~1s while Studio is open (well within HttpService
budgets). `poll` returns `{ calls: ToolCall[] }` — zero or more pending calls,
oldest first. Every poll also refreshes `last_seen` (drives the site's
"plugin connected" badge).

## Envelopes

```jsonc
// ToolCall (backend -> plugin)
{
  "v": 1,
  "id": "tc_01H...",            // tool_call_queue.id
  "tool": "create_instance",
  "args": { /* tool-specific, see below */ },
  "deadline": "2026-07-03T12:00:30Z"
}

// ToolResult (plugin -> backend)
{
  "v": 1,
  "id": "tc_01H...",
  "ok": true,
  "value": { /* tool-specific */ },
  "durationMs": 42
}

// or on failure
{
  "v": 1,
  "id": "tc_01H...",
  "ok": false,
  "error": { "code": "not_found", "message": "ref:i_7f3a no longer exists" }
}
```

Error codes: `not_found`, `invalid_args`, `forbidden_class`,
`script_error`, `timeout`, `unsupported_version`, `internal`.

## Instance refs

The model never sees raw instance paths. The plugin mints opaque handles
(`ref:i_<short-id>`) for every instance it returns and keeps a
session-scoped registry (`ref -> Instance`). Well-known roots are predefined:
`ref:workspace`, `ref:replicated_storage`, `ref:server_script_service`,
`ref:server_storage`, `ref:starter_gui`, `ref:starter_player`,
`ref:lighting`, `ref:selection` (current selection as a group).

If a ref has been destroyed, tools answer `not_found` and the loop lets the
model re-query — this keeps stale-context bugs recoverable.

## Tools (MVP set)

| Tool             | args                                              | value                                   |
| ---------------- | ------------------------------------------------- | --------------------------------------- |
| `get_selection`  | `{}`                                              | `{ items: [{ ref, className, name }] }` |
| `list_children`  | `{ parent, depth? (1..3, default 1) }`            | `{ items: [{ ref, className, name, childCount }] }` |
| `get_properties` | `{ target, names?: string[] }`                    | `{ properties: { [name]: JsonValue } }` |
| `create_instance`| `{ className, parent, properties?, name? }`       | `{ ref }`                               |
| `set_property`   | `{ target, name, value }`                         | `{}`                                    |
| `write_script`   | `{ target? OR { parent, name, scriptType } , source }` | `{ ref, lineCount }`               |
| `delete_instance`| `{ target }`                                      | `{}`                                    |
| `run_luau`       | `{ source, timeoutMs? }` — **off by default**     | `{ output: string[] }`                  |

Notes:

- `properties` values use a JSON encoding for Roblox types:
  `{"$type":"Vector3","value":[0,5,0]}`, `Color3` as `[r,g,b]` floats,
  `CFrame` as 12 numbers, `EnumItem` as `{"$type":"Enum","enum":"Material","item":"Neon"}`,
  `Instance` references as `"ref:..."` strings.
- `write_script` with `scriptType`: `"Script" | "LocalScript" | "ModuleScript"`.
- Every mutating tool runs inside a `ChangeHistoryService:TryBeginRecording`
  block so each AI action is one undo step in Studio.
- `run_luau` executes only when the global setting **and** the per-user flag
  allow it; args echo is stored for audit.

## Queue semantics

- Backend inserts calls with a `deadline_at` (default now + 30s). The agent
  loop awaits the result; on deadline it marks the row `expired` and feeds a
  `timeout` error result to the model.
- `poll` atomically flips `pending -> claimed` on rows it returns (so two
  Studio instances of the same user don't double-execute).
- `results` accepts only rows in `claimed` status that belong to the token's
  user; late results for `expired` rows are recorded but ignored by the loop.
