import Link from "next/link";
import { redirect } from "next/navigation";
import { PairCode } from "@/components/PairCode";
import { BRAND } from "@/lib/brand";
import { getSessionUser } from "@/server/auth/session";

export const metadata = { title: "Pair your Studio plugin" };

export default async function PairPage() {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/roblox/login");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-10">
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">
        ← Back to {BRAND.name}
      </Link>

      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Set up the Studio plugin
      </h1>
      <p className="mb-8 text-sm text-muted">
        The {BRAND.name} plugin lets us build inside your open Roblox Studio
        session. Install it once, then pair it to your account (@
        {user.username}).
      </p>

      {/* Step 1 — install */}
      <div className="mb-6 rounded-2xl border border-line bg-surface-raised p-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ember-soft text-xs font-semibold text-ember">
            1
          </span>
          <h2 className="text-sm font-semibold">Install the plugin</h2>
        </div>
        <p className="mb-4 pl-9 text-sm text-muted">
          Get the {BRAND.name} plugin from the Roblox Creator Store — it installs
          straight into your Studio Plugins tab. You only do this once.
        </p>
        <div className="pl-9">
          <a
            href={BRAND.pluginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:brightness-110"
          >
            Install on Roblox
            <svg viewBox="0 0 20 20" fill="none" className="size-4">
              <path
                d="M7 5h8v8M15 5 5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>

      {/* Step 2 — open the dock */}
      <div className="mb-6 rounded-2xl border border-line bg-surface-raised p-5">
        <div className="mb-2 flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ember-soft text-xs font-semibold text-ember">
            2
          </span>
          <h2 className="text-sm font-semibold">Open it in Studio</h2>
        </div>
        <p className="pl-9 text-sm text-muted">
          Open any place in Roblox Studio, go to the <strong>Plugins</strong>{" "}
          tab in the toolbar, and click the <strong>{BRAND.name}</strong> button
          to open its panel.
        </p>
      </div>

      {/* Step 3 — pair */}
      <div className="rounded-2xl border border-line bg-surface-raised p-5">
        <div className="mb-2 flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ember-soft text-xs font-semibold text-ember">
            3
          </span>
          <h2 className="text-sm font-semibold">Pair it to your account</h2>
        </div>
        <p className="mb-4 pl-9 text-sm text-muted">
          Generate a code below, type it into the plugin panel in Studio, and
          press <strong>Connect</strong>. You only pair once per computer.
        </p>
        <div className="pl-9">
          <PairCode />
        </div>
      </div>
    </div>
  );
}
