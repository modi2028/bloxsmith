import type { NextRequest } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/roles";
import { getSessionUser } from "@/server/auth/session";
import { getProviderApiKey, NoProviderKeyError } from "@/server/ai/keys";
import { streamClaudeResponse } from "@/server/ai/providers/anthropic";
import { rateLimit } from "@/server/security/ratelimit";
import { getSiteSettings } from "@/server/site-settings";

/**
 * Better Prompter — rewrites a rough prompt into a detailed build prompt.
 * Free (it's a tiny fast-model call), but rate-limited per user.
 */
const bodySchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
});

const SYSTEM = `You improve prompts for Bloxsmith, an AI that builds Roblox games live in Studio from a chat message.

Rewrite the user's rough prompt into ONE excellent build prompt:
- Keep their idea and any names/numbers they chose; never invent a different game.
- Make it concrete: the exact mechanics, named parts/zones, sizes/placement, visuals (colors/materials), UI elements, win/lose conditions, and how a player experiences it.
- Sensible Roblox defaults where they were vague (spawn location, respawn behavior, values).
- Plain English, imperative voice, one paragraph or a short list. No emoji, no headings, no preamble.

Return ONLY the improved prompt text — nothing else.`;

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const site = await getSiteSettings();
  if (site.maintenance && !isAdminRole(user.role)) {
    return Response.json(
      { error: "Bloxsmith is under maintenance — try again soon." },
      { status: 503 },
    );
  }

  const rl = rateLimit(`prompt:${user.id}`, 10, 5 * 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: `Slow down — try again in ${rl.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Paste a prompt first." }, { status: 400 });
  }

  try {
    const apiKey = await getProviderApiKey("anthropic");
    const response = await streamClaudeResponse({
      apiKey,
      modelId: "claude-haiku-4-5",
      system: SYSTEM,
      messages: [
        { role: "user", content: [{ type: "text", text: body.prompt }] },
      ],
      tools: [],
    });
    const improved = response.text.trim();
    if (!improved) throw new Error("empty response");
    return Response.json({ improved });
  } catch (err) {
    console.error("Better Prompter failed:", err);
    const message =
      err instanceof NoProviderKeyError
        ? "Better Prompter isn't configured yet."
        : "Couldn't improve the prompt — try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}
