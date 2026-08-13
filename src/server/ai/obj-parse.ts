/**
 * OBJ -> the vertex, triangle and UV lists an EditableMesh needs.
 *
 * Only `v`, `vt` and `f` matter. Faces are fanned into triangles because
 * EditableMesh takes triangles only, and OBJ indices are 1-based and may be
 * negative (relative to the end), which is the detail that silently corrupts
 * geometry if it is missed.
 */
export type ParsedObj = {
  vertices: [number, number, number][];
  triangles: [number, number, number][];
  /**
   * One UV per VERTEX, aligned with `vertices`, or null where the file gave
   * none. OBJ indexes positions and UVs separately — a corner is `v/vt` — so
   * this is the join between the two lists, resolved here rather than left
   * for the caller to work out.
   *
   * A vertex can carry different UVs on different faces (that is how a seam
   * is expressed). The first one wins: splitting the vertex to preserve both
   * would change the geometry, and at these polycounts the difference is a
   * pixel of colour on one triangle edge.
   */
  uvs: ([number, number] | null)[];
};

/** "12", "12/3", "12/3/4", "12//4" -> the position and texture indices. */
function faceCorner(chunk: string): { v: number; vt: number | null } {
  const parts = chunk.split("/");
  const v = parseInt(parts[0] ?? "", 10);
  const rawVt = parts[1];
  const vt =
    rawVt != null && rawVt !== "" ? parseInt(rawVt, 10) : Number.NaN;
  return {
    v,
    vt: Number.isFinite(vt) ? vt : null,
  };
}

/** OBJ indices are 1-based; negative counts back from the end of the list. */
function resolveIndex(raw: number, listLength: number): number {
  return raw < 0 ? listLength + raw : raw - 1;
}

export function parseObj(obj: string): ParsedObj {
  const vertices: [number, number, number][] = [];
  const triangles: [number, number, number][] = [];
  /** Every `vt` in file order — the table face corners index into. */
  const texCoords: [number, number][] = [];
  const uvs: ([number, number] | null)[] = [];

  for (const rawLine of obj.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    if (line.startsWith("v ")) {
      const p = line.slice(2).trim().split(/\s+/).map(Number);
      if (p.length >= 3 && p.slice(0, 3).every((n) => Number.isFinite(n))) {
        vertices.push([p[0]!, p[1]!, p[2]!]);
        uvs.push(null);
      }
      continue;
    }

    if (line.startsWith("vt ")) {
      const p = line.slice(3).trim().split(/\s+/).map(Number);
      // A third component (w) is legal and ignored.
      if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        texCoords.push([p[0]!, p[1]!]);
      }
      continue;
    }

    if (line.startsWith("f ")) {
      const corners = line
        .slice(2)
        .trim()
        .split(/\s+/)
        .map(faceCorner)
        .filter((c) => Number.isFinite(c.v))
        .map((c) => ({
          v: resolveIndex(c.v, vertices.length),
          vt: c.vt == null ? null : resolveIndex(c.vt, texCoords.length),
        }));

      // Attach UVs before triangulating: a corner carries its UV whether or
      // not the triangle it lands in survives the bounds check below.
      for (const corner of corners) {
        if (corner.v < 0 || corner.v >= vertices.length) continue;
        if (uvs[corner.v] != null) continue; // first UV wins, see the type
        const uv = corner.vt != null ? texCoords[corner.vt] : undefined;
        if (uv) uvs[corner.v] = uv;
      }

      const idx = corners.map((c) => c.v);
      for (let i = 1; i + 1 < idx.length; i++) {
        const [a, b, c] = [idx[0]!, idx[i]!, idx[i + 1]!];
        if (
          a >= 0 && b >= 0 && c >= 0 &&
          a < vertices.length && b < vertices.length && c < vertices.length
        ) {
          triangles.push([a, b, c]);
        }
      }
    }
  }

  return { vertices, triangles, uvs };
}
