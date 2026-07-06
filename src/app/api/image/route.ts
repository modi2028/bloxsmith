import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/roles";
import { getSessionUser } from "@/server/auth/session";
import {
  InsufficientCreditsError,
  SpendLimitExceededError,
  refundCredits,
  reserveCredits,
  settleCredits,
} from "@/server/credits/ledger";
import { getProviderApiKey, NoProviderKeyError } from "@/server/ai/keys";
import { clientIp, rateLimit } from "@/server/security/ratelimit";
import { getSiteSettings } from "@/server/site-settings";

/**
 * Blox Image — game thumbnail generation via Z.ai's GLM-Image.
 * Flat price per image; reserve -> settle so a failed generation refunds.
 *
 * NOTE: image generation is billed on Z.ai's pay-per-use API
 * (api.z.ai/api/paas/v4), which is separate from the GLM Coding Plan — the
 * Z.ai account needs a small API balance for this to work.
 */
const IMAGE_COST_CREDITS = 0.05;
const ZAI_IMAGE_BASE =
  process.env.ZAI_PAAS_BASE || "https://api.z.ai/api/paas/v4";

const bodySchema = z.object({
  prompt: z.string().trim().min(3).max(1500),
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
    const apiKey = await getProviderApiKey("zai");
    const res = await fetch(`${ZAI_IMAGE_BASE}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "glm-image",
        prompt:
          "A vibrant, eye-catching Roblox game thumbnail, polished 3D game art, " +
          "dynamic composition, bright colors, no text, no watermark. Game: " +
          body.prompt,
        size: "1344x768",
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { url?: string }[];
      error?: { message?: string; code?: string };
    };
    const url = data.data?.[0]?.url;
    if (!res.ok || !url) {
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
    return Response.json({ url, cost: IMAGE_COST_CREDITS });
  } catch (err) {
    await refundCredits({
      userId: user.id,
      aiRequestId: refId,
      reserved: IMAGE_COST_CREDITS,
    }).catch(() => {});
    console.error("Blox Image failed:", err);
    const message =
      err instanceof NoProviderKeyError
        ? "Image generation isn't configured yet."
        : err instanceof Error && /insufficient|balance|recharge/i.test(err.message)
          ? "Image generation is temporarily unavailable — the provider account needs topping up."
          : "Couldn't generate the image — nothing was charged. Try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}
