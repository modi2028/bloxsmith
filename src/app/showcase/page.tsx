import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/Logo";
import { db, schema } from "@/server/db";

export const metadata = {
  title: "Showcase",
  description: `Real Roblox games and mechanics built with ${BRAND.name}, with the exact prompts that made them.`,
};

/**
 * Rendered per request: this page reads the database, and the build
 * container has no env vars/database, so prerendering it at build time
 * fails the whole deploy.
 */
export const dynamic = "force-dynamic";

export default async function ShowcasePage() {
  // A public page must never 500 because the database blipped.
  const rows = await db
    .select({
      id: schema.showcaseEntries.id,
      title: schema.showcaseEntries.title,
      prompt: schema.showcaseEntries.prompt,
      summary: schema.showcaseEntries.summary,
      createdAt: schema.showcaseEntries.createdAt,
      username: schema.users.username,
    })
    .from(schema.showcaseEntries)
    .innerJoin(schema.users, eq(schema.users.id, schema.showcaseEntries.userId))
    .where(eq(schema.showcaseEntries.approved, true))
    .orderBy(desc(schema.showcaseEntries.createdAt))
    .limit(60)
    .catch(() => []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-10">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <LogoMark size={20} /> {BRAND.name}
      </Link>

      <h1 className="text-4xl font-bold tracking-tight">Showcase</h1>
      <p className="mt-3 max-w-xl text-sm text-muted">
        Things people actually built, with the prompts that made them. Every
        one of these started as a sentence.
      </p>

      {rows.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-line bg-surface-raised p-10 text-center">
          <p className="text-sm text-muted">
            Nothing published yet. Build something and share it from your
            project.
          </p>
          <a
            href="/api/auth/roblox/login"
            className="mt-5 inline-block rounded-xl bg-gradient-to-br from-ember to-ember-strong px-5 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110"
          >
            Start building free
          </a>
        </div>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {rows.map((r) => (
            <article
              key={r.id}
              className="flex flex-col rounded-2xl border border-line bg-surface-raised p-5"
            >
              <h2 className="text-base font-semibold">{r.title}</h2>
              <p className="mt-1 text-[11px] text-faint">
                by @{r.username} ·{" "}
                {r.createdAt.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <blockquote className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                &ldquo;{r.prompt.slice(0, 240)}
                {r.prompt.length > 240 ? "…" : ""}&rdquo;
              </blockquote>
              {r.summary && (
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {r.summary}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <div className="mt-14 rounded-2xl border border-line-strong bg-surface-raised p-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          Build yours next
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Describe a mechanic and watch it appear in your Studio place.
        </p>
        <a
          href="/api/auth/roblox/login"
          className="mt-6 inline-block rounded-xl bg-gradient-to-br from-ember to-ember-strong px-5 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110"
        >
          Start building free
        </a>
      </div>
    </div>
  );
}
