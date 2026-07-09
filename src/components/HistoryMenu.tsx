"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function HistoryMenu({
  items,
}: {
  items: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Recent projects"
        onClick={() => setOpen((v) => !v)}
        className="glass-chip flex size-9 items-center justify-center rounded-lg border border-line text-muted transition hover:text-foreground"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
          <path
            d="M10 6v4l2.5 2.5M17 10a7 7 0 1 1-2-4.9M17 3v3h-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="glass-menu absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-line">
          <div className="px-3.5 pb-1 pt-2.5 text-[11px] uppercase tracking-wide text-faint">
            Recent projects
          </div>
          {items.length === 0 ? (
            <div className="px-3.5 pb-3 text-xs text-muted">
              Nothing yet — start building!
            </div>
          ) : (
            items.map((item) => (
              <Link
                key={item.id}
                href={`/?project=${item.id}`}
                onClick={() => setOpen(false)}
                className="block truncate px-3.5 py-2 text-sm text-muted transition hover:bg-hover hover:text-foreground"
              >
                {item.title}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
