import { getSessionUser } from "@/server/auth/session";
import { getStripe, StripeNotConfiguredError } from "@/server/stripe/client";

/**
 * POST /api/store/cancel — cancel the user's Pro subscription at period end.
 * They keep Pro until the paid period runs out; the subscription webhook
 * downgrades them to free when Stripe finalizes the cancellation.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!user.stripeSubscriptionId) {
    return Response.json(
      {
        error:
          "No active paid subscription to cancel. If you were granted Pro, contact support.",
      },
      { status: 400 },
    );
  }
  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    const endsAt = sub.items.data[0]?.current_period_end;
    return Response.json({
      ok: true,
      endsAt: endsAt ? new Date(endsAt * 1000).toISOString() : null,
    });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return Response.json(
        { error: "Payments aren't set up on this server yet." },
        { status: 503 },
      );
    }
    console.error("cancel error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not cancel." }, { status: 500 });
  }
}
