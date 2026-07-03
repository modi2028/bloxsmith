// Copies the canonical plugin source into public/ so it can be downloaded
// as a local plugin file. Runs automatically before every build (see the
// "prebuild" script in package.json) so the download never drifts from the
// real plugin. Plain Node (no tsx) so it works in any deploy environment.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "plugin/bloxsmith.server.lua");
const dest = resolve(root, "public/Bloxsmith.lua");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[sync-plugin] ${src} -> ${dest}`);
