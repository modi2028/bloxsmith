"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/Logo";
import { RobloxMark } from "@/components/BrandMarks";
import { MagneticLink } from "./Interactive";
import { StarLayer } from "./StarLayer";

const SIGN_IN = "/api/auth/roblox/login";

/**
 * Sign-in, using the landing page's own material.
 *
 * The same star layer runs behind it — mounted here too, so the page has the
 * product's face on it rather than being a bare form on a dark rectangle.
 * There is no password to collect: the only action is handing off to Roblox
 * OAuth, so the page is one card and one button.
 */
export function LoginScreen() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="hero-wash pointer-events-none absolute inset-0 z-0"
      />
      <StarLayer />

      {/* Scrim so the card is legible over polished metal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_50%_45%_at_50%_50%,var(--background)_40%,transparent_80%)]"
      />

      <div className="relative z-10 w-full max-w-md">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2.5 transition hover:brightness-125"
        >
          <LogoMark size={26} variant="white" />
          <span className="text-lg font-semibold tracking-[-0.01em] text-white">
            {BRAND.name}
          </span>
        </Link>

        <div className="liquid-glass wavy-glass rounded-3xl p-9 backdrop-blur-2xl backdrop-saturate-150 sm:p-11">
          <h1 className="text-center text-3xl font-semibold tracking-[-0.02em] text-white">
            Sign in
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-white/60">
            Bloxsmith builds inside your own Studio session, so it signs you in
            with the account that owns your places.
          </p>

          <MagneticLink
            href={SIGN_IN}
            className="mt-9 flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-sm font-bold text-black transition hover:brightness-90"
          >
            <RobloxMark className="size-5" />
            Continue with Roblox
          </MagneticLink>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-white/40">
            No password is shared with us. You&apos;ll approve the connection on
            Roblox, and you can revoke it there at any time.
          </p>
        </div>

        <p className="mt-7 text-center text-xs text-white/40">
          New here? The same button makes your account —{" "}
          <Link href="/" className="underline underline-offset-4 hover:text-white/70">
            see what it does
          </Link>{" "}
          first.
        </p>
      </div>
    </main>
  );
}
