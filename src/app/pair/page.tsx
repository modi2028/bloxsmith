import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectPanel } from "@/components/ConnectPanel";
import { PluginInstall } from "@/components/PluginInstall";
import { ScrollHint } from "@/components/ScrollHint";
import { BRAND } from "@/lib/brand";
import { getSessionUser } from "@/server/auth/session";

export const metadata = { title: "Connect your Studio plugin" };

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
        session. Install it once and it connects to your account (@
        {user.username}) automatically — no codes to type.
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
          Get {BRAND.name} from the Roblox Creator Store — it installs into
          Studio in one click and auto-updates whenever we ship improvements.
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
          <p className="mt-2 text-xs text-faint">
            Studio will ask for a &quot;Script Injection&quot; permission —
            allow it so {BRAND.name} can write your game&apos;s scripts.
          </p>
        </div>

        <details className="mt-5 pl-9">
          <summary className="cursor-pointer text-xs text-muted underline-offset-2 hover:underline">
            Prefer a manual file install? (no permission prompts)
          </summary>
          <div className="mt-3 -ml-9">
            <PluginInstall />
          </div>
        </details>
      </div>

      {/* Step 2 — open Studio */}
      <div className="mb-6 rounded-2xl border border-line bg-surface-raised p-5">
        <div className="mb-2 flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ember-soft text-xs font-semibold text-ember">
            2
          </span>
          <h2 className="text-sm font-semibold">Open Roblox Studio</h2>
        </div>
        <p className="pl-9 text-sm text-muted">
          Open any place in Roblox Studio. The <strong>{BRAND.name}</strong>{" "}
          panel pops open on its own the first time and immediately asks to
          connect. (You can always reopen it from the{" "}
          <strong>Plugins</strong> tab.)
        </p>
      </div>

      {/* Step 3 — approve */}
      <div id="connect-step" className="rounded-2xl border border-line bg-surface-raised p-5">
        <div className="mb-2 flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ember-soft text-xs font-semibold text-ember">
            3
          </span>
          <h2 className="text-sm font-semibold">Approve the connection</h2>
        </div>
        <p className="mb-4 pl-9 text-sm text-muted">
          When Studio asks to connect, the request shows up right here (and as
          a popup on your dashboard). Press <strong>Connect Studio</strong> —
          that&apos;s it. You only approve once per computer.
        </p>
        <div className="pl-9">
          <ConnectPanel />
        </div>
      </div>

      <ScrollHint
        targetId="connect-step"
        label="Scroll down to connect your Studio"
      />
    </div>
  );
}
