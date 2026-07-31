/**
 * Social meta image generation for this docs site, by the package it documents.
 *
 * Colophon walks `src/content/docs/**`, renders a `banner` card per page from
 * the frontmatter each page already carries, and writes them to `public/og/`
 * along with `src/data/colophon.json`. That manifest is what
 * `src/components/Head.astro` reads to emit each page's meta tags.
 *
 * Run with `pnpm meta-img`. It also runs automatically before `pnpm build`.
 */
import { defineConfig, SIZE_PRESETS } from "@kensio/colophon";

/**
 * The indigo and pink used for the sample images in the package README, so the
 * site and the samples look like the same thing.
 */
const colors = {
  brand: "#4f46e5",
  brandDark: "#3730a3",
  brandWarm: "#db2777",
  foreground: "#ffffff",
} as const;

/** A frontmatter field that is present and has something in it. */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export default defineConfig({
  colors,
  badge: { text: "docs" },
  footer: "colophonjs.dev",

  // Landscape 1200x630 is the size social platforms use for
  // `summary_large_image`, and the only card this site points at.
  sizes: [SIZE_PRESETS.og],

  content: {
    defaultTemplate: "banner",
    // Starlight's home page is `.mdx`, which is not one of the defaults.
    extensions: [".md", ".mdx"],
    // Slugs mirror the route, so `configuration/fonts/index.md` is
    // `configuration/fonts` in both the filename and the manifest, which is the
    // key `Head.astro` looks up.
    slugStrategy: "route",
    // Every page has a title and a description. A page without a title has
    // nothing to put on a card, and returning undefined is what skips it.
    //
    // The title itself is not mapped: a post's own is used where the props
    // block sets none, and no page here declares a props block at all. Only
    // the subtitle needs saying, since it comes from `description`.
    props: (frontmatter) => {
      if (text(frontmatter.title) === undefined) return undefined;

      const subtitle = text(frontmatter.description);
      return subtitle === undefined ? {} : { subtitle };
    },
  },

  placement: { strategy: "public-dir", dir: "public/og", urlBase: "/og" },
  manifest: "src/data/colophon.json",

  // The standalone `@kensio/colophon` npm package card, referenced outside this
  // site. Same palette, but with the npm badge, the company footer and the
  // square size the npm registry uses.
  extra: [
    {
      props: { template: "banner", title: "@kensio/colophon" },
      output: "public/npm-colophon-social-meta-images.png",
      size: {
        ...SIZE_PRESETS.square,
        badge: { text: "npm" },
        footer: "kensiosoftware.co.uk",
      },
    },
  ],
});
