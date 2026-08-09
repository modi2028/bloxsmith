# Meshy UGC generator — plan

Researched 2026-08-09 against the live Meshy docs. Not yet built.

## What the API actually gives us

Two endpoints matter, and they are shaped differently.

**Image to 3D** — `POST https://api.meshy.ai/openapi/v1/image-to-3d`

Single stage. No preview/refine cycle. The important detail: **`image_url`
accepts a base64 data URI**, not just a public URL. That is the whole
integration, because it means Nano Banana's output goes straight in with no
hosting step between them:

```
prompt → Nano Banana (base64 PNG) → Meshy image-to-3d → mesh
```

**Text to 3D** — `POST https://api.meshy.ai/openapi/v2/text-to-3d`

Two stages: `mode: "preview"` for geometry, then `mode: "refine"` with the
preview's `preview_task_id` for texture. Slower and twice the round trips, so
image-to-3d is the primary path and this is the fallback when the user gives
a prompt and does not want a reference image step.

**Both take the polycount control this feature is about:**

| field | values | note |
|---|---|---|
| `target_polycount` | 100–300,000 (default 30,000) | the LOD dial |
| `model_type` | `standard`, `lowpoly`, `smart-topology` | `lowpoly` for UGC |
| `topology` | `quad` or `triangle` | triangle for Roblox |
| `target_formats` | glb, obj, fbx, stl, usdz, 3mf | **ask for obj** |

Polling: `GET /openapi/v2/text-to-3d/:id` or the SSE stream at `/:id/stream`.
Status goes `PENDING → IN_PROGRESS → SUCCEEDED | FAILED | CANCELED`, with
`progress` 0–100 — that progress number is what drives the "watch it being
made" animation in Studio.

Result carries `model_urls` (per format), `texture_urls`, `thumbnail_url` and
`consumed_credits`. 402 means out of credits, 429 means rate limited.

## The one unresolved blocker

**A Roblox plugin cannot make a MeshPart from an external URL.** Meshy hands
back a `.obj`/`.glb` on its own CDN and Roblox will not load it. This has to
be settled before anything else is built, because it decides the whole shape
of the feature.

Two candidate routes:

1. **EditableMesh (preferred).** `AssetService:CreateEditableMesh()` lets a
   plugin build geometry from raw vertices and triangles in Lua. Request
   `obj` from Meshy — it is plain text and trivial to parse — fetch it
   through our own backend, hand the vertex/face lists to the plugin, and
   construct the mesh in Studio. No Open Cloud, no upload, no moderation
   queue. Same Editable Mesh/Image permission the user already has to enable
   for `generate_model`, so no new setup for them.
2. **Open Cloud asset upload.** Upload the mesh to Roblox as an asset, wait
   for moderation, insert by id. Needs a per-user Roblox API key and a
   moderation wait. Much worse UX; only worth it if (1) turns out not to work.

**Verify (1) first.** Everything below assumes it does.

## Shape of the build

**Server**

- `src/server/ai/meshy.ts` — submit + poll, mirroring `nano-banana.ts`.
  `MESHY_API_KEY` env, and the tool is hidden entirely when it is unset (same
  rule as `reference_image`).
- New tool `generate_ugc`, **Max only**. Gate it the way `assetTools` is
  gated in `loop.ts`, not by a plan check inside the tool.
- Cost: every call is billed Meshy credits and does NOT pass through the token
  meter. Same leak `reference_image` had on free. Needs its own per-user
  counter — a daily cap on Max is probably the right ceiling, decided from
  Meshy's per-generation credit cost.
- Reuse `generateReferenceImage` for the image step. It already returns base64
  in exactly the form `image_url` wants.

**Plugin**

- New handler `build_ugc`: take the parsed geometry, build the EditableMesh,
  parent it, anchor it (generated parts arrive unanchored — the same trap
  `generate_model` hit).
- Progress: Meshy's `progress` field streams to the plugin so the object can
  visibly assemble rather than popping in finished.

**The wheel UI** (the Milo-style radial in the reference)

- A `ScreenGui` in the plugin widget, opened by a toolbar button and a keybind
  (`PluginAction` + `ContextActionService`).
- Segments: **LOD**, Edit 3D, Rig, Code, Controls, Save, More.
- LOD opens a slider bound to `target_polycount`. Changing it re-runs
  image-to-3d with the same `image_url` and a new polycount — cheap compared
  to regenerating from a prompt, and it is why we keep the reference image
  around after the first generation.
- Keep the segment geometry data-driven; seven hardcoded rotated frames will
  not survive the first design change.

## Order to build it

1. Prove EditableMesh can render a parsed OBJ in a plugin. Nothing else
   matters until this works.
2. `meshy.ts` + `generate_ugc`, Max-gated, no UI — driven from chat, result
   into the workspace.
3. Spend ceiling before it goes near real users.
4. The wheel UI and the LOD slider on top of the working pipeline.
5. Progress animation last — it is polish, and it needs the pipeline stable
   to have anything to animate.
