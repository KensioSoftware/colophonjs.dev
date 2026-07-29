#!/usr/bin/env -S pnpm tsx

/**
 * Copy the documentation out of the colophon repo and into this site.
 *
 * The package repo owns the docs. Each `docs/<path>/README.md` there becomes
 * `src/content/docs/<path>/index.md` here, with Starlight frontmatter added and
 * the H1 lifted into the title. Page routes mirror the directory tree in both
 * repos, so the relative links between pages resolve the same way on GitHub and
 * on the site, and nothing has to be rewritten.
 *
 * Frontmatter is regenerated from the source every run rather than preserved.
 * The package repo is the source of truth, and a description hand-edited here
 * that outlived the page it described is exactly the drift this avoids.
 *
 * Run with `pnpm scaffold-docs`, which regenerates the social images after.
 * Set COLOPHON_REPO if the colophon checkout is not a sibling of this one.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeLlmsFiles } from "./llms.mjs";

type MarkdownParts = {
  frontmatter: string | undefined;
  body: string;
};

type DocPage = {
  /** Path under the docs root, which is also the site route: `configuration/fonts`. */
  route: string;
  title: string;
  description: string;
  sourceFile: string;
  targetFile: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));

const rootDir = resolve(scriptDir, "..");
const colophonRepo =
  process.env.COLOPHON_REPO ?? resolve(rootDir, "../colophon");

const sourceDocsRoot = join(colophonRepo, "docs");
const targetDocsRoot = join(rootDir, "src/content/docs");
const astroConfig = join(rootDir, "astro.config.mjs");

const editUrlBase =
  process.env.GITHUB_BLOB_BASE ??
  "https://github.com/KensioSoftware/colophon/blob/main/docs";

/**
 * Directories under `docs/` that hold something other than pages. `samples/`
 * is the PNG gallery the package README embeds.
 */
const skipDirectories = new Set(["samples"]);

/**
 * The sidebar, in reading order, which is why it is declared rather than sorted:
 * the docs are a sequence, and alphabetical order would open on the code
 * template and close on upgrading.
 *
 * Every page copied across has to appear in one of these groups. A page missing
 * from all of them fails the run instead of being published with nothing
 * linking to it.
 */
const sidebarGroups = [
  {
    marker: "start-sidebar",
    label: "Start here",
    routes: ["getting-started"],
  },
  {
    marker: "guide-sidebar",
    label: "Guides",
    routes: [
      "templates",
      "code-template",
      "layout",
      "rebuilds",
      "programmatic-use",
      "upgrading",
    ],
  },
  {
    marker: "config-sidebar",
    label: "Configuration",
    routes: [
      "configuration",
      "configuration/frontmatter",
      "configuration/fonts",
      "configuration/themes",
      "configuration/images",
      "configuration/sizes",
      "configuration/per-size-config",
      "configuration/placement",
      "configuration/manifest",
      "configuration/meta-tags",
      "configuration/extra-images",
      "configuration/warnings",
    ],
  },
];

/** Sidebar labels that read better than the page's own H1 in context. */
const labelOverrides = new Map([["configuration", "Overview"]]);

/** Longest description to derive from a page's opening paragraph. */
const descriptionLimit = 160;

const siteUrl = "https://colophonjs.dev";

/** The blockquote llms.txt opens with, and the one llms-full.txt repeats. */
const summary =
  "Colophon generates social meta images, the Open Graph and share-card " +
  "images a platform shows when someone posts a link to a site. It reads " +
  "image props from a post's frontmatter and renders branded PNGs at the " +
  "sizes the site needs. It is an npm package, @kensio/colophon, usable as a " +
  "CLI or from Node.";

async function main(): Promise<void> {
  assertExists(
    sourceDocsRoot,
    `Could not find the colophon docs at: ${sourceDocsRoot}
Set COLOPHON_REPO=/absolute/path/to/colophon if the checkout is elsewhere.`,
  );
  assertExists(
    astroConfig,
    `Could not find the Astro config at: ${astroConfig}`,
  );

  const pages = await collectPages("");
  if (pages.length === 0) {
    throw new Error(`No pages found under ${sourceDocsRoot}`);
  }

  // Before anything is written, so a run that fails here leaves no page on disk
  // that the sidebar does not know about.
  checkEveryPageIsInTheSidebar(pages);

  for (const page of pages) {
    await writePage(page);
  }

  const byRoute = new Map(pages.map((page) => [page.route, page]));
  for (const group of sidebarGroups) {
    await replaceMarkedBlockInFile(
      astroConfig,
      `// ${group.marker}:start`,
      `// ${group.marker}:end`,
      sidebarItems(group.routes, byRoute),
    );
  }

  const llmsPaths = await writeLlmsFiles({
    rootDir,
    siteUrl,
    title: "Colophon",
    summary,
    sections: sidebarGroups.map((group) => ({
      label: group.label,
      routes: group.routes,
    })),
    optional: [
      {
        label: "npm package",
        url: "https://www.npmjs.com/package/@kensio/colophon",
        note: "install and version history",
      },
      {
        label: "Source repository",
        url: "https://github.com/KensioSoftware/colophon",
        note: "source, issues and the docs these pages are built from",
      },
    ],
  });

  console.log();
  console.log(`Copied ${pages.length} pages from ${sourceDocsRoot}`);
  console.log(`Updated the sidebar in ${astroConfig}`);
  for (const path of llmsPaths) {
    console.log(`Wrote: ${path}`);
  }
}

/**
 * Every `README.md` under the docs root, depth first. A directory can be both a
 * page and a parent: `docs/configuration/` holds the options table as well as a
 * page per option.
 */
async function collectPages(route: string): Promise<DocPage[]> {
  const sourceDir = join(sourceDocsRoot, route);
  const pages: DocPage[] = [];

  const readme = join(sourceDir, "README.md");
  // The docs root's own README is an index for people browsing the repo on
  // GitHub. Starlight has its own home page, so it is not copied.
  if (route !== "" && existsSync(readme)) {
    pages.push(await readPage(route, readme));
  }

  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || skipDirectories.has(entry.name)) {
      continue;
    }
    pages.push(...(await collectPages(join(route, entry.name))));
  }

  return pages;
}

async function readPage(route: string, sourceFile: string): Promise<DocPage> {
  const text = await readFile(sourceFile, "utf8");
  const { frontmatter, body } = parseMarkdown(text);

  const title = firstHeading(body);
  if (title === undefined) {
    throw new Error(`No H1 to take a title from: ${sourceFile}`);
  }

  const declared = frontmatterField(frontmatter, "description");

  return {
    route,
    title,
    description: declared ?? summarise(stripFirstHeading(body)),
    sourceFile,
    targetFile: join(targetDocsRoot, route, "index.md"),
  };
}

async function writePage(page: DocPage): Promise<void> {
  const text = await readFile(page.sourceFile, "utf8");
  const body = stripFirstHeading(parseMarkdown(text).body).trim();

  const frontmatter = [
    "---",
    `title: ${JSON.stringify(page.title)}`,
    `description: ${JSON.stringify(page.description)}`,
    // Edits belong in the repo the page came from, not in the copy.
    `editUrl: ${JSON.stringify(`${editUrlBase}/${page.route}/README.md`)}`,
    "---",
  ].join("\n");

  await mkdir(dirname(page.targetFile), { recursive: true });
  await writeFile(page.targetFile, `${frontmatter}\n\n${body}\n`);
  console.log(`${page.route} -> ${page.targetFile}`);
}

function checkEveryPageIsInTheSidebar(pages: DocPage[]): void {
  const listed = new Set(sidebarGroups.flatMap((group) => group.routes));
  const found = new Set(pages.map((page) => page.route));

  const unlisted = [...found].filter((route) => !listed.has(route)).sort();
  if (unlisted.length > 0) {
    throw new Error(
      `These pages are not in any sidebar group in scripts/scaffold-docs.mts, so nothing would link to them:
${unlisted.map((route) => `  ${route}`).join("\n")}`,
    );
  }

  const missing = [...listed].filter((route) => !found.has(route)).sort();
  if (missing.length > 0) {
    throw new Error(
      `The sidebar names pages that the colophon repo no longer has:
${missing.map((route) => `  ${route}`).join("\n")}`,
    );
  }
}

/**
 * Sidebar entries for one marked block, one per line. A long label pushes a
 * line past Prettier's width, so `pnpm scaffold-docs` runs Prettier over the
 * config afterwards rather than trying to guess where it would wrap.
 */
function sidebarItems(routes: string[], byRoute: Map<string, DocPage>): string {
  const indent = " ".repeat(12);
  const items = routes.map((route) => {
    const page = byRoute.get(route);
    const label = labelOverrides.get(route) ?? page?.title ?? route;
    return `${indent}{ label: ${JSON.stringify(label)}, slug: ${JSON.stringify(route)} },`;
  });

  return `\n${items.join("\n")}\n${indent}`;
}

/**
 * A one-line description from the page's opening paragraph, for the `<head>`
 * and for the subtitle on the page's social card.
 */
function summarise(body: string): string {
  const paragraph = body
    .trim()
    .split(/\n\s*\n/)
    .find((block) => /^[A-Za-z`*[]/.test(block.trim()));

  if (paragraph === undefined) {
    return "";
  }

  const flattened = paragraph
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Backticks and asterisks only. An underscore is as likely to be inside an
    // identifier as around emphasis, and `meta_img_props` has to survive.
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (flattened.length <= descriptionLimit) {
    // A paragraph introducing a code block ends on a colon, which reads as a
    // truncation once the block it introduced is gone.
    return flattened.replace(/:$/, ".");
  }

  // As many whole sentences as fit. The description is also the subtitle on the
  // page's social card, where a sentence cut in half is the first thing anyone
  // sharing the page sees.
  const whole = wholeSentences(flattened);
  if (whole !== undefined) {
    return whole;
  }

  const cut = flattened.slice(0, descriptionLimit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace === -1 ? cut : cut.slice(0, lastSpace)).replace(/[,.;:]$/, "")}...`;
}

/**
 * The longest run of whole sentences that fits, or `undefined` when even the
 * first one is too long to use on its own.
 *
 * A sentence ends at `.`, `?` or `!` followed by a space and something that
 * starts a sentence. Requiring the space keeps `1.91:1` and `index.md` whole.
 */
function wholeSentences(text: string): string | undefined {
  const sentences = text.split(/(?<=[.?!])\s+(?=[A-Z`])/);

  let taken = "";
  for (const sentence of sentences) {
    const next = taken === "" ? sentence : `${taken} ${sentence}`;
    if (next.length > descriptionLimit) {
      break;
    }
    taken = next;
  }

  return taken === "" ? undefined : taken;
}

function parseMarkdown(text: string): MarkdownParts {
  if (!text.startsWith("---\n")) {
    return { frontmatter: undefined, body: text };
  }

  const endIndex = text.indexOf("\n---", 4);
  if (endIndex === -1) {
    return { frontmatter: undefined, body: text };
  }

  const frontmatterEnd = endIndex + "\n---".length;
  return {
    frontmatter: text.slice(0, frontmatterEnd),
    body: text.slice(frontmatterEnd).replace(/^\r?\n/, ""),
  };
}

function frontmatterField(
  frontmatter: string | undefined,
  field: string,
): string | undefined {
  if (frontmatter === undefined) {
    return undefined;
  }

  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1) : value;
}

function firstHeading(body: string): string | undefined {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function stripFirstHeading(body: string): string {
  return body.replace(/^#\s+.+(?:\r?\n)+/, "");
}

async function replaceMarkedBlockInFile(
  path: string,
  startMarker: string,
  endMarker: string,
  replacement: string,
): Promise<void> {
  const text = await readFile(path, "utf8");

  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(
      `Could not find the start marker ${startMarker} in ${path}`,
    );
  }

  const contentStart = startIndex + startMarker.length;
  const endIndex = text.indexOf(endMarker, contentStart);
  if (endIndex === -1) {
    throw new Error(`Could not find the end marker ${endMarker} in ${path}`);
  }

  await writeFile(
    path,
    `${text.slice(0, contentStart)}${replacement}${text.slice(endIndex)}`,
  );
}

function assertExists(path: string, message: string): void {
  if (!existsSync(path)) {
    throw new Error(message);
  }
}

await main();
