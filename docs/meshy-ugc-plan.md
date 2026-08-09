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

## In-Studio generation staging

Wanted: while a mesh generates, a portal in the workspace — glowing disc on
the ground, dark ring with a progress arc, the reference picture inside it —
and the mesh materialising from it when it lands.

Buildable now, no blockers:

- A `Part` disc (cylinder, thin, Neon, tinted) at the target position, with a
  `SurfaceGui` or dashed edge for the outline.
- A `BillboardGui` above it holding the ring and the arc. The arc is the
  `progress` value already streaming from Meshy — the plugin needs it pushed,
  which means a `mesh_progress` tool call to Studio or a small poll endpoint.
  A queued tool call is the cheaper route: the transport exists.
- On completion, fade the staging out and tween the MeshPart up from inside
  the ring. `build_ugc` already returns the part, so this is a tween on a
  thing that exists.

Blocked on one thing: **the reference picture itself.**

Roblox only renders `rbxassetid://` in an ImageLabel, so the Supabase URL
cannot be shown. Same wall as the mesh, same way through: `EditableImage`
(`AssetService:CreateEditableImage`, then `WritePixelsBuffer`), which needs
raw pixels sent to the plugin rather than a URL.

Sizing matters here. A 256x256 RGBA thumbnail is 262,144 bytes; as a JSON
array of numbers that is megabytes and will not go through the tool queue
sensibly. Downscale to 128x128 server-side and send base64 — ~87KB encoded —
then decode into a buffer in Lua. Verify the queue's payload limit first.

Order: build the staging without the picture (it is most of the effect), then
add EditableImage once the pixel path is measured.

## Why the meshes come out white

Because only geometry is sent. `parseObj` reads `v` and `f` and throws away
`vt` (the UV coordinates), and nothing fetches `texture_urls` at all — so the
EditableMesh is built with positions and triangles and no surface information
whatsoever. White is exactly what that produces. It is not a texture that
failed to load; it is a texture that was never asked for.

The fix that avoids the pixel-transfer problem entirely: **sample the texture
server-side and send per-vertex colours.**

1. `parseObj` also collects `vt` lines and, from each `f v/vt/vn` corner, the
   vertex to UV mapping. (A vertex can carry more than one UV across faces —
   take the first; the error is invisible at these polycounts.)
2. Download `task.texture_urls[0].base_color`.
3. Decode it with `sharp` — already present in node_modules as a transitive
   dependency, so make it a DIRECT dependency before relying on it. `.raw()`
   gives a flat RGB buffer.
4. For each vertex, sample at its UV (`x = u * width`, `y = (1 - v) * height`
   — OBJ's V axis points up, image rows point down; getting this backwards
   flips the texture and is the classic mistake here).
5. Send `colors: [[r,g,b], …]` alongside `vertices`, same length, 0–1 floats.
6. Plugin: `mesh:SetVertexColor(id, Color3.new(r, g, b))` in the same loop
   that calls `AddVertex`.

Cost is one float triple per vertex — the same order as the positions already
being sent, so nothing about the transport changes. It is not a real texture
(no normal map, no specular, and detail below the vertex density is lost), but
it turns a white blob into something recognisably the thing that was drawn,
and it needs no EditableImage and no pixel payload.

Do this BEFORE the staging. A convincing generation animation that resolves
into a white blob is worse than no animation.

## Staging, minus the picture

Everything except the reference image is unblocked and worth doing on its own:

- Thin Neon cylinder at the target position, tinted, with a dashed ring.
- `BillboardGui` above it: dark ring, progress arc driven by the `progress`
  value already streaming from Meshy, subject name under it.
- The plugin needs that number pushed. Cheapest route is a queued
  `mesh_staging` tool call per progress tick — the transport exists and the
  plugin already polls it — rather than a new endpoint or a socket.
- On completion, fade the staging and tween the MeshPart up out of the ring.
  `build_ugc` already returns the part, so this is a tween on something that
  exists.

The picture inside the ring stays blocked on EditableImage and a measured
pixel payload. Build the rest first; it is most of the effect.
