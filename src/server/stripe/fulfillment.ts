import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { grantCredits } from "@/server/credits/ledger";
import { getStripe } from "./client";

/**
 * Stripe webhook fulfillment. Every handler is idempotent — the caller
 * records the event id in payment_events first (onConflictDoNothing); we only
 * process events we haven't seen. Credits/plan changes are safe to reason
 * about because they route through the append-only ledger and explicit
 * plan writes.
 */

async function findUserByStripeCustomer(customerId: string) {
  return db.query.users.findFirst({
    where: eq(schema.users.stripeCustomerId, customerId),
  });
}

/** checkout.session.completed — one-time credit pack purchase. */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.metadata?.userId;
  const kind = session.metadata?.kind;
  if (!userId) return;

  // Remember the Stripe customer for this user (used for the billing portal
  // and subscription events).
  if (session.customer && typeof session.customer === "string") {
    await db
      .update(schema.users)
      .set({ stripeCustomerId: session.customer })
      .where(eq(schema.users.id, userId));
  }

  if (session.mode === "payment" && kind === "credits") {
    const credits = Number(session.metadata?.credits ?? 0);
    if (credits > 0) {
      await grantCredits({
        userId,
        amount: credits,
        kind: "purchase",
        reason: `Purchased ${credits} credits`,
        refType: "stripe_checkout",
        refId: session.id,
      });
    }
  }

  if (session.mode === "subscription" && kind === "pro") {
    // Mark Pro immediately; invoice.paid grants the monthly credits + sets the
    // precise expiry from the subscription period.
    const subId =
      typeof session.subscription === "string" ? session.subscription : null;
    await db
      .update(schema.users)
      .set({
        plan: "pro",
        stripeSubscriptionId: subId,
      })
      .where(eq(schema.users.id, userId));
  }
}

/** invoice.paid — initial + recurring subscription payments. */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;
  const user = await findUserByStripeCustomer(customerId);
  if (!user) return;

  // Only fulfill subscription invoices.
  const line = invoice.lines?.data?.[0];
  const subId =
    typeof line?.subscription === "string" ? line.subscription : null;
  if (!subId) return;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subId);
  const periodEnd = sub.items.data[0]?.current_period_end;
  const proExpiresAt = periodEnd ? new Date(periodEnd * 1000) : null;

  await db
    .update(schema.users)
    .set({
      plan: "pro",
      proExpiresAt,
      stripeSubscriptionId: subId,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id));

  // Grant the monthly credit allotment (idempotent via the invoice id ref).
  const monthlyRow = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.key, "pro_monthly_credits"),
  });
  const monthly = Number(monthlyRow?.value ?? 20000);
  if (monthly > 0) {
    await grantCredits({
      userId: user.id,
      amount: monthly,
      kind: "purchase",
      reason: "Pro monthly credits",
      refType: "stripe_invoice",
      refId: invoice.id,
    });
  }
}

/** customer.subscription.updated/deleted — cancellation & lapse. */
async function handleSubscriptionChange(
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : null;
  if (!customerId) return;
  const user = await findUserByStripeCustomer(customerId);
  if (!user) return;

  const active = sub.status === "active" || sub.status === "trialing";
  const periodEnd = sub.items.data[0]?.current_period_end;

  await db
    .update(schema.users)
    .set({
      plan: active ? "pro" : "free",
      proExpiresAt:
        active && periodEnd ? new Date(periodEnd * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id));
}

/** Route a verified event, recording it for idempotency first. */
export async function fulfillStripeEvent(event: Stripe.Event): Promise<void> {
  const [recorded] = await db
    .insert(schema.paymentEvents)
    .values({
      provider: "stripe",
      externalId: event.id,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: schema.paymentEvents.externalId })
    .returning({ id: schema.paymentEvents.id });
  if (!recorded) return; // already processed

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(
          event.data.object as Stripe.Subscription,
        );
        break;
      default:
        break;
    }
    await db
      .update(schema.paymentEvents)
      .set({ processedAt: new Date() })
      .where(eq(schema.paymentEvents.externalId, event.id));
  } catch (err) {
    await db
      .update(schema.paymentEvents)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(schema.paymentEvents.externalId, event.id));
    throw err;
  }
}
