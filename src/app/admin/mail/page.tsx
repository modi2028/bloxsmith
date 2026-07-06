import Link from "next/link";
import { MailClient } from "@/components/MailClient";
import { isSuperAdmin } from "@/lib/roles";
import { requireAdmin } from "@/server/auth/admin";
import { db } from "@/server/db";
import { MAIL_SLOTS, zohoConfig } from "@/server/mail/zoho";

export const metadata = { title: "Admin · Webmail" };

const MAIL_ERRORS: Record<string, string> = {
  forbidden: "Only super admins can connect mailboxes.",
  invalid_response: "Zoho returned an unexpected response — try again.",
  expired: "That connect attempt expired — try again.",
  connect_failed:
    "Connecting failed — make sure you signed in to Zoho as the mailbox you're connecting.",
};

export default async function AdminMailPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; mail_error?: string }>;
}) {
  const admin = await requireAdmin();
  const viewerIsSuper = isSuperAdmin(admin.role);
  const params = await searchParams;
  const cfg = zohoConfig();

  const allAccounts = await db.query.mailAccounts.findMany();
  const visible = allAccounts.filter(
    (a) => a.minRole === "admin" || viewerIsSuper,
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          ← Back to admin
        </Link>
        <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
          Webmail · @{admin.username}
        </span>
      </div>

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Webmail</h1>
      <p className="mb-8 text-sm text-muted">
        Team mailboxes, no passwords shared — access comes with your admin
        rank. Sent mail is audit-logged.
      </p>

      {params.connected && (
        <p className="mb-6 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300">
          Mailbox connected.
        </p>
      )}
      {params.mail_error && (
        <p className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {MAIL_ERRORS[params.mail_error] ?? "Something went wrong."}
        </p>
      )}

      {!cfg.configured && (
        <div className="mb-6 rounded-2xl border border-line bg-surface-raised p-5 text-sm">
          <h2 className="mb-2 font-semibold">One-time Zoho setup needed</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted">
            <li>
              Go to{" "}
              <a
                href="https://api-console.zoho.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ember hover:underline"
              >
                api-console.zoho.com
              </a>{" "}
              (signed in to your Zoho org) → Add Client →{" "}
              <strong>Server-based Applications</strong>.
            </li>
            <li>
              Homepage URL: <code className="rounded bg-surface px-1">https://bloxsmith.online</code>, Redirect URI:{" "}
              <code className="rounded bg-surface px-1">
                https://bloxsmith.online/api/admin/mail/callback
              </code>
            </li>
            <li>
              Copy the Client ID/Secret into Railway as{" "}
              <code className="rounded bg-surface px-1">ZOHO_CLIENT_ID</code> and{" "}
              <code className="rounded bg-surface px-1">ZOHO_CLIENT_SECRET</code>, then
              redeploy.
            </li>
            <li>
              Come back here and press Connect for each mailbox (sign in to
              Zoho AS that mailbox when it asks).
            </li>
          </ol>
          <p className="mt-2 text-xs text-faint">
            EU-region Zoho org? Also set ZOHO_ACCOUNTS_BASE=
            https://accounts.zoho.eu and ZOHO_MAIL_BASE=https://mail.zoho.eu.
          </p>
        </div>
      )}

      {viewerIsSuper && (
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.entries(MAIL_SLOTS).map(([slot, def]) => {
            const connected = allAccounts.some(
              (a) => a.address === def.address,
            );
            return (
              <a
                key={slot}
                href={`/api/admin/mail/connect?slot=${slot}`}
                className={`rounded-lg border px-3.5 py-2 text-sm transition ${
                  connected
                    ? "border-line text-muted hover:border-ember/60"
                    : "border-ember/50 text-ember hover:bg-ember-soft"
                }`}
              >
                {connected ? "Reconnect" : "Connect"} {def.address}
                <span className="ml-1.5 text-xs text-faint">
                  ({def.minRole === "admin" ? "admins" : "super admins"})
                </span>
              </a>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-faint">
          No mailboxes connected yet
          {viewerIsSuper ? " — connect one above." : " — ask a super admin."}
        </p>
      ) : (
        <MailClient
          accounts={visible.map((a) => ({ id: a.id, address: a.address }))}
        />
      )}
    </div>
  );
}
