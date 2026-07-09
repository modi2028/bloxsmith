import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/SettingsForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BRAND } from "@/lib/brand";
import { formatCredits } from "@/lib/credits-format";
import { isAdminRole } from "@/lib/roles";
import { getSessionUser } from "@/server/auth/session";
import { getBalance } from "@/server/credits/ledger";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/roblox/login");
  const balance = await getBalance(user.id);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-10">
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">
        ← Back to {BRAND.name}
      </Link>

      <div className="mb-8 flex items-center gap-4">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="size-14 rounded-full border border-line-strong object-cover"
          />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full border border-line bg-surface-raised text-lg font-semibold">
            {user.username.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {user.displayName ?? user.username}
          </h1>
          <p className="flex items-center gap-2 text-sm text-muted">
            <span>
              @{user.username} ·{" "}
              <span className="text-ember">{formatCredits(balance)}</span>{" "}
              credits
            </span>
            <span
              className={`rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wide ${
                user.plan === "pro"
                  ? "border-ember/50 text-ember"
                  : "border-line text-faint"
              }`}
            >
              {user.plan === "pro" ? "Pro" : "Free"}
            </span>
            {isAdminRole(user.role) && (
              <span className="rounded-full border border-line px-2 py-px text-[10px] uppercase tracking-wide text-faint">
                {user.role === "super_admin" ? "super admin" : "admin"}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SettingsForm initialNickname={user.nickname} />

        <div className="rounded-2xl border border-line bg-surface-raised p-5">
          <h2 className="mb-1.5 text-sm font-medium">Theme</h2>
          <p className="mb-3 text-xs text-muted">
            How {BRAND.name} looks on this device.
          </p>
          <ThemeToggle />
        </div>

        <div className="rounded-2xl border border-line bg-surface-raised p-5">
          <h2 className="mb-1.5 text-sm font-medium">Subscription &amp; credits</h2>
          <p className="mb-3 text-xs text-muted">
            {user.plan === "pro"
              ? "You're on Pro. Manage or cancel your subscription in the store."
              : "Upgrade to Pro or buy credit packs in the store."}
          </p>
          <Link
            href="/store"
            className="inline-block rounded-lg border border-line bg-surface px-3.5 py-2 text-sm transition hover:border-line-strong"
          >
            Open store →
          </Link>
        </div>

        {isAdminRole(user.role) && (
          <div className="rounded-2xl border border-ember/40 bg-ember-soft/50 p-5">
            <h2 className="mb-1.5 text-sm font-medium">Admin</h2>
            <p className="mb-3 text-xs text-muted">
              Manage users, credits, Pro, and bans.
            </p>
            <Link
              href="/admin"
              className="inline-block rounded-lg bg-gradient-to-br from-ember to-ember-strong px-3.5 py-2 text-sm font-semibold text-on-accent transition hover:brightness-110"
            >
              Open admin panel →
            </Link>
          </div>
        )}

        <div className="rounded-2xl border border-line bg-surface-raised p-5">
          <h2 className="mb-1.5 text-sm font-medium">Studio plugin</h2>
          <p className="mb-3 text-xs text-muted">
            Pair or re-pair the Bloxsmith plugin in Roblox Studio.
          </p>
          <Link
            href="/pair"
            className="inline-block rounded-lg border border-line bg-surface px-3.5 py-2 text-sm transition hover:border-line-strong"
          >
            Manage pairing →
          </Link>
        </div>

        <div className="rounded-2xl border border-line bg-surface-raised p-5">
          <h2 className="mb-1.5 text-sm font-medium">Account</h2>
          <p className="mb-3 text-xs text-muted">
            Signing out only affects this browser — your projects stay on your
            account.
          </p>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-red-900/60 bg-red-950/30 px-3.5 py-2 text-sm text-red-300 transition hover:bg-red-950/50"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="flex justify-center gap-4 pt-2 text-xs text-faint">
          <Link href="/terms" className="hover:text-muted">
            Terms of Service
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-muted">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
