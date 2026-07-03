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
        Pair your Studio plugin
      </h1>
      <p className="mb-8 text-sm text-muted">
        Pairing links the {BRAND.name} plugin in Roblox Studio to your account
        (@{user.username}) so chat requests build in your open place.
      </p>

      <ol className="mb-8 flex flex-col gap-5 text-sm">
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ember-soft text-xs font-semibold text-ember">
            1
          </span>
          <span>
            Install the plugin: copy{" "}
            <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs">
              bloxsmith.server.lua
            </code>{" "}
            from the project&apos;s <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs">plugin/</code> folder into your local plugins folder
            (Studio → <strong>Plugins</strong> tab → <strong>Plugins Folder</strong>),
            then restart Studio.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ember-soft text-xs font-semibold text-ember">
            2
          </span>
          <span>
            In Studio, click the <strong>{BRAND.name}</strong> button in the
            Plugins toolbar to open the dock.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ember-soft text-xs font-semibold text-ember">
            3
          </span>
          <span>
            Generate a code below and type it into the dock, then press{" "}
            <strong>Connect</strong>. You only do this once per computer.
          </span>
        </li>
      </ol>

      <PairCode />
    </div>
  );
}
