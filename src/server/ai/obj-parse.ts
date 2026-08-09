/**
 * OBJ -> the vertex and triangle lists an EditableMesh needs.
 *
 * Only `v`, `vt` and `f` matter. Faces are fanned into triangles because
 * EditableMesh takes triangles only, and OBJ indices are 1-based and may be
 * negative (relative to the end), which is the detail that silently corrupts
 * geometry if it is missed.
 */
export function parseObj(obj: string): {
  vertices: [number, number, number][];
  triangles: [number, number, number][];
} {
  const vertices: [number, number, number][] = [];
  const triangles: [number, number, number][] = [];

  for (const rawLine of obj.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    if (line.startsWith("v ")) {
      const p = line.slice(2).trim().split(/\s+/).map(Number);
      if (p.length >= 3 && p.slice(0, 3).every((n) => Number.isFinite(n))) {
        vertices.push([p[0]!, p[1]!, p[2]!]);
      }
      continue;
    }

    if (line.startsWith("f ")) {
      const idx = line
        .slice(2)
        .trim()
        .split(/\s+/)
        // "f v/vt/vn" — only the vertex index is needed.
        .map((chunk) => parseInt(chunk.split("/")[0]!, 10))
        .filter((n) => Number.isFinite(n))
        // 1-based, and negative means "counting back from the end".
        .map((n) => (n < 0 ? vertices.length + n : n - 1));

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

  return { vertices, triangles };
}
