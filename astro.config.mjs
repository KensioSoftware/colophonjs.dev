// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

import preact from "@astrojs/preact";

// Per-page social images come from Colophon itself (see colophon.config.ts),
// and the tags are emitted by src/components/Head.astro, so there are no
// hardcoded og: tags here.
export default defineConfig({
  site: "https://colophonjs.dev",

  vite: {
    resolve: {
      // The playground renders images in the browser with
      // `@kensio/colophon/core`, whose two Node-shaped modules are swapped for
      // browser versions by the package's `browser` field. Vite honours that
      // when it builds for the browser, and not when it builds the static
      // entrypoints, where the Node rasteriser reaches resvg's native binary
      // and the build stops on a `.node` file it cannot read.
      //
      // Both builds are pointed at the browser versions here. Nothing is lost
      // by that: the island is `client:only`, so the server never renders it,
      // and this is the one thing on the site importing the package. Image
      // generation for the site's own cards runs `colophon` as a CLI in its
      // own process (see colophon.config.ts) and is untouched by any of this.
      alias: [
        {
          find: /platform\/rasteriser\.node\.js$/,
          replacement: "platform/rasteriser.browser.js",
        },
        {
          find: /platform\/read-file\.node\.js$/,
          replacement: "platform/read-file.browser.js",
        },
      ],
    },
  },

  integrations: [
    starlight({
      title: "Colophon",
      description:
        "Documentation for Colophon, which generates social meta images for the posts of a static website from their frontmatter.",
      logo: {
        src: "./src/assets/colophon.png",
        alt: "Colophon logo",
        replacesTitle: false,
      },
      favicon: "/favicon.png",
      components: {
        Footer: "./src/components/Footer.astro",
        Head: "./src/components/Head.astro",
      },
      social: [
        {
          icon: "npm",
          label: "npm",
          href: "https://www.npmjs.com/package/@kensio/colophon",
        },
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/KensioSoftware/colophon",
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", slug: "" },
            // start-sidebar:start
            { label: "Getting started", slug: "getting-started" },
            // start-sidebar:end
            // Outside the marked block on purpose: this page belongs to this
            // site rather than to the colophon repo, and scaffold-docs rewrites
            // whatever is between the markers.
            { label: "Playground", slug: "playground" },
          ],
        },
        {
          label: "Guides",
          items: [
            // guide-sidebar:start
            { label: "The command line", slug: "cli" },
            { label: "Templates", slug: "templates" },
            { label: "The code template", slug: "code-template" },
            { label: "Astro", slug: "astro" },
            { label: "The browser-safe core", slug: "core" },
            { label: "The layout toolkit", slug: "layout" },
            { label: "Rebuilds", slug: "rebuilds" },
            { label: "Programmatic use", slug: "programmatic-use" },
            { label: "Upgrading", slug: "upgrading" },
            // guide-sidebar:end
          ],
        },
        {
          label: "Configuration",
          items: [
            // config-sidebar:start
            { label: "Overview", slug: "configuration" },
            { label: "Frontmatter", slug: "configuration/frontmatter" },
            { label: "Fonts", slug: "configuration/fonts" },
            {
              label: "Themes and background treatments",
              slug: "configuration/themes",
            },
            { label: "Rasteriser", slug: "configuration/rasteriser" },
            { label: "Output formats", slug: "configuration/formats" },
            { label: "File size", slug: "configuration/compression" },
            {
              label: "Logos, avatars and photographs",
              slug: "configuration/images",
            },
            {
              label: "Output sizes and filenames",
              slug: "configuration/sizes",
            },
            { label: "Per-size config", slug: "configuration/per-size-config" },
            { label: "Placement", slug: "configuration/placement" },
            { label: "Manifest", slug: "configuration/manifest" },
            { label: "Social meta tags", slug: "configuration/meta-tags" },
            { label: "One-off images", slug: "configuration/extra-images" },
            { label: "Warnings", slug: "configuration/warnings" },
            // config-sidebar:end
          ],
        },
      ],
    }),
    preact(),
  ],
});
