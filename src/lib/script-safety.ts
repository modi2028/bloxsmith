/**
 * Safety screen for Luau the AI is about to write into someone's place.
 *
 * This is not about taste — it is about not shipping a backdoor. A script
 * that fetches and runs remote code, or hands a named player god powers, is
 * indistinguishable from the backdoors that get Roblox games defaced and
 * their owners banned. The user asked for a game, not a liability, so these
 * are refused even when the request sounded innocent.
 */

export type ScriptRisk = { blocked: true; reason: string } | { blocked: false };

const PATTERNS: { re: RegExp; reason: string }[] = [
  {
    // Remote code execution — the classic Roblox backdoor.
    re: /\bloadstring\s*\(/i,
    reason:
      "loadstring, which runs code fetched at runtime — this is how game backdoors work",
  },
  {
    // require(123456) pulls an arbitrary model's code into the game.
    re: /\brequire\s*\(\s*\d{6,}\s*\)/,
    reason:
      "require() on a raw asset id, which runs someone else's code inside your game",
  },
  {
    re: /\bHttpService\b[\s\S]{0,80}\b(GetAsync|RequestAsync|PostAsync)\b[\s\S]{0,120}\bloadstring\b/i,
    reason: "fetching and executing remote code",
  },
  {
    re: /\b(getfenv|setfenv)\s*\(/,
    reason: "environment hooking, which is used to hide backdoor behaviour",
  },
  {
    // Hardcoded owner check granting powers to a specific username.
    re: /\b(Name|UserId)\s*==\s*["']?[A-Za-z0-9_]{3,20}["']?\s*(then|and)[\s\S]{0,120}\b(kick|ban|destroy|admin|god|kill)\b/i,
    reason:
      "a hidden owner check that gives one specific account special powers",
  },
  {
    // Obfuscation: long \ddd or string.char chains hiding a payload.
    re: /(\\\d{2,3}){12,}|(string\.char\s*\([^)]*\)\s*\.\.\s*){6,}/,
    reason: "obfuscated code, which hides what the script actually does",
  },
  {
    re: /\bsyn\s*\.|:\s*HttpGet\s*\(|\bKRNL\b|\bexecutor\b/i,
    reason: "exploit-executor APIs, which don't belong in a real game",
  },
  {
    // Scam funnels aimed at kids.
    re: /\bfree\s*robux\b|\brobux\s*(generator|gen)\b|\benter\s+your\s+(password|pin)\b/i,
    reason: "a Robux scam, which would get the game and the owner banned",
  },
  {
    // Trying to defeat Roblox's chat filter.
    re: /\b(bypass|defeat|get around)\b[\s\S]{0,40}\b(chat )?filter\b|\bfilter\s*bypass\b/i,
    reason: "bypassing Roblox's chat filter, which breaks Roblox's rules",
  },
];

export function checkScriptSafety(source: string): ScriptRisk {
  if (!source) return { blocked: false };
  for (const { re, reason } of PATTERNS) {
    if (re.test(source)) return { blocked: true, reason };
  }
  return { blocked: false };
}
