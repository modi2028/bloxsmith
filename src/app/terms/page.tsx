import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Terms of Service" };

const UPDATED = "July 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-10">
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">
        ← Back to {BRAND.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="mt-1 text-xs text-faint">Last updated: {UPDATED}</p>

      <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed text-muted [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-ember [&_a]:underline-offset-2 hover:[&_a]:underline">
        <p className="rounded-lg border border-line bg-surface-raised p-3 text-xs text-faint">
          This is a plain-language starting template, not legal advice. Have a
          lawyer review it before relying on it in production.
        </p>

        <section>
          <h2>1. Who we are</h2>
          <p>
            {BRAND.name} (&quot;we&quot;, &quot;us&quot;) is an AI pair-builder
            for Roblox Studio. By creating an account or using the service you
            agree to these Terms.
          </p>
        </section>

        <section>
          <h2>2. Accounts</h2>
          <p>
            You sign in with your Roblox account via Roblox OAuth. You are
            responsible for activity under your account. You must be old enough
            to authorize a Roblox OAuth app (13+) and to enter into these
            Terms.
          </p>
        </section>

        <section>
          <h2>3. Credits, Pro, and payments</h2>
          <p>
            The service runs on credits. Requests consume credits based on the
            model used and the amount of work. You may buy credit packs or
            subscribe to Pro ($19.99/month) for access to premium models and a
            monthly credit allotment. Payments are processed by Stripe; we do
            not store your card details.
          </p>
          <p>
            Credits and subscription fees are generally non-refundable except
            where required by law. Pro renews monthly until cancelled; you can
            cancel anytime and keep Pro until the end of the paid period.
            Unused monthly credits do not roll over. Prices may change with
            notice.
          </p>
        </section>

        <section>
          <h2>4. Acceptable use</h2>
          <p>
            Don&apos;t use {BRAND.name} to build or generate content that is
            illegal, infringing, malicious, or that violates Roblox&apos;s
            terms. Don&apos;t attempt to abuse the credit system, resell access,
            or disrupt the service. We may suspend or ban accounts that break
            these rules.
          </p>
        </section>

        <section>
          <h2>5. Your content</h2>
          <p>
            You own the games and code you create. You grant us the limited
            right to process your prompts, attachments, and Studio context to
            provide the service (including sending them to our AI providers).
            You&apos;re responsible for reviewing and testing generated code
            before shipping it.
          </p>
        </section>

        <section>
          <h2>6. AI output</h2>
          <p>
            AI-generated code can be wrong or incomplete. The service is
            provided &quot;as is&quot; without warranties. To the extent
            permitted by law, we are not liable for damages arising from your
            use of the service or of generated content.
          </p>
        </section>

        <section>
          <h2>7. Changes &amp; termination</h2>
          <p>
            We may update these Terms or the service over time. We may suspend
            or terminate accounts that violate these Terms. You can stop using
            the service at any time.
          </p>
        </section>

        <section>
          <h2>8. Contact</h2>
          <p>
            Questions? Reach out via the contact channel listed on our site.
          </p>
        </section>
      </div>

      <p className="mt-10 text-xs text-faint">
        See also our{" "}
        <Link href="/privacy" className="text-ember hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
