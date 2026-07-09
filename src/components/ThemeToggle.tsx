"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "bs-theme";

const THEMES = [
  { id: "", label: "Ember", swatch: "#f59e0b" },
  { id: "dark-grey", label: "Dark Grey", swatch: "#3f3f46" },
  { id: "light-grey", label: "Light Grey", swatch: "#e4e4e7" },
] as const;

/**
 * Theme picker (settings page). The choice is stored in localStorage and
 * applied to <html data-theme>; a tiny inline script in the root layout
 * applies it before first paint so there's no flash.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setTheme(localStorage.getItem(THEME_KEY) ?? "");
      setMounted(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const apply = (id: string) => {
    setTheme(id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      // storage unavailable — theme still applies for this page view
    }
    if (id) document.documentElement.setAttribute("data-theme", id);
    else document.documentElement.removeAttribute("data-theme");
  };

  return (
    <div className="flex flex-wrap gap-2">
      {THEMES.map((t) => {
        const active = mounted && theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => apply(t.id)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition ${
              active
                ? "border-ember/60 bg-ember-soft text-foreground"
                : "border-line text-muted hover:border-line-strong hover:text-foreground"
            }`}
          >
            <span
              className="size-3.5 rounded-full border border-line-strong"
              style={{ background: t.swatch }}
            />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
