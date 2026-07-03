import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "./Logo";
import { NewProjectButton } from "./NewProjectButton";
import { ProjectList, type ProjectItem } from "./ProjectList";

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
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-line bg-surface/60">
      <Link href="/" className="flex items-center gap-2.5 px-5 h-16">
        <LogoMark size={30} />
        <span className="text-[17px] font-semibold tracking-tight">
          {BRAND.name}
        </span>
      </Link>

      <div className="px-4">
        <NewProjectButton pluginConnected={pluginConnected} />
      </div>

      <nav className="mt-5 flex flex-col gap-1 px-3">
        <Link
          href="/"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
            !viewArchived
              ? "bg-ember-soft text-foreground"
              : "text-muted hover:bg-surface-raised hover:text-foreground"
          }`}
        >
          <svg viewBox="0 0 20 20" fill="none" className="size-4">
            <path
              d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3.4c.4 0 .8.16 1.06.44l1.1 1.12c.28.28.66.44 1.06.44h4.38A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-9Z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          Projects
        </Link>
        <Link
          href="/?view=archived"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
            viewArchived
              ? "bg-ember-soft text-foreground"
              : "text-muted hover:bg-surface-raised hover:text-foreground"
          }`}
        >
          <svg viewBox="0 0 20 20" fill="none" className="size-4">
            <path
              d="M3 5h14v3H3V5Zm1 3h12v6.5A1.5 1.5 0 0 1 14.5 16h-9A1.5 1.5 0 0 1 4 14.5V8Zm4.5 3h3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Archived
        </Link>
      </nav>

      <div className="mt-4 min-h-0 flex-1">
        <ProjectList
          projects={projects}
          activeId={activeProjectId}
          viewArchived={viewArchived}
        />
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span
            className={`size-2 rounded-full ${
              pluginConnected
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                : "bg-faint"
            }`}
          />
          Studio plugin: {pluginConnected ? "connected" : "not connected"}
        </div>
        <Link
          href="/pair"
          className="mt-1 inline-block text-xs text-ember hover:underline"
        >
          {pluginConnected ? "Manage pairing →" : "Pair your plugin →"}
        </Link>
      </div>
    </aside>
  );
}
