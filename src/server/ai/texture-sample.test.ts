import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { sampleTextureAtUvs } from "./texture-sample";

/** A 2x2 image with a distinct colour per quadrant, so every sample below
 *  identifies exactly which pixel it read. */
async function quadrants(): Promise<Uint8Array> {
  const px = Buffer.from([
    255, 0, 0, /* top-left     red   */ 0, 255, 0, /* top-right    green */
    0, 0, 255, /* bottom-left  blue  */ 255, 255, 0, /* bottom-right yellow */
  ]);
  const png = await sharp(px, { raw: { width: 2, height: 2, channels: 3 } })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

const near = (got: number[], want: number[]) =>
  got.every((n, i) => Math.abs(n - want[i]!) < 0.02);

describe("sampleTextureAtUvs", () => {
  it("flips V — OBJ counts up from the bottom, images count down from the top", async () => {
    // The bug this test exists for: without the flip the texture is applied
    // upside down, which reads as a bad model rather than a bad index.
    const img = await quadrants();
    // v = 1 is the TOP of the texture in OBJ terms.
    const [topLeft] = await sampleTextureAtUvs(img, [[0.25, 0.75]]);
    assert.ok(near(topLeft!, [1, 0, 0]), `top-left was ${topLeft}`);

    const [bottomLeft] = await sampleTextureAtUvs(img, [[0.25, 0.25]]);
    assert.ok(near(bottomLeft!, [0, 0, 1]), `bottom-left was ${bottomLeft}`);
  });

  it("reads the correct quadrant across U as well", async () => {
    const img = await quadrants();
    const [topRight] = await sampleTextureAtUvs(img, [[0.75, 0.75]]);
    assert.ok(near(topRight!, [0, 1, 0]), `top-right was ${topRight}`);

    const [bottomRight] = await sampleTextureAtUvs(img, [[0.75, 0.25]]);
    assert.ok(near(bottomRight!, [1, 1, 0]), `bottom-right was ${bottomRight}`);
  });

  it("returns one colour per uv, in order", async () => {
    const img = await quadrants();
    const out = await sampleTextureAtUvs(img, [
      [0.25, 0.75],
      [0.75, 0.25],
      [0.25, 0.75],
    ]);
    assert.equal(out.length, 3);
    assert.deepEqual(out[0], out[2]);
    assert.notDeepEqual(out[0], out[1]);
  });

  it("falls back for a vertex with no uv rather than shifting the rest", async () => {
    // Alignment matters more than the missing colour: dropping the entry
    // would colour every later vertex with its neighbour's pixel.
    const img = await quadrants();
    const fallback: [number, number, number] = [0.5, 0.5, 0.5];
    const out = await sampleTextureAtUvs(
      img,
      [[0.25, 0.75], null, [0.75, 0.25]],
      fallback,
    );
    assert.equal(out.length, 3);
    assert.deepEqual(out[1], fallback);
    assert.ok(near(out[0]!, [1, 0, 0]));
    assert.ok(near(out[2]!, [1, 1, 0]));
  });

  it("wraps UVs outside the unit square instead of clamping to an edge", async () => {
    // Exporters emit these routinely; 1.25 should mean 0.25, not 1.0.
    const img = await quadrants();
    const [wrapped] = await sampleTextureAtUvs(img, [[1.25, 1.75]]);
    const [plain] = await sampleTextureAtUvs(img, [[0.25, 0.75]]);
    assert.deepEqual(wrapped, plain);

    const [negative] = await sampleTextureAtUvs(img, [[-0.75, 0.75]]);
    assert.deepEqual(negative, plain);
  });

  it("never emits a channel outside 0-1", async () => {
    const img = await quadrants();
    const out = await sampleTextureAtUvs(img, [
      [0, 0],
      [1, 1],
      [0.999, 0.001],
    ]);
    for (const c of out) {
      for (const n of c) assert.ok(n >= 0 && n <= 1, `channel ${n}`);
    }
  });

  it("drops the alpha channel rather than reading it as blue", async () => {
    // An RGBA source has 4 channels; indexing as if it had 3 would smear
    // colours across neighbouring pixels.
    const px = Buffer.from([255, 0, 0, 128, 0, 255, 0, 128]);
    const png = await sharp(px, { raw: { width: 2, height: 1, channels: 4 } })
      .png()
      .toBuffer();
    const out = await sampleTextureAtUvs(new Uint8Array(png), [
      [0.25, 0.5],
      [0.75, 0.5],
    ]);
    assert.ok(near(out[0]!, [1, 0, 0]), `left was ${out[0]}`);
    assert.ok(near(out[1]!, [0, 1, 0]), `right was ${out[1]}`);
  });
});
