/**
 * JSON-LD for the docs pages, emitted by `src/components/Head.astro`.
 *
 * Three things are described. Breadcrumbs, which are the one piece here that
 * Google turns into a visible result. A TechArticle per page, which is not
 * rendered as anything but does say what each page is and who published it.
 * And, on the home page, the package itself, tying this site to the npm
 * package, the repository and Kensio Software.
 *
 * Titles come from the Colophon manifest rather than a second index of the
 * page tree, since it already holds one per route and `Head.astro` already
 * reads it.
 */
import type { Manifest } from "@kensio/colophon";

const packageName = "@kensio/colophon";
const repository = "https://github.com/KensioSoftware/colophon";
const npmPackage = "https://www.npmjs.com/package/@kensio/colophon";

const publisher = {
  "@type": "Organization",
  name: "Kensio Software",
  url: "https://kensiosoftware.co.uk/",
} as const;

/** A page's route slug, as the manifest keys them. The home page is `index`. */
export function slugFromPathname(pathname: string): string {
  const path = pathname.replace(/^\/+|\/+$/g, "");
  return path === "" ? "index" : path;
}

/** The absolute URL of a page's widest social image, when it has one. */
function imageUrl(
  manifest: Manifest,
  slug: string,
  baseUrl: string,
): string | undefined {
  const page = manifest.pages[slug];
  const image = page === undefined ? undefined : page.images[page.widest];
  if (image?.url === undefined) {
    return undefined;
  }

  return new URL(image.url, baseUrl).href;
}

/**
 * The trail from the home page down to this one.
 *
 * An ancestor with no manifest entry is skipped rather than guessed at: it
 * would be a directory with no page of its own, so there is nothing to link to.
 */
function breadcrumbTrail(
  manifest: Manifest,
  slug: string,
  baseUrl: string,
): { name: string; url: string }[] {
  const home = manifest.pages["index"];
  const trail = [
    { name: home?.alt ?? "Colophon", url: new URL("/", baseUrl).href },
  ];

  if (slug === "index") {
    return trail;
  }

  let route = "";
  for (const segment of slug.split("/")) {
    route = route === "" ? segment : `${route}/${segment}`;
    const page = manifest.pages[route];
    if (page?.alt !== undefined) {
      trail.push({ name: page.alt, url: new URL(`/${route}/`, baseUrl).href });
    }
  }

  return trail;
}

/**
 * Every JSON-LD object for one page, as the array a single `<script>` holds.
 */
export function structuredData({
  manifest,
  pathname,
  baseUrl,
  title,
  description,
}: {
  manifest: Manifest;
  pathname: string;
  baseUrl: string;
  title: string;
  description: string;
}): unknown[] {
  const slug = slugFromPathname(pathname);
  const url = new URL(pathname, baseUrl).href;
  const image = imageUrl(manifest, slug, baseUrl);
  const trail = breadcrumbTrail(manifest, slug, baseUrl);

  const website = {
    "@type": "WebSite",
    name: "Colophon",
    url: new URL("/", baseUrl).href,
  };

  const data: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: title,
      description,
      url,
      inLanguage: "en",
      isPartOf: website,
      publisher,
      ...(image === undefined ? {} : { image }),
    },
  ];

  // Nothing to describe on the home page, where the trail is just itself.
  if (trail.length > 1) {
    data.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    });
  }

  if (slug === "index") {
    data.push({
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: packageName,
      description,
      url: new URL("/", baseUrl).href,
      codeRepository: repository,
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js",
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      author: publisher,
      maintainer: publisher,
      sameAs: [npmPackage, repository],
    });
  }

  return data;
}

/**
 * JSON for a `<script>` body. A `<` inside a string would otherwise be read as
 * markup and could close the script early.
 */
export function serialise(data: unknown): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}
