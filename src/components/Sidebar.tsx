import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { BloxImageButton } from "./BloxImageButton";
import { LogoMark } from "./Logo";
import { NewProjectButton } from "./NewProjectButton";
import { ProjectList, type ProjectItem } from "./ProjectList";

/**
 * App sidebar: brand, new-project CTA, a single Projects section with an
 * archived toggle, and a compact plugin-pairing row. The live green/red
 * connection indicator lives in the chat composer (StudioStatus); the footer
 * here is just the entry point to pairing.
 */
export function Sidebar({
  pluginConnected = null,
  projects = [],
  activeProjectId,
  viewArchived = false,
}: {
  /** null = signed out / unknown; boolean = live status. */
  pluginConnected?: boolean | null;
  projects?: ProjectItem[];
  activeProjectId?: string;
  viewArchived?: boolean;
}) {
  return (
    <aside className="glass-surface hidden md:flex w-64 shrink-0 flex-col border-r border-white/5">
      <Link href="/" className="flex h-16 items-center gap-2.5 px-5">
        <LogoMark size={28} />
        <span className="text-[16px] font-semibold tracking-tight">
          {BRAND.name}
        </span>
      </Link>

      <div className="px-3">
        <NewProjectButton pluginConnected={pluginConnected} />
        <BloxImageButton />
      </div>

      <div className="mb-1.5 mt-6 flex items-center justify-between pl-6 pr-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
          {viewArchived ? "Archived" : "Projects"}
        </span>
        <Link
          href={viewArchived ? "/" : "/?view=archived"}
          title={viewArchived ? "Back to projects" : "Show archived"}
          className={`flex size-6 items-center justify-center rounded-md transition hover:bg-white/5 hover:text-foreground ${
            viewArchived ? "text-ember" : "text-faint"
          }`}
        >
          <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
            <path
              d="M2.5 4h11v2h-11V4Zm1 2h9v6.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V6Zm3 2.5h3"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </div>

      <div className="min-h-0 flex-1">
        <ProjectList
          projects={projects}
          activeId={activeProjectId}
          viewArchived={viewArchived}
        />
      </div>

      <div className="border-t border-line p-3">
        <Link
          href="/pair"
          className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-white/5"
        >
          <span
            className={`size-2 shrink-0 rounded-full ${
              pluginConnected
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]"
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-foreground/90">
              Studio plugin
            </span>
            <span className="block truncate text-[11px] text-faint">
              {pluginConnected ? "Connected" : "Not connected — set up"}
            </span>
          </span>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="size-3.5 shrink-0 text-faint transition group-hover:text-muted"
          >
            <path
              d="m6 3.5 4.5 4.5L6 12.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
