import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/roles";
import { getSessionUser } from "@/server/auth/session";
import { restrictionNotice } from "@/server/ai/policy";
import {
  InsufficientCreditsError,
  SpendLimitExceededError,
  refundCredits,
  reserveCredits,
  settleCredits,
} from "@/server/credits/ledger";
import { persistToChat } from "@/server/ai/image-persist";
import { mirrorImage, storeImageBytes } from "@/server/storage";
import { clientIp, rateLimit } from "@/server/security/ratelimit";
import { getSiteSettings } from "@/server/site-settings";

/**
 * Blox Image — game thumbnail generation through the ChatGPT (Codex OAuth)
 * proxy, on gpt-image-2. Reserve -> settle so a failed generation refunds.
 *
 * Moved off Z.ai's pay-per-use image API, which needed a funded balance
 * separate from the GLM Coding Plan and would fail outright when it ran dry.
 * The subscription covers this instead, so a thumbnail now costs us nothing.
 *
 * The credit charge is KEPT regardless, and its meaning has changed: it is no
 * longer recovering a cost, it is a fair-use quota. The whole site — Luna,
 * Titan and now images — shares one upstream account, and unlimited free
 * image generation is the quickest way to exhaust it.
 */
const IMAGE_COST_CREDITS = 0.05;
const CHATGPT_BASE =
  process.env.CHATGPT_OAUTH_BASE ?? "http://127.0.0.1:10531/v1";
const IMAGE_MODEL = process.env.CHATGPT_IMAGE_MODEL ?? "gpt-image-2";

const bodySchema = z.object({
  prompt: z.string().trim().min(3).max(1500),
  /** When present, the request + result are saved into this project. */
  chatSessionId: z.string().uuid().optional(),
  /** What the user actually typed (persisted as their message). */
  shownAs: z.string().trim().max(2000).optional(),
});

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
  // A paused account is paused everywhere, not just in the build loop.
  const accountPaused = await restrictionNotice(user);
  if (accountPaused) {
    return Response.json({ error: accountPaused }, { status: 403 });
  }
  // Paused means paused for everyone, staff included (see /api/chat).
  if (site.imagePaused) {
    return Response.json(
      {
        error:
          "Blox Image is paused right now while we sort something out. Please try again soon.",
        paused: true,
      },
      { status: 503 },
    );
  }

  const rl = rateLimit(`image:${user.id}`, 10, 5 * 60_000);
  const ipRl = rateLimit(`image-ip:${clientIp(request)}`, 20, 5 * 60_000);
  if (!rl.ok || !ipRl.ok) {
    return Response.json(
      { error: "Too many images — wait a bit and try again." },
      { status: 429 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Describe your game first." }, { status: 400 });
  }

  const refId = `img_${randomUUID()}`;
  try {
    await reserveCredits({
      userId: user.id,
      aiRequestId: refId,
      amount: IMAGE_COST_CREDITS,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return Response.json(
        {
          error: `Not enough credits — a thumbnail costs ${IMAGE_COST_CREDITS} credits.`,
        },
        { status: 402 },
      );
    }
    if (err instanceof SpendLimitExceededError) {
      return Response.json(
        { error: "You've hit your credit spend limit." },
        { status: 429 },
      );
    }
    throw err;
  }

  try {
    const res = await fetch(`${CHATGPT_BASE}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt:
          "A vibrant, eye-catching Roblox game thumbnail, polished 3D game art, " +
          "dynamic composition, bright colors, no text, no watermark. Game: " +
          body.prompt,
        size: "1536x1024",
      }),
      // Image generation is slow — measured at well over 30s on this path.
      signal: AbortSignal.timeout(180_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { url?: string; b64_json?: string }[];
      error?: { message?: string; code?: string };
    };
    const first = data.data?.[0];
    if (!res.ok || !first) {
      throw new Error(
        data.error?.message ?? `Image generation failed (${res.status})`,
      );
    }

    await settleCredits({
      userId: user.id,
      aiRequestId: refId,
      reserved: IMAGE_COST_CREDITS,
      actualCost: IMAGE_COST_CREDITS,
    });

    // gpt-image-2 returns base64 inline, so there is no temporary URL to fall
    // back on: storing it is the only way the picture survives the response.
    // A URL is still handled in case the upstream shape ever changes back.
    let finalUrl: string;
    if (first.b64_json) {
      finalUrl = await storeImageBytes(
        new Uint8Array(Buffer.from(first.b64_json, "base64")),
        "image/png",
        user.id,
      );
    } else if (first.url) {
      // A provider URL expires within hours, so host our own copy — but it
      // works right now, so a mirroring failure shouldn't fail the call.
      finalUrl = first.url;
      try {
        finalUrl = await mirrorImage(first.url, user.id);
      } catch (err) {
        console.error("Image mirror failed, serving temporary URL:", err);
      }
    } else {
      throw new Error("Image generation returned no image");
    }

    // Persist into the chat so a refresh doesn't lose the picture.
    const chatSessionId = await persistToChat({
      userId: user.id,
      chatSessionId: body.chatSessionId,
      shownAs: body.shownAs ?? body.prompt,
      prompt: body.prompt,
      url: finalUrl,
    }).catch(() => body.chatSessionId ?? null);

    return Response.json({
      url: finalUrl,
      cost: IMAGE_COST_CREDITS,
      chatSessionId,
    });
  } catch (err) {
    await refundCredits({
      userId: user.id,
      aiRequestId: refId,
      reserved: IMAGE_COST_CREDITS,
    }).catch(() => {});
    console.error("Blox Image failed:", err);
    // The old "top up the provider account" case is gone with the paid image
    // API. What can fail now is the proxy being unreachable, which is an
    // outage rather than anything the user did.
    const message =
      err instanceof Error &&
      /ECONNREFUSED|fetch failed|ENOTFOUND|socket hang up|timeout|aborted/i.test(
        err.message,
      )
        ? "Image generation is offline right now — nothing was charged. Try again shortly."
        : "Couldn't generate the image — nothing was charged. Try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}
