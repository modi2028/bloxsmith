"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { PluginInstall } from "./PluginInstall";

/**
 * Step-1 install chooser: Roblox Creator Store (one click, auto-updates) or
 * the manual plugin file (no permission prompts). Both are first-class.
 */
export function InstallPicker() {
  // Default to the file install while the Store listing is under review.
  const [tab, setTab] = useState<"store" | "file">("file");

  const tabCls = (active: boolean) =>
    `flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
      active
        ? "bg-gradient-to-br from-ember to-ember-strong text-on-accent"
        : "text-muted hover:text-foreground"
    }`;

  return (
    <div className="pl-9">
      <div className="mb-4 flex gap-1 rounded-xl border border-line bg-surface p-1">
        <button
          type="button"
          onClick={() => setTab("store")}
          className={tabCls(tab === "store")}
        >
          Roblox Store
        </button>
        <button
          type="button"
          onClick={() => setTab("file")}
          className={tabCls(tab === "file")}
        >
          Manual file
        </button>
      </div>

      {tab === "store" ? (
        <div>
          <p className="mb-4 text-sm text-muted">
            One click from the Creator Store — installs straight into Studio
            and <strong className="text-foreground">auto-updates</strong>{" "}
            whenever we ship improvements.
          </p>
          <a
            href={BRAND.pluginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110"
          >
            Install on Roblox
            <svg viewBox="0 0 20 20" fill="none" className="size-4">
              <path
                d="M7 5h8v8M15 5 5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <p className="mt-3 text-xs text-faint">
            Studio will ask for a &quot;Script Injection&quot; permission —
            allow it so {BRAND.name} can write your game&apos;s scripts.
          </p>
          <p className="mt-2 text-xs text-amber-400/80">
            Note: the Store listing is currently under Roblox review and may be
            unavailable — use the Manual file tab if the page doesn&apos;t
            load.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-1 text-sm text-muted">
            Download the plugin file and drop it into your plugins folder — no
            permission prompts. (Re-download for updates.)
          </p>
          <div className="-ml-9">
            <PluginInstall />
          </div>
        </div>
      )}
    </div>
  );
}
