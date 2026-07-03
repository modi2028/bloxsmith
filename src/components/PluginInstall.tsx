"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

// The Windows shortcut that opens Roblox Studio's local plugins folder.
// %LOCALAPPDATA% expands to C:\Users\<you>\AppData\Local, so this lands in
// ...\Roblox\Plugins — where Studio loads local (unmoderated) plugins from.
const PLUGINS_PATH = "%LOCALAPPDATA%\\Roblox\\Plugins";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
      {children}
    </kbd>
  );
}

export function PluginInstall() {
  const [copied, setCopied] = useState(false);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(PLUGINS_PATH);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — the path is visible for manual copy
    }
  };

  return (
    <div className="pl-9">
      <a
        href={BRAND.pluginFileUrl}
        download={BRAND.pluginFileName}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:brightness-110"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4">
          <path
            d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 15.5h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Download plugin file
      </a>

      <ol className="mt-5 space-y-3.5 text-sm text-muted">
        <li className="flex gap-2.5">
          <span className="mt-0.5 text-ember">1.</span>
          <span>
            Press <Kbd>Win</Kbd> + <Kbd>R</Kbd> to open the Windows{" "}
            <strong className="text-foreground">Run</strong> box.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 text-ember">2.</span>
          <div className="min-w-0">
            <p>
              Paste this folder path and press <Kbd>Enter</Kbd> — it opens your
              Roblox plugins folder:
            </p>
            <button
              type="button"
              onClick={copyPath}
              title="Click to copy"
              className="mt-2 flex w-full items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface px-3 py-2 text-left font-mono text-[13px] text-foreground transition hover:border-ember/60"
            >
              <span className="truncate">{PLUGINS_PATH}</span>
              <span
                className={`shrink-0 text-xs font-sans font-medium ${
                  copied ? "text-green-400" : "text-muted"
                }`}
              >
                {copied ? "Copied ✓" : "Copy"}
              </span>
            </button>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 text-ember">3.</span>
          <span>
            Drag the downloaded{" "}
            <code className="rounded bg-surface px-1 py-0.5 font-mono text-[13px] text-foreground">
              {BRAND.pluginFileName}
            </code>{" "}
            into that folder.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 text-ember">4.</span>
          <span>
            Restart Roblox Studio. {BRAND.name} appears in the{" "}
            <strong className="text-foreground">Plugins</strong> tab of the
            toolbar.
          </span>
        </li>
      </ol>

      <p className="mt-4 text-xs text-faint">
        Installing as a local plugin means no Roblox permission prompts — it has
        everything it needs to build in your place.
      </p>
    </div>
  );
}
