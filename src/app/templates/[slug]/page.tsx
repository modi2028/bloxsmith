import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { TEMPLATES, templateBySlug } from "@/lib/templates";
import { LogoMark } from "@/components/Logo";

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = templateBySlug((await params).slug);
  if (!t) return { title: "Template" };
  return {
    title: `${t.title} template`,
    description: `${t.blurb}. Built live in Roblox Studio by ${BRAND.name}.`,
  };
}

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = templateBySlug((await params).slug);
  if (!t) notFound();

  const others = TEMPLATES.filter((x) => x.slug !== t.slug).slice(0, 4);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10">
      <Link
        href="/templates"
        className="mb-8 flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <LogoMark size={20} /> All templates
      </Link>

      <span className="self-start rounded-full border border-line px-2.5 py-1 text-[11px] uppercase tracking-wide text-faint">
        {t.category}
      </span>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">{t.title}</h1>
      <p className="mt-3 text-base text-muted">{t.blurb}</p>

      <h2 className="mt-10 text-sm font-semibold">The prompt</h2>
      <div className="mt-2 rounded-2xl border border-line bg-surface-raised p-5">
        <p className="text-sm leading-relaxed">{t.prompt}</p>
      </div>

      <h2 className="mt-8 text-sm font-semibold">What you get in Studio</h2>
      <ul className="mt-2 flex flex-col gap-2 text-sm text-muted">
        {t.builds.map((b) => (
          <li key={b} className="flex items-start gap-2.5">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="mt-0.5 size-4 shrink-0 text-emerald-400"
            >
              <path
                d="m3 8.5 3.2 3L13 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {b}
          </li>
        ))}
      </ul>

      <div className="mt-10 rounded-2xl border border-line-strong bg-surface-raised p-8 text-center">
        <h2 className="text-xl font-semibold tracking-tight">
          Build this in your place
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Sign in with Roblox and send this prompt. It lands in your open
          Studio session, and Ctrl+Z undoes anything.
        </p>
        <a
          href="/api/auth/roblox/login"
          className="mt-6 inline-block rounded-xl bg-gradient-to-br from-ember to-ember-strong px-5 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110"
        >
          Build it free
        </a>
      </div>

      <h2 className="mt-12 text-sm font-semibold">More templates</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {others.map((o) => (
          <Link
            key={o.slug}
            href={`/templates/${o.slug}`}
            className="rounded-xl border border-line bg-surface-raised p-4 transition hover:border-ember/40"
          >
            <span className="text-sm font-semibold">{o.title}</span>
            <span className="mt-0.5 block text-xs text-muted">{o.blurb}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
