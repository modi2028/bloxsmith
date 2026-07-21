import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/templates";
import { LogoMark } from "@/components/Logo";

export const metadata = {
  title: "Templates",
  description: `Ready-made prompts for ${BRAND.name}: tycoons, obbies, round systems, combat and more. One click and the AI builds it live in Roblox Studio.`,
};

export default function TemplatesPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-10">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <LogoMark size={20} /> {BRAND.name}
      </Link>

      <h1 className="text-4xl font-bold tracking-tight">Templates</h1>
      <p className="mt-3 max-w-xl text-sm text-muted">
        Proven prompts for the things people build most. Open one, send it, and
        watch it appear in your Studio place. Every template is a starting
        point you can edit.
      </p>

      {TEMPLATE_CATEGORIES.map((cat) => {
        const items = TEMPLATES.filter((t) => t.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} className="mt-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
              {cat}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {items.map((t) => (
                <Link
                  key={t.slug}
                  href={`/templates/${t.slug}`}
                  className="flex flex-col rounded-2xl border border-line bg-surface-raised p-5 transition hover:-translate-y-0.5 hover:border-ember/40"
                >
                  <span className="text-base font-semibold">{t.title}</span>
                  <span className="mt-1 text-sm text-muted">{t.blurb}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <div className="mt-14 rounded-2xl border border-line-strong bg-surface-raised p-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          Build any of these in minutes
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Sign in with Roblox, connect the Studio plugin, and send a template.
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
