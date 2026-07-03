import type { NextRequest } from "next/server";
import { env } from "@/server/env";
import { getStripe, isStripeConfigured } from "@/server/stripe/client";
import { fulfillStripeEvent } from "@/server/stripe/fulfillment";

// Stripe needs the raw body for signature verification, so never parse it.
export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe — verify the signature, then fulfill. Returns 200
 * quickly; fulfillment is idempotent (payment_events dedupe).
 */
export async function POST(request: NextRequest) {
  if (!isStripeConfigured() || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error(
      "stripe signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await fulfillStripeEvent(event);
  } catch (err) {
    console.error(
      "stripe fulfillment error:",
      err instanceof Error ? err.message : err,
    );
    // 500 → Stripe retries; our handler is idempotent so retries are safe.
    return new Response("Fulfillment error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
