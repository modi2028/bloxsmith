import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Privacy Policy" };

const UPDATED = "July 3, 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-10">
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">
        ← Back to {BRAND.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-xs text-faint">Last updated: {UPDATED}</p>

      <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed text-muted [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-ember [&_a]:underline-offset-2 hover:[&_a]:underline [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5 [&_table]:w-full [&_th]:text-left [&_th]:font-medium [&_td]:py-1 [&_td]:align-top">
        <section>
          <p>
            This Privacy Policy explains how {BRAND.name} (&quot;we&quot;,
            &quot;us&quot;) collects, uses, shares, and protects information when
            you use our website and the {BRAND.name} companion plugin for Roblox
            Studio (together, the &quot;Service&quot;). {BRAND.name} is an
            independent tool and is not affiliated with, endorsed by, or
            operated by Roblox Corporation, Anthropic, or OpenAI.
          </p>
        </section>

        <section>
          <h2>1. Information we collect</h2>
          <p>
            <strong>Account and profile.</strong> When you sign in with Roblox
            (OAuth 2.0) using the <code>openid</code> and <code>profile</code>{" "}
            scopes, we receive your Roblox user ID, username, display name, and
            avatar image. We do not receive your Roblox password.
          </p>
          <p>
            <strong>Prompts and Studio data.</strong> To build in your Studio
            session, we process the messages you send, any reference images you
            upload, and the context reported by the Plugin about your open place
            (such as the objects and properties relevant to your request), along
            with the results of the actions performed.
          </p>
          <p>
            <strong>Project history.</strong> We store your projects and chat
            history so you can resume work, including AI responses and a record
            of the actions taken.
          </p>
          <p>
            <strong>Usage and billing.</strong> We store your usage records,
            plan status, and, if you purchase, a Stripe customer identifier and
            subscription details. Payment card details are collected and
            processed directly by Stripe; we do not receive or store your full
            card number.
          </p>
          <p>
            <strong>Plugin pairing.</strong> We store a hashed pairing token that
            links your installed Plugin to your account, along with a
            &quot;last seen&quot; timestamp used to show connection status.
          </p>
          <p>
            <strong>Technical and usage data.</strong> We keep limited logs for
            security, abuse prevention, and diagnostics, which may include IP
            address, timestamps, request identifiers, and error information. We
            use a first-party session cookie to keep you signed in; we do not
            use third-party advertising or cross-site tracking cookies.
          </p>
        </section>

        <section>
          <h2>2. How we use information</h2>
          <ul>
            <li>to provide, operate, and maintain the Service;</li>
            <li>
              to process your requests and generate AI-assisted changes in your
              Studio session;
            </li>
            <li>to manage usage limits, subscriptions, and payments;</li>
            <li>to save and display your projects and history;</li>
            <li>
              to secure the Service, prevent fraud and abuse, enforce our Terms,
              and comply with legal obligations;
            </li>
            <li>to respond to support requests and communicate about the Service.</li>
          </ul>
        </section>

        <section>
          <h2>3. AI processing</h2>
          <p>
            To generate responses, we send your prompts, reference images, and
            relevant Studio context to our AI providers (Anthropic and/or
            OpenAI) through their APIs. We access these providers using our own
            API keys under their API terms. We do not use your content to train
            our own models, and we rely on the providers&apos; API terms, under
            which submitted API content is not used to train their models by
            default. Each provider processes data under its own privacy policy.
          </p>
        </section>

        <section>
          <h2>4. How we share information</h2>
          <p>
            We do not sell your personal information. We share information only
            with service providers that help us run the Service, and only as
            needed:
          </p>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Roblox</td>
                <td>Sign-in (OAuth) and the Studio platform</td>
              </tr>
              <tr>
                <td>Anthropic, OpenAI</td>
                <td>AI processing of prompts and context</td>
              </tr>
              <tr>
                <td>Stripe</td>
                <td>Payment processing and subscriptions</td>
              </tr>
              <tr>
                <td>Supabase</td>
                <td>Database and file storage hosting</td>
              </tr>
              <tr>
                <td>Hosting / CDN providers</td>
                <td>Running the website and routing traffic</td>
              </tr>
            </tbody>
          </table>
          <p>
            We may also disclose information if required by law, to protect our
            rights or the safety of users, or in connection with a business
            transfer (such as a merger or acquisition), subject to this Policy.
          </p>
        </section>

        <section>
          <h2>5. Storage, security, and retention</h2>
          <p>
            Application data is stored in our database hosted on Supabase.
            Sensitive secrets (such as provider API keys) are encrypted at rest,
            session and plugin tokens are stored only as hashes, and we apply
            access controls, rate limiting, and transport encryption (HTTPS). No
            method of storage or transmission is completely secure, but we work
            to protect your information.
          </p>
          <p>
            We retain your information for as long as your account is active and
            as needed to provide the Service. We may retain certain records
            (such as transaction and billing records, and limited security logs)
            for longer where required for legal, accounting, or fraud-prevention
            purposes. When you delete your account, we delete or anonymize your
            personal data except where retention is legally required.
          </p>
        </section>

        <section>
          <h2>6. Children&apos;s privacy</h2>
          <p>
            The Roblox community includes younger users, and we take this
            seriously. The Service is intended for users who are old enough to
            authorize a Roblox OAuth application (at least 13 years old) and to
            agree to our Terms. We do not knowingly collect personal information
            from children under 13, and we collect only the limited profile data
            described above. If you are a parent or guardian and believe a child
            under 13 has provided us personal information, contact us at{" "}
            <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a> and
            we will delete it. Where required by law, users below the age of
            digital consent must have parental consent to use the Service.
          </p>
        </section>

        <section>
          <h2>7. Your rights and choices</h2>
          <p>
            Depending on where you live, you may have rights to access, correct,
            delete, export, or object to certain processing of your personal
            data, and to withdraw consent. You can:
          </p>
          <ul>
            <li>delete projects within the app;</li>
            <li>cancel your Pro subscription at any time;</li>
            <li>
              request account deletion or exercise other rights by contacting us
              at{" "}
              <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>;
            </li>
            <li>
              revoke {BRAND.name}&apos;s access to your Roblox account from your
              Roblox account settings.
            </li>
          </ul>
          <p>
            We will respond to verified requests within the time required by
            applicable law. You may also have the right to lodge a complaint with
            your local data-protection authority.
          </p>
        </section>

        <section>
          <h2>8. Legal bases (EEA/UK)</h2>
          <p>
            Where the GDPR or UK GDPR applies, we process personal data to
            perform our contract with you (providing the Service), for our
            legitimate interests (securing and improving the Service, preventing
            abuse), to comply with legal obligations, and, where applicable, with
            your consent.
          </p>
        </section>

        <section>
          <h2>9. International transfers</h2>
          <p>
            Your information may be processed and stored in countries other than
            where you live, including where our providers operate. Where required,
            we rely on appropriate safeguards for such transfers.
          </p>
        </section>

        <section>
          <h2>10. Changes to this Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will revise
            the &quot;Last updated&quot; date above and, for material changes,
            provide notice in the app where appropriate. Your continued use of
            the Service after changes take effect constitutes acceptance of the
            updated Policy.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            For privacy questions or requests, contact us at{" "}
            <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>.
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
