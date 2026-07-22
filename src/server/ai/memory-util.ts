/**
 * Note-list maintenance for AI memory. Split out from memory.ts so it can be
 * unit-tested without a database connection.
 */
export function appendNoteForTest(
  existing: string | null,
  note: string,
  cap: number,
): string {
  return appendNote(existing, note, cap);
}

export function appendNote(
  existing: string | null,
  note: string,
  cap: number,
): string {
  const line = `- ${note.replace(/\s+/g, " ").trim()}`;
  const lines = (existing ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Don't store the same fact twice.
  if (lines.some((l) => l.toLowerCase() === line.toLowerCase())) {
    return lines.join("\n");
  }
  lines.push(line);
  // Oldest notes fall off the top once the cap is hit.
  let out = lines.join("\n");
  while (out.length > cap && lines.length > 1) {
    lines.shift();
    out = lines.join("\n");
  }
  return out;
}
