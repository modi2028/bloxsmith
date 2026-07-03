/**
 * Export the Bloxsmith logo as PNGs into public/brand/.
 *   npx tsx scripts/export-logo.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const MARK = `
  <path d="M17 22.5 L32 31 L32 48 L17 39.5 Z" fill="#B45309"/>
  <path d="M47 22.5 L47 39.5 L32 48 L32 31 Z" fill="#EA580C"/>
  <path d="M32 14 L47 22.5 L32 31 L17 22.5 Z" fill="url(#top)"/>
  <path d="M50 6 L51.8 10.2 L56 12 L51.8 13.8 L50 18 L48.2 13.8 L44 12 L48.2 10.2 Z" fill="#FDE68A"/>`;

const DEFS = `
  <defs>
    <linearGradient id="top" x1="17" y1="12" x2="47" y2="29" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FDE68A"/>
      <stop offset="1" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>`;

const withBackground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${DEFS}
  <rect width="64" height="64" rx="14" fill="#0C0A09"/>${MARK}
</svg>`;

const transparent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${DEFS}${MARK}
</svg>`;

const outDir = join(process.cwd(), "public", "brand");
mkdirSync(outDir, { recursive: true });

const jobs: { svg: string; name: string; size: number }[] = [
  { svg: withBackground, name: "bloxsmith-logo-1024.png", size: 1024 },
  { svg: withBackground, name: "bloxsmith-logo-512.png", size: 512 },
  { svg: withBackground, name: "bloxsmith-logo-256.png", size: 256 },
  { svg: transparent, name: "bloxsmith-mark-transparent-1024.png", size: 1024 },
  { svg: transparent, name: "bloxsmith-mark-transparent-512.png", size: 512 },
];

for (const job of jobs) {
  const png = new Resvg(job.svg, {
    fitTo: { mode: "width", value: job.size },
  })
    .render()
    .asPng();
  const path = join(outDir, job.name);
  writeFileSync(path, png);
  console.log(`${job.name}  (${job.size}x${job.size}, ${png.length} bytes)`);
}
console.log(`\nSaved to ${outDir}`);
