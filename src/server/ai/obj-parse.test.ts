import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseObj } from "./obj-parse";

describe("parseObj", () => {
  it("reads vertices and triangles", () => {
    const r = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    assert.deepEqual(r.vertices, [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
    assert.deepEqual(r.triangles, [[0, 1, 2]]);
  });

  it("converts OBJ's 1-based indices to 0-based", () => {
    // Off by one here silently shears the whole mesh.
    const r = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    assert.ok(r.triangles.every(([a, b, c]) => a >= 0 && b >= 0 && c >= 0));
  });

  it("resolves negative indices against the end", () => {
    const r = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n");
    assert.deepEqual(r.triangles, [[0, 1, 2]]);
  });

  it("fans a quad into two triangles", () => {
    const r = parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n");
    assert.deepEqual(r.triangles, [[0, 1, 2], [0, 2, 3]]);
  });

  it("ignores the texture and normal parts of f v/vt/vn", () => {
    const r = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1/1/1 2/2/2 3/3/3\n");
    assert.deepEqual(r.triangles, [[0, 1, 2]]);
  });

  it("skips comments, blanks and things it does not understand", () => {
    const r = parseObj(
      "# a comment\n\nmtllib x.mtl\nvt 0 0\nvn 0 1 0\nv 0 0 0\nv 1 0 0\nv 0 1 0\ns off\nf 1 2 3\n",
    );
    assert.equal(r.vertices.length, 3);
    assert.deepEqual(r.triangles, [[0, 1, 2]]);
  });

  it("drops a face that points outside the vertex list", () => {
    // A truncated download must not produce geometry that crashes Studio.
    const r = parseObj("v 0 0 0\nv 1 0 0\nf 1 2 99\n");
    assert.deepEqual(r.triangles, []);
  });

  it("survives an empty file", () => {
    assert.deepEqual(parseObj(""), { vertices: [], triangles: [], uvs: [] });
  });
});

describe("parseObj UVs", () => {
  it("joins each vertex to the UV its face corner names", () => {
    // OBJ indexes positions and UVs separately; f is where they meet.
    const r = parseObj(
      [
        "v 0 0 0",
        "v 1 0 0",
        "v 0 1 0",
        "vt 0.1 0.2",
        "vt 0.3 0.4",
        "vt 0.5 0.6",
        "f 1/1 2/2 3/3",
      ].join("\n"),
    );
    assert.deepEqual(r.uvs, [
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]);
  });

  it("does not assume vt order matches v order", () => {
    // The whole point of the join: corner 1 uses the THIRD vt.
    const r = parseObj(
      ["v 0 0 0", "v 1 0 0", "v 0 1 0", "vt 0 0", "vt 0 1", "vt 1 1", "f 1/3 2/2 3/1"].join("\n"),
    );
    assert.deepEqual(r.uvs, [
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });

  it("handles v//vn, which has no texture index", () => {
    const r = parseObj(
      ["v 0 0 0", "v 1 0 0", "v 0 1 0", "vn 0 1 0", "f 1//1 2//1 3//1"].join("\n"),
    );
    assert.deepEqual(r.uvs, [null, null, null]);
    assert.deepEqual(r.triangles, [[0, 1, 2]]);
  });

  it("keeps uvs aligned with vertices even when some have none", () => {
    // Alignment is the contract the sampler relies on — a short or shifted
    // array would colour the wrong vertices rather than failing.
    const r = parseObj(
      ["v 0 0 0", "v 1 0 0", "v 0 1 0", "v 1 1 0", "vt 0 0", "f 1/1 2 3"].join("\n"),
    );
    assert.equal(r.uvs.length, r.vertices.length);
    assert.deepEqual(r.uvs[0], [0, 0]);
    assert.equal(r.uvs[3], null);
  });

  it("resolves negative texture indices from the end", () => {
    const r = parseObj(
      ["v 0 0 0", "v 1 0 0", "v 0 1 0", "vt 0 0", "vt 0 1", "vt 1 1", "f 1/-3 2/-2 3/-1"].join("\n"),
    );
    assert.deepEqual(r.uvs, [
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
  });

  it("takes the first UV when a seam gives a vertex two", () => {
    const r = parseObj(
      [
        "v 0 0 0", "v 1 0 0", "v 0 1 0", "v 1 1 0",
        "vt 0 0", "vt 0.9 0.9",
        "f 1/1 2/1 3/1",
        "f 1/2 3/2 4/2",
      ].join("\n"),
    );
    assert.deepEqual(r.uvs[0], [0, 0]);
  });

  it("ignores the optional third component of vt", () => {
    const r = parseObj(["v 0 0 0", "vt 0.25 0.75 0", "f 1/1 1/1 1/1"].join("\n"));
    assert.deepEqual(r.uvs[0], [0.25, 0.75]);
  });
});
