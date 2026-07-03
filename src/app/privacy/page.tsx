import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Privacy Policy" };

const UPDATED = "July 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-10">
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">
        ← Back to {BRAND.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-xs text-faint">Last updated: {UPDATED}</p>

      <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed text-muted [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-ember">
        <p className="rounded-lg border border-line bg-surface-raised p-3 text-xs text-faint">
          This is a plain-language starting template, not legal advice. Have a
          lawyer review it before relying on it in production.
        </p>

        <section>
          <h2>1. What we collect</h2>
          <p>
            When you sign in with Roblox we receive your Roblox user id,
            username, display name, and avatar. We store your credit ledger,
            projects and chat history, subscription/plan status, and a Stripe
            customer id for billing. We keep basic logs (IP, timestamps) for
            security and abuse prevention.
          </p>
        </section>

        <section>
          <h2>2. Prompts &amp; Studio data</h2>
          <p>
            To build in your Studio session, your prompts, any reference images
            you attach, and the Studio context reported by the plugin are sent
            to our AI providers (Anthropic and/or OpenAI) to generate a
            response. We store your conversation so you can resume projects.
          </p>
        </section>

        <section>
          <h2>3. Where your data lives</h2>
          <p>
            Application data is stored in our database hosted on Supabase.
            Provider API keys and other secrets are encrypted at rest. Payments
            are handled by Stripe under their privacy policy; we never receive
            your full card number.
          </p>
        </section>

        <section>
          <h2>4. Third parties</h2>
          <p>
            We share data only as needed to run the service: Roblox (sign-in),
            Anthropic and OpenAI (AI processing), Stripe (payments), and
            Supabase (hosting). Each processes data under its own terms. We do
            not sell your personal data.
          </p>
        </section>

        <section>
          <h2>5. Retention &amp; your choices</h2>
          <p>
            We keep your data while your account is active. You can delete
            projects in the app, cancel Pro at any time, and request account
            deletion via our contact channel. Some records (e.g. billing) may
            be retained as required by law.
          </p>
        </section>

        <section>
          <h2>6. Security</h2>
          <p>
            We use encryption for secrets, hashed session and plugin tokens,
            rate limiting, and access controls. No system is perfectly secure,
            but we work to protect your data.
          </p>
        </section>

        <section>
          <h2>7. Contact</h2>
          <p>
            For privacy questions or requests, reach out via the contact
            channel listed on our site.
          </p>
        </section>
      </div>

      <p className="mt-10 text-xs text-faint">
        See also our{" "}
        <Link href="/terms" className="text-ember hover:underline">
          Terms of Service
        </Link>
        .
      </p>
    </div>
  );
}
