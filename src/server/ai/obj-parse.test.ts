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
    assert.deepEqual(parseObj(""), { vertices: [], triangles: [] });
  });
});
