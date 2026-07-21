/**
 * Does this message ask for a PICTURE rather than a build?
 *
 * Users shouldn't need to remember a command — "make me a thumbnail for my
 * obby" should just work. But hijacking a genuine build request is much
 * worse than missing an image request (which the user can retry with
 * /image), so detection is deliberately conservative: it needs an image
 * noun AND an asking verb, and anything that smells of Studio work vetoes
 * it.
 */

const IMAGE_NOUN =
  /\b(thumbnails?|images?|pictures?|pics?|posters?|logos?|icons?|banners?|artwork|wallpapers?|cover art)\b/i;

const IMAGE_VERB =
  /\b(make|makes|making|create|creates|generate|generates|draw|design|render|paint)\b|\bi(?:'d| would)?\s+(?:want|like|need)\b|\bcan you\b|\bgive me\b/i;

/**
 * Studio vocabulary. If any of this appears the user is talking about
 * building something, even when an image word is present ("add an
 * ImageLabel", "make a thumbnail system").
 */
const BUILD_CONTEXT =
  /\b(script|scripts|imagelabel|image label|decal|texture|surfacegui|screengui|gui|system|systems|remote|remoteevent|part|parts|brick|bricks|model|models|instance|insert|leaderstats|leaderboard|npc|tool|anchored|studio|explorer|workspace|code|lua|luau|button|frame|billboard|build|spawn)\b/i;

/** Long, detailed briefs are build requests, not picture requests. */
const MAX_LENGTH = 400;

export function looksLikeImageRequest(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > MAX_LENGTH) return false;
  if (BUILD_CONTEXT.test(t)) return false;
  return IMAGE_NOUN.test(t) && IMAGE_VERB.test(t);
}

/** "/image a neon tower" -> "a neon tower" (null when not the command). */
export function parseImageCommand(text: string): string | null {
  const m = text.match(/^\/(?:image|img|pic)\s+([\s\S]+)$/i);
  return m ? m[1]!.trim() : null;
}
