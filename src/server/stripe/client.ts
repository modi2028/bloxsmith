import "server-only";
import Stripe from "stripe";
import { env } from "@/server/env";

let cached: Stripe | null = null;

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured (STRIPE_SECRET_KEY missing).");
  }
}

/** Lazily construct the Stripe client. Throws if billing isn't configured. */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new StripeNotConfiguredError();
  if (!cached) cached = new Stripe(env.STRIPE_SECRET_KEY);
  return cached;
}

export const isStripeConfigured = () => !!env.STRIPE_SECRET_KEY;
