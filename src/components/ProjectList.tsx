"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export type ProjectItem = {
  id: string;
  title: string;
  archived: boolean;
};

export function ProjectList({
  projects,
  activeId,
  viewArchived,
}: {
  projects: ProjectItem[];
  activeId?: string;
  viewArchived: boolean;
}) {
  const router = useRouter();

  const toggleArchive = async (id: string) => {
    await fetch("/api/projects/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  };

  if (projects.length === 0) {
    return (
      <div className="px-6 text-xs text-faint">
        {viewArchived
          ? "Nothing archived."
          : "No projects yet — describe a mechanic to start one."}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-3">
      {projects.map((p) => (
        <div
          key={p.id}
          className={`group flex items-center rounded-lg transition ${
            p.id === activeId ? "bg-ember-soft" : "hover:bg-hover"
          }`}
        >
          <Link
            href={`/?project=${p.id}`}
            className={`min-w-0 flex-1 truncate px-3 py-2 text-[13px] ${
              p.id === activeId ? "text-foreground" : "text-muted"
            }`}
            title={p.title}
          >
            {p.title}
          </Link>
          <button
            type="button"
            onClick={() => toggleArchive(p.id)}
            title={p.archived ? "Restore project" : "Archive project"}
            className="mr-1.5 hidden size-6 shrink-0 items-center justify-center rounded text-faint transition hover:bg-surface hover:text-foreground group-hover:flex"
          >
            {p.archived ? (
              <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
                <path
                  d="M8 13V5m0 0L4.5 8.5M8 5l3.5 3.5M3 3h10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
                <path
                  d="M2.5 4h11v2h-11V4Zm1 2h9v6.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V6Zm3 2.5h3"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
