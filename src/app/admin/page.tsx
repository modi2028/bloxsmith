import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { AdminSiteControls } from "@/components/AdminSiteControls";
import { AdminUsers } from "@/components/AdminUsers";
import { BRAND } from "@/lib/brand";
import { requireAdmin } from "@/server/auth/admin";
import { db, schema } from "@/server/db";
import { getSiteSettings } from "@/server/site-settings";
import { isStripeConfigured } from "@/server/stripe/client";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const admin = await requireAdmin();

  // Provider keys — status only, never the key itself.
  const keys = await db.query.providerKeys.findMany();
  const models = await db.query.modelPricing.findMany({
    orderBy: [asc(schema.modelPricing.sort)],
  });
  const proPrice = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.key, "stripe_pro_price_id"),
  });
  const site = await getSiteSettings();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/settings" className="text-sm text-muted hover:text-foreground">
          ← Settings
        </Link>
        <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
          Admin · @{admin.username}
        </span>
      </div>

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        {BRAND.name} admin
      </h1>
      <p className="mb-8 text-sm text-muted">
        Manage users, credits, and Pro. Every action is written to the audit
        log in Supabase.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-muted">Site controls</h2>
        <AdminSiteControls
          initialAnnouncement={site.announcement?.text ?? ""}
          initialMaintenance={site.maintenance}
        />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-muted">Users</h2>
        <AdminUsers
          viewerIsSuper={admin.role === "super_admin"}
          modelIds={models.filter((m) => m.enabled).map((m) => m.modelId)}
        />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-muted">
          Provider API keys
        </h2>
        <div className="rounded-xl border border-line bg-surface-raised p-4 text-sm">
          {(["anthropic", "openai", "google", "zai"] as const).map((provider) => {
            const row = keys.find((k) => k.provider === provider);
            return (
              <div
                key={provider}
                className="flex items-center justify-between border-b border-line/60 py-2 last:border-0"
              >
                <span className="capitalize">{provider}</span>
                {row ? (
                  <span className="font-mono text-xs text-muted">
                    ····{row.keyLast4}
                  </span>
                ) : (
                  <span className="text-xs text-faint">not set</span>
                )}
              </div>
            );
          })}
          <p className="mt-3 text-xs text-faint">
            Keys are encrypted at rest and never shown in full. Set or rotate
            with{" "}
            <code className="rounded bg-surface px-1">
              npm run key:set -- &lt;provider&gt; &lt;key&gt;
            </code>
            .
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-muted">
          Models &amp; pricing
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface/60 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">In /1k</th>
                <th className="px-3 py-2 font-medium">Out /1k</th>
                <th className="px-3 py-2 font-medium">Pro</th>
                <th className="px-3 py-2 font-medium">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.modelId} className="border-b border-line/60">
                  <td className="px-3 py-2">{m.displayName}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {m.inputCreditsPer1k}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {m.outputCreditsPer1k}
                  </td>
                  <td className="px-3 py-2">{m.proOnly ? "✓" : "—"}</td>
                  <td className="px-3 py-2">{m.enabled ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-faint">
          Edit pricing in src/lib/model-catalog.ts and run{" "}
          <code className="rounded bg-surface px-1">npm run apply:catalog</code>.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">Billing</h2>
        <div className="rounded-xl border border-line bg-surface-raised p-4 text-sm">
          <div className="flex items-center justify-between py-1">
            <span>Stripe</span>
            <span className={isStripeConfigured() ? "text-ember" : "text-faint"}>
              {isStripeConfigured() ? "configured" : "not configured"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span>Pro price</span>
            <span className="font-mono text-xs text-muted">
              {typeof proPrice?.value === "string" && proPrice.value
                ? proPrice.value
                : "—"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
