import { env } from "@/server/env";
import { getSessionUser } from "@/server/auth/session";
import { getStripe, StripeNotConfiguredError } from "@/server/stripe/client";

/**
 * POST /api/store/portal — open the Stripe billing portal so a Pro user can
 * update payment method or cancel. Requires an existing Stripe customer.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!user.stripeCustomerId) {
    return Response.json(
      { error: "No billing account yet — subscribe first." },
      { status: 400 },
    );
  }
  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${env.APP_URL}/store`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return Response.json(
        { error: "Payments aren't set up on this server yet." },
        { status: 503 },
      );
    }
    console.error("portal error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not open billing." }, { status: 500 });
  }
}
