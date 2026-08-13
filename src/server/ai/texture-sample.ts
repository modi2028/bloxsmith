import sharp from "sharp";

/**
 * Turn a texture plus per-vertex UVs into per-vertex colours.
 *
 * No `server-only` guard: this holds no secret and touches nothing but the
 * bytes it is handed, and the guard would make the sampling untestable —
 * which, for the one function where an inverted axis silently produces an
 * upside-down model, is the wrong trade.
 *
 * Roblox will not load an image from an external URL, and shipping the pixels
 * to the plugin means EditableImage and a payload measured in tens of
 * kilobytes. Sampling here instead costs one float triple per vertex — the
 * same order as the positions already crossing the wire — and turns a white
 * blob into something recognisably the thing that was drawn.
 *
 * It is not a real texture: there is no normal or specular map, and any
 * detail finer than the vertex spacing is lost. At Meshy's lowpoly densities
 * that reads as a flat-shaded model, which is the right look for Roblox
 * anyway.
 */

export type Rgb = [number, number, number];

/** Anything larger is downsampled before reading — see below. */
const MAX_SAMPLE_EDGE = 1024;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Wrap into 0..1 the way a texture sampler does, so a UV slightly outside the
 * unit square (which exporters emit routinely) lands somewhere sensible
 * instead of being clamped onto the edge pixel.
 */
function wrap01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const wrapped = n % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

export async function sampleTextureAtUvs(
  imageBytes: Uint8Array,
  uvs: ([number, number] | null)[],
  fallback: Rgb = [0.65, 0.65, 0.68],
): Promise<Rgb[]> {
  // Meshy's base colour maps are 2k-4k. Decoding one at full size to read a
  // few thousand pixels is wasted memory: at these polycounts the vertices
  // are far enough apart that the extra resolution samples nothing new.
  const image = sharp(imageBytes).resize({
    width: MAX_SAMPLE_EDGE,
    height: MAX_SAMPLE_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  const { data, info } = await image
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (width === 0 || height === 0) return uvs.map(() => fallback);

  return uvs.map((uv) => {
    if (!uv) return fallback;
    const [u, v] = uv;

    // OBJ's V axis points up from the bottom-left; image rows run down from
    // the top-left. Without the flip the texture is applied upside down,
    // which looks like a bad model rather than a bad index.
    const x = Math.min(width - 1, Math.floor(wrap01(u) * width));
    const y = Math.min(height - 1, Math.floor((1 - wrap01(v)) * height));

    const offset = (y * width + x) * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (r === undefined || g === undefined || b === undefined) return fallback;

    return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255)];
  });
}
