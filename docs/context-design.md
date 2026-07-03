# Model context design

What the model sees on every turn, and why. Goal: the model should feel like a
pair-builder sitting inside the user's Studio session — aware of the place,
the selection, and the project's history — without blowing the context window
or the user's credits.

## Context layers (rendered in this order)

Stable content first, volatile content last — this ordering makes prompt
caching effective (the system prompt + tool definitions form a stable cached
prefix; per-turn Studio state is appended at the end).

### 1. System prompt (stable, cached)

- Product persona: expert Roblox engineer pair-building live in the user's
  open Studio session; changes apply immediately and are undoable.
- Studio ground rules: idiomatic Luau, prefer `ModuleScript`s for shared
  logic, correct service placement (server logic in `ServerScriptService`,
  shared assets in `ReplicatedStorage`), never assume an instance exists —
  query first; respect the ref system.
- Tool usage guidance with *when-to-call* trigger conditions per tool
  (prescriptive descriptions measurably improve tool selection).
- Communication style: brief progress narration between tool calls; end each
  turn with what was built and how to test it in Studio.

### 2. Tool definitions (stable, cached)

The v1 tool set (see `tool-contract.md`) in the provider's native schema
format. Deterministically ordered (sorted by name) so the cache prefix never
churns.

### 3. Project context (per-session, slowly changing)

- **Project memory** (`chat_sessions.project_memory`): a rolling,
  model-maintained note — key decisions, naming conventions, where things
  live ("weapons are ModuleScripts under RS/Combat/Weapons"). The loop asks
  the model to update it after significant builds; it is injected as a
  `<project_memory>` block. This is what makes turn 30 as grounded as turn 3
  without replaying 29 turns of tool calls.
- **Ref table digest**: refs the session already established, with names and
  classes, so the model can reuse handles instead of re-listing.

### 4. Studio snapshot (per-turn, volatile)

Collected by the plugin at turn start via a single `get_context` poll
piggyback (no extra round-trip): current selection (refs + classes + names),
place name, and a capped hierarchy digest of the service roots (top 2 levels,
max ~80 nodes, child counts for the rest). Injected as a `<studio_state>`
block in the user turn. Capped hard — the model can always drill deeper with
`list_children`.

### 5. Conversation history (per-turn)

- Prior turns' text + tool_use/tool_result blocks, replayed from
  `chat_messages.content`.
- **Tool-result pruning**: results older than the last 2 assistant turns are
  collapsed to one-line summaries ("listed 14 children of ref:i_9c2") — the
  full JSON stays in the DB, not in the prompt. Long sessions compact the
  oldest turns into a summary block appended to project memory.

### 6. User turn (volatile)

The message text plus any drag-and-dropped **reference images** as native
image blocks (both Claude and Gemini accept them). Images count toward input
tokens and therefore credits — attachment size/count caps
(`max_attachment_bytes`, 4 images) keep a single turn's cost bounded.

## Budgets

| Piece                     | Cap                                   |
| ------------------------- | ------------------------------------- |
| Studio hierarchy digest   | ~2K tokens (80 nodes)                 |
| Project memory            | ~1.5K tokens (model told to keep it tight) |
| Replayed history          | ~40K tokens before compaction kicks in |
| Reference images          | 4 per message, 5 MB each (setting)    |

## Why not "send the whole DataModel"

A real place is millions of tokens. The pattern above (small stable digest +
on-demand `list_children` / `get_properties` drilling) keeps turns cheap,
makes caching work, and — because refs are validated live — degrades
gracefully when the user edits the place between turns.
