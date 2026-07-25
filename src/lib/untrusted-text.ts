/**
 * Neutralising text that arrives from outside the conversation.
 *
 * Anything fetched — web search results today, anything else later — is DATA,
 * but it reaches the model through the same channel as real instructions. The
 * system prompt already tells the model to ignore commands found in fetched
 * content; this is the belt to that pair of braces, because a prompt rule is
 * only as good as the model's willingness to follow it.
 *
 * Kept out of server-only modules so it can be unit tested directly.
 */

/**
 * Phrasings whose only purpose in fetched content is to address the model. A
 * page legitimately discussing Roblox building has no reason to say "ignore
 * previous instructions" — that is prompt injection arriving as data.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // The optional article matters: "disregard THE above rules" is the natural
  // phrasing and slipped straight through without it.
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,
  /disregard\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\s+\w+/gi,
  /forget\s+(everything|all)\s+(you|above|before)\b/gi,
  /you\s+are\s+now\s+(a|an|no longer)\b/gi,
  /\b(system|developer)\s*(prompt|message|instruction)s?\s*[:>]/gi,
  /<\|?\s*im_(start|end)\s*\|?>/gi,
  /\[\s*\/?\s*(system|inst|assistant)\s*\]/gi,
  /\bnew\s+instructions?\s*[:>]/gi,
  /\byour\s+(real|true|actual)\s+(instructions?|task|goal)\s+(is|are)\b/gi,
];

/**
 * Redact instruction-shaped phrasing from untrusted text.
 *
 * Redacts rather than dropping the whole passage: one poisoned sentence
 * shouldn't be able to blank a legitimate result, and the surrounding text is
 * usually the part the model actually wanted.
 */
export function redactInjection(text: string): string {
  let out = text;
  for (const re of INJECTION_PATTERNS) out = out.replace(re, "[filtered]");
  return out;
}
