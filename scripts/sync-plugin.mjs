// Copies the canonical plugin source into public/ so it can be downloaded
// as a local plugin file. Runs automatically before every build (see the
// "prebuild" script in package.json) so the download never drifts from the
// real plugin. Plain Node (no tsx) so it works in any deploy environment.
//
// It ALSO installs into the local Roblox plugins folder when there is one, so
// editing the plugin and testing it in Studio is one step instead of two —
// the download-and-drag loop was easy to forget, and a stale local copy shows
// up as "unknown tool" errors that look like backend bugs.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "plugin/bloxsmith.server.lua");
const dest = resolve(root, "public/Bloxsmith.lua");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[sync-plugin] ${src} -> ${dest}`);

/**
 * Where Studio loads local plugins from, per platform. Derived from the
 * environment rather than hardcoded to one machine's profile so this keeps
 * working for anyone who clones the repo — and silently does nothing on the
 * build server, which has no Roblox install and must not fail the build.
 */
function localPluginDirs() {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA ?? join(homedir(), "AppData/Local");
    return [join(base, "Roblox", "Plugins")];
  }
  if (process.platform === "darwin") {
    return [join(homedir(), "Documents", "Roblox", "Plugins")];
  }
  return [];
}

for (const dir of localPluginDirs()) {
  // Only install where Studio already keeps its plugins. Creating the folder
  // would mean writing into a Roblox install that may not exist.
  if (!existsSync(dir)) continue;
  try {
    const local = join(dir, "Bloxsmith.lua");
    copyFileSync(src, local);
    console.log(`[sync-plugin] installed -> ${local}`);
  } catch (err) {
    // Studio holds a lock on a plugin it has open, and a failed local install
    // must never break a build or a deploy.
    console.warn(
      `[sync-plugin] could not install locally (${err.message}). ` +
        `Close Studio and re-run, or download from /Bloxsmith.lua.`,
    );
  }
}
