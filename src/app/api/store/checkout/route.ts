import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/server/env";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { getStripe, StripeNotConfiguredError } from "@/server/stripe/client";
import { clientIp, rateLimit } from "@/server/security/ratelimit";

const bodySchema = z.union([
  z.object({ type: z.literal("credits"), productId: z.string().uuid() }),
  z.object({ type: z.literal("pro") }),
]);

/**
 * POST /api/store/checkout — create a Stripe Checkout Session and return its
 * url. Buyer↔account mapping is carried in session.metadata.userId, which the
 * webhook uses to fulfill. Reuses the user's Stripe customer if known.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const rl = rateLimit(`checkout:${clientIp(request)}`, 15, 60_000);
  if (!rl.ok) {
    return Response.json({ error: "Too many attempts." }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const successUrl = `${env.APP_URL}/store?purchase=success`;
    const cancelUrl = `${env.APP_URL}/store?purchase=cancelled`;

    const customer = user.stripeCustomerId ?? undefined;
    const commonMeta = { userId: user.id, robloxUserId: String(user.robloxUserId) };

    if (body.type === "credits") {
      const product = await db.query.products.findFirst({
        where: eq(schema.products.id, body.productId),
      });
      if (!product || !product.active || !product.stripePriceId) {
        return Response.json(
          { error: "That pack is unavailable." },
          { status: 400 },
        );
      }
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: product.stripePriceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer,
        client_reference_id: user.id,
        metadata: {
          ...commonMeta,
          kind: "credits",
          credits: String(product.credits),
          productId: product.id,
        },
      });
      return Response.json({ url: session.url });
    }

    // Pro subscription.
    const priceRow = await db.query.appSettings.findFirst({
      where: eq(schema.appSettings.key, "stripe_pro_price_id"),
    });
    const proPriceId = typeof priceRow?.value === "string" ? priceRow.value : "";
    if (!proPriceId) {
      return Response.json(
        { error: "Pro isn't configured yet." },
        { status: 400 },
      );
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: proPriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer,
      client_reference_id: user.id,
      metadata: { ...commonMeta, kind: "pro" },
      subscription_data: { metadata: { ...commonMeta, kind: "pro" } },
    });
    return Response.json({ url: session.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return Response.json(
        { error: "Payments aren't set up on this server yet." },
        { status: 503 },
      );
    }
    console.error("checkout error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
