#!/usr/bin/env -S pnpm tsx

/**
 * Rasterise the Colophon mark from `src/assets/colophon.svg`.
 *
 * Two sizes: the favicon Starlight serves, and the logo it puts beside the site
 * title. Both are square with a transparent background, so they sit on either
 * theme.
 *
 * Run with `pnpm icon` after editing the SVG, and commit the PNGs.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(rootDir, "src/assets/colophon.svg");

const outputs = [
  { path: join(rootDir, "public/favicon.png"), size: 256 },
  { path: join(rootDir, "src/assets/colophon.png"), size: 512 },
  // Not used by the site. It is the size npm, GitHub and the social platforms
  // want when one of them asks for an icon.
  { path: join(rootDir, "src/assets/colophon-1024.png"), size: 1024 },
];

const svg = await readFile(source);

for (const { path, size } of outputs) {
  // `density` scales the SVG before rasterising rather than after, so the curves
  // are drawn at the output size instead of being resampled from one bitmap.
  const png = await sharp(svg, { density: (72 * size) / 1024 })
    .resize(size, size)
    .png()
    .toBuffer();

  await writeFile(path, png);
  console.log(`wrote ${path} (${size}x${size})`);
}
