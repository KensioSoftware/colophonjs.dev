/**
 * Write `public/llms.txt` and `public/llms-full.txt`.
 *
 * `llms.txt` is the annotated index described at llmstxt.org: a heading, a
 * summary, then one markdown link per page with a line saying what it covers.
 * `llms-full.txt` is every page concatenated, so a model needs one fetch rather
 * than one per page.
 *
 * Called from `scaffold-docs.mts`, which passes the sections in the order the
 * sidebar uses. Both files are generated, so neither should be edited by hand.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A sidebar group: its heading in llms.txt, and its routes in reading order. */
export type LlmsSection = {
  label: string;
  /**
   * Directories under `src/content/docs`, in reading order. A page's URL comes
   * from its frontmatter `slug` where it declares one, which is not always the
   * directory it sits in.
   */
  routes: string[];
};

export type LlmsOptions = {
  /** The site repository root. */
  rootDir: string;
  /** Site origin, with no trailing slash. */
  siteUrl: string;
  /** Heading for llms.txt, which is the project rather than the site. */
  title: string;
  /** The blockquote under the heading. One paragraph on what this is. */
  summary: string;
  sections: LlmsSection[];
  /** Links worth having but not worth spending context on. */
  optional: { label: string; url: string; note: string }[];
};

type Page = {
  route: string;
  title: string;
  description: string;
  body: string;
};

/** Longest description to take from a page's opening paragraph. */
const descriptionLimit = 160;

export async function writeLlmsFiles(options: LlmsOptions): Promise<string[]> {
  const home = await readPage(options.rootDir, "");

  const sections = await Promise.all(
    options.sections.map(async (section) => ({
      label: section.label,
      pages: (
        await Promise.all(
          section.routes.map((route) => readPage(options.rootDir, route)),
        )
      ).filter((page): page is Page => page !== undefined),
    })),
  );

  // The full file first, so the index can say how big it is. A model deciding
  // whether to fetch a second file wants to know that before it does.
  const full = buildFull(options, home, sections);
  const index = buildIndex(options, sections, full.length);

  const paths = [
    join(options.rootDir, "public/llms.txt"),
    join(options.rootDir, "public/llms-full.txt"),
  ];

  await writeFile(paths[0]!, index);
  await writeFile(paths[1]!, full);

  return paths;
}

function buildIndex(
  options: LlmsOptions,
  sections: { label: string; pages: Page[] }[],
  fullBytes: number,
): string {
  const lines = [
    `# ${options.title}`,
    "",
    `> ${options.summary}`,
    "",
    `Every page below is also available as one file: ${options.siteUrl}/llms-full.txt (${describeSize(fullBytes)})`,
    "",
  ];

  for (const section of sections) {
    if (section.pages.length === 0) {
      continue;
    }

    lines.push(`## ${section.label}`, "");
    for (const page of section.pages) {
      const suffix = page.description === "" ? "" : `: ${page.description}`;
      lines.push(
        `- [${page.title}](${pageUrl(options.siteUrl, page.route)})${suffix}`,
      );
    }
    lines.push("");
  }

  if (options.optional.length > 0) {
    lines.push("## Optional", "");
    for (const link of options.optional) {
      lines.push(`- [${link.label}](${link.url}): ${link.note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildFull(
  options: LlmsOptions,
  home: Page | undefined,
  sections: { label: string; pages: Page[] }[],
): string {
  const parts = [
    `# ${options.title} documentation`,
    "",
    `> ${options.summary}`,
    "",
    `Every page from ${options.siteUrl}, in reading order.`,
    "",
  ];

  const append = (page: Page): void => {
    parts.push(
      "---",
      "",
      `# ${page.title}`,
      "",
      `Source: ${pageUrl(options.siteUrl, page.route)}`,
      "",
      absoluteLinks(page.body, options.siteUrl, page.route),
      "",
    );
  };

  if (home !== undefined) {
    append(home);
  }

  for (const section of sections) {
    for (const page of section.pages) {
      append(page);
    }
  }

  return parts.join("\n");
}

/**
 * Read one page out of the built content collection. The route is the path
 * under `src/content/docs`, and an empty one is the home page.
 */
async function readPage(
  rootDir: string,
  route: string,
): Promise<Page | undefined> {
  const dir = join(rootDir, "src/content/docs", route);
  const file = [join(dir, "index.md"), join(dir, "index.mdx")].find((path) =>
    existsSync(path),
  );

  if (file === undefined) {
    console.warn(`llms.txt: no page at ${route === "" ? "/" : route}`);
    return undefined;
  }

  const text = await readFile(file, "utf8");
  const { frontmatter, body } = splitFrontmatter(text);
  const clean = stripMdx(body).trim();

  return {
    // A page can be served from somewhere other than the directory holding it,
    // so the declared slug wins over the path when there is one.
    route: field(frontmatter, "slug") ?? route,
    title: field(frontmatter, "title") ?? route,
    // The scaffolds write descriptions like "Documentation for assertOneOf.",
    // which say nothing. A page's opening paragraph says what it is for, and
    // that is what an index of links is for.
    description: summarise(clean) || (field(frontmatter, "description") ?? ""),
    body: clean,
  };
}

/**
 * MDX scaffolding, which is markup rather than content: the component imports
 * at the top of a page and the components themselves. What they render is
 * links and cards, which the index already carries.
 */
function stripMdx(body: string): string {
  return body
    .replace(/^import\s+.*$/gm, "")
    .replace(/^\{\/\*[\s\S]*?\*\/\}$/gm, "")
    .replace(/<([A-Z]\w*)\b[\s\S]*?<\/\1>/g, "")
    .replace(/<[A-Z]\w*\b[^>]*\/>/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** A one-line description from the page's opening paragraph. */
function summarise(body: string): string {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => /^[A-Za-z`*[]/.test(block) && !block.startsWith("|"));

  if (paragraph === undefined) {
    return "";
  }

  const flattened = paragraph
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (flattened.length <= descriptionLimit) {
    return tidyTail(flattened);
  }

  // As many whole sentences as fit, rather than a sentence cut in half.
  let taken = "";
  for (const sentence of flattened.split(/(?<=[.?!])\s+(?=[A-Z`])/)) {
    const next = taken === "" ? sentence : `${taken} ${sentence}`;
    if (next.length > descriptionLimit) {
      break;
    }
    taken = next;
  }

  if (taken !== "") {
    return tidyTail(taken);
  }

  const cut = flattened.slice(0, descriptionLimit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace === -1 ? cut : cut.slice(0, lastSpace)).replace(/[,.;:]$/, "")}...`;
}

/**
 * A paragraph introducing a code block ends on a colon, and the block it
 * introduced is not coming. Drop that sentence where there is another one to
 * fall back on, so a description does not trail off on "For example".
 */
function tidyTail(text: string): string {
  if (!text.endsWith(":")) {
    return text;
  }

  const sentences = text.split(/(?<=[.?!])\s+(?=[A-Z`])/);
  if (sentences.length > 1) {
    sentences.pop();
    return sentences.join(" ");
  }

  return text.replace(/:$/, ".");
}

/**
 * Make a page's relative links absolute. They resolve against the page's own
 * route, which stops meaning anything once every page is one document.
 */
function absoluteLinks(body: string, siteUrl: string, route: string): string {
  const base = pageUrl(siteUrl, route);

  return body.replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (match, href, title) => {
    if (/^(https?:|mailto:|#)/.test(String(href))) {
      return match;
    }
    return `](${new URL(String(href), base).href}${title ?? ""})`;
  });
}

/** A page's canonical URL. The home page's route is empty, not `/`. */
function pageUrl(siteUrl: string, route: string): string {
  return route === "" ? `${siteUrl}/` : `${siteUrl}/${route}/`;
}

function splitFrontmatter(text: string): {
  frontmatter: string | undefined;
  body: string;
} {
  if (!text.startsWith("---\n")) {
    return { frontmatter: undefined, body: text };
  }

  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: undefined, body: text };
  }

  return {
    frontmatter: text.slice(0, end + "\n---".length),
    body: text.slice(end + "\n---".length).replace(/^\r?\n/, ""),
  };
}

function field(
  frontmatter: string | undefined,
  name: string,
): string | undefined {
  const value = frontmatter
    ?.match(new RegExp(`^${name}:\\s*(.*)$`, "m"))?.[1]
    ?.trim();

  if (value === undefined || value.length === 0) {
    return undefined;
  }

  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));

  return quoted ? value.slice(1, -1) : value;
}

function describeSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `about ${Math.round(bytes / 1024)}KB`
    : `about ${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
