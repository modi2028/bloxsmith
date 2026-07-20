import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Terms of Service" };

const UPDATED = "July 3, 2026";

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

      <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed text-muted [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-ember [&_a]:underline-offset-2 hover:[&_a]:underline [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5">
        <section>
          <h2>1. Agreement to these Terms</h2>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and
            use of {BRAND.name} (the &quot;Service&quot;), including our website,
            the {BRAND.name} companion plugin for Roblox Studio (the
            &quot;Plugin&quot;), and any related features. By creating an
            account, installing the Plugin, or otherwise using the Service, you
            agree to these Terms. If you do not agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Eligibility</h2>
          <p>
            You must have a valid Roblox account and be old enough to authorize
            a Roblox OAuth application (at least 13 years old) and to enter into
            a binding contract in your jurisdiction. If you are under the age of
            majority, you may use the Service only with the involvement and
            consent of a parent or legal guardian. By using the Service you
            represent that you meet these requirements.
          </p>
        </section>

        <section>
          <h2>3. Relationship to Roblox</h2>
          <p>
            {BRAND.name} is an independent tool. It is not created by,
            affiliated with, endorsed by, or sponsored by Roblox Corporation,
            Anthropic, or OpenAI. &quot;Roblox&quot; is a trademark of Roblox
            Corporation. Your use of Roblox Studio, the Roblox platform, and the
            Plugin within it remains subject to the{" "}
            <a
              href="https://en.help.roblox.com/hc/en-us/articles/115004647846"
              target="_blank"
              rel="noopener noreferrer"
            >
              Roblox Terms of Use
            </a>{" "}
            and{" "}
            <a
              href="https://en.help.roblox.com/hc/en-us/articles/203313410"
              target="_blank"
              rel="noopener noreferrer"
            >
              Community Standards
            </a>
            . You are responsible for ensuring your use of the Service complies
            with those policies.
          </p>
        </section>

        <section>
          <h2>4. Accounts and authentication</h2>
          <p>
            You sign in using &quot;Sign in with Roblox&quot; (Roblox OAuth
            2.0). You are responsible for all activity that occurs under your
            account and for keeping your Roblox credentials secure. You must not
            share your account, impersonate others, or access the Service
            through automated means except as expressly permitted. We may
            suspend or terminate accounts that violate these Terms.
          </p>
        </section>

        <section>
          <h2>5. The Studio plugin</h2>
          <p>
            The Plugin connects your Roblox Studio session to your {BRAND.name}{" "}
            account after you pair it with a one-time code. When you send a
            request, the Plugin sends and receives data over HTTPS to and from
            our servers in order to carry out AI-assisted actions in your open
            place, such as creating instances, editing properties, and writing
            scripts. You acknowledge and agree that:
          </p>
          <ul>
            <li>
              The Plugin makes changes to the place file currently open in your
              Studio session. You should work in a place you control and keep
              backups of important work.
            </li>
            <li>
              Actions are recorded with Roblox&apos;s change-history system so
              they can generally be undone, but you are responsible for
              reviewing, testing, and deciding whether to keep any changes.
            </li>
            <li>
              You will not use the Plugin in places or accounts you are not
              authorized to modify.
            </li>
            <li>
              The Plugin requests HTTP access the first time it contacts our
              domain; you may decline, but the Service will not function without
              it.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. Plans, usage limits, and payments</h2>
          <ul>
            <li>
              <strong>Usage limits.</strong> The Service meters usage in tokens
              against per-plan allowances (a rolling 5-hour window and a weekly
              limit). How fast the allowance is consumed depends on the AI
              model, effort setting, and the amount of work performed. Limits
              are shown in the app and may be adjusted over time.
            </li>
            <li>
              <strong>Purchases.</strong> You may subscribe to {BRAND.name} Pro
              or Max. Payments are processed by our payment provider, Stripe.
              We do not receive or store your full card details.
            </li>
            <li>
              <strong>Subscriptions.</strong> Pro and Max are billed monthly
              and renew automatically until cancelled. You may cancel at any
              time from the store or the billing portal; your benefits continue
              until the end of the current paid period, after which you return
              to the free tier. Unused allowance does not roll over.
            </li>
            <li>
              <strong>Refunds.</strong> Except where required by applicable law,
              subscription fees are non-refundable, including for partially
              used periods or unused allowance.
            </li>
            <li>
              <strong>Pricing changes.</strong> We may change prices, usage
              limits, model availability, and included amounts. Material changes
              to recurring pricing will apply from your next billing period.
            </li>
            <li>
              <strong>Taxes.</strong> Prices may exclude applicable taxes, which
              you are responsible for where required.
            </li>
          </ul>
        </section>

        <section>
          <h2>7. Acceptable use</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>
              violate any law, regulation, or third-party right, including
              intellectual-property, privacy, and publicity rights;
            </li>
            <li>
              create, generate, or distribute content that is illegal, harmful,
              harassing, hateful, sexually explicit, or that exploits or
              endangers minors;
            </li>
            <li>
              violate the Roblox Terms of Use or Community Standards, or build
              experiences that would;
            </li>
            <li>
              introduce malware, backdoors, or code intended to harm users,
              circumvent Roblox systems, or exfiltrate data;
            </li>
            <li>
              abuse, defraud, or manipulate the usage-limit or payment system,
              including chargeback abuse or exploiting bugs for free usage;
            </li>
            <li>
              reverse engineer, decompile, scrape, overload, or attempt to gain
              unauthorized access to the Service or its infrastructure;
            </li>
            <li>resell or redistribute access to the Service without our permission.</li>
          </ul>
          <p>
            We may investigate suspected violations and suspend or terminate
            access, remove content, and cooperate with law enforcement where
            appropriate.
          </p>
        </section>

        <section>
          <h2>8. Your content and license</h2>
          <p>
            As between you and us, you retain ownership of the games, code, and
            other content you create (&quot;Your Content&quot;), subject to
            Roblox&apos;s rights under its terms. You grant us a limited,
            worldwide, non-exclusive license to host, process, transmit, and
            display Your Content, your prompts, uploaded reference images, and
            the Studio context reported by the Plugin, solely to operate and
            improve the Service — including sending relevant data to our AI
            providers to generate responses. You represent that you have the
            rights necessary to submit Your Content and that it does not violate
            these Terms.
          </p>
        </section>

        <section>
          <h2>9. AI-generated output</h2>
          <p>
            The Service uses third-party AI models to generate code and other
            output. AI output can be inaccurate, incomplete, insecure, or
            unsuitable for your purpose, and similar output may be generated for
            other users. You are solely responsible for reviewing and testing
            any generated content before using or publishing it. We make no
            warranty that generated output is correct, original, or
            non-infringing.
          </p>
        </section>

        <section>
          <h2>10. Intellectual property</h2>
          <p>
            The Service, including our software, website, branding, and the
            Plugin, is owned by us and our licensors and is protected by
            intellectual-property laws. Except for the rights expressly granted
            here, we reserve all rights. You may not use our name or logos
            without permission.
          </p>
        </section>

        <section>
          <h2>11. Third-party services</h2>
          <p>
            The Service relies on third parties including Roblox (sign-in and the
            Studio platform), Anthropic and OpenAI (AI processing), Stripe
            (payments), and our hosting and infrastructure providers. Your use
            of those services is subject to their respective terms and privacy
            policies. We are not responsible for third-party services.
          </p>
        </section>

        <section>
          <h2>12. Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
            AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
            IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
            NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
            UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT GENERATED OUTPUT WILL
            MEET YOUR REQUIREMENTS.
          </p>
        </section>

        <section>
          <h2>13. Limitation of liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR SUPPLIERS WILL NOT
            BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
            PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA, PROFITS, GOODWILL, OR
            WORK, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL
            LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE
            GREATER OF (A) THE AMOUNT YOU PAID US IN THE THREE MONTHS BEFORE THE
            EVENT GIVING RISE TO THE CLAIM, OR (B) USD 50. Some jurisdictions do
            not allow certain limitations, so some of the above may not apply to
            you.
          </p>
        </section>

        <section>
          <h2>14. Indemnification</h2>
          <p>
            You agree to indemnify and hold us harmless from claims, damages, and
            expenses (including reasonable legal fees) arising from your use of
            the Service, Your Content, or your violation of these Terms or of any
            law or third-party right.
          </p>
        </section>

        <section>
          <h2>15. Suspension and termination</h2>
          <p>
            You may stop using the Service at any time. We may suspend or
            terminate your access, with or without notice, if you violate these
            Terms, if required by law, or to protect the Service or other users.
            Upon termination, your right to use the Service ends; sections that
            by their nature should survive (including ownership, disclaimers,
            limitation of liability, and indemnification) will survive.
          </p>
        </section>

        <section>
          <h2>16. Changes to the Service and Terms</h2>
          <p>
            We may modify or discontinue features of the Service at any time. We
            may also update these Terms; when we do, we will revise the
            &quot;Last updated&quot; date, and material changes may be
            communicated in the app. Your continued use of the Service after
            changes take effect constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2>17. Governing law</h2>
          <p>
            These Terms are governed by the laws of the jurisdiction in which the
            operator of {BRAND.name} is established, without regard to its
            conflict-of-laws rules, and subject to any mandatory consumer
            protections available to you where you live.
          </p>
        </section>

        <section>
          <h2>18. Contact</h2>
          <p>
            Questions about these Terms? Contact us at{" "}
            <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>.
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
