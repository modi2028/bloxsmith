/**
 * Does this message ask for a generated MESH rather than a part build?
 *
 * Prompt guidance alone did not hold. Told "use generate_model for the hero
 * object, never for anything build_model can make", a model asked for a sword
 * reasons that build_model can obviously make a sword — and hand-builds a box
 * with a cylinder for a grip. The user asked for a mesh and got parts.
 *
 * So the routing is decided here, in code, and pushed into the system prompt
 * as a directive for that turn. Deliberately narrow: it needs the user to
 * have actually said mesh / 3D model / generate, because the cost of a false
 * positive is real — a generation is slow and rate-limited, and spending one
 * on someone who wanted a script is worse than missing the hint.
 */

/** The words that mean "I want Roblox's 3D generator", not "build me a thing". */
const MESH_NOUN = /\b(meshe?s?|mesh ?parts?|3-?d models?|3-?d objects?|3-?d assets?)\b/i;

/**
 * "generate"/"AI-generate" carries the intent on its own — nobody says
 * "generate me a sword" about stacking parts.
 */
const GENERATE_VERB =
  /\b(generate|generated|generating|ai-?generate[ds]?|cube ?3-?d)\b/i;

/**
 * Vocabulary that means they are talking ABOUT meshes rather than asking for
 * one: editing what exists, or wiring logic onto it.
 */
const NOT_A_REQUEST =
  /\b(script|scripts|remote|remoteevent|leaderstats|resize|rescale|delete|remove|rename|move|rotate|anchor|collision|hitbox|weld|texture|material|import|upload|existing|already)\b/i;

const MAX_LENGTH = 400;

export function looksLikeMeshRequest(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > MAX_LENGTH) return false;
  if (NOT_A_REQUEST.test(t)) return false;
  // Either naming the thing ("a sword mesh") or naming the act
  // ("generate me a dragon") is enough on its own.
  return MESH_NOUN.test(t) || GENERATE_VERB.test(t);
}
