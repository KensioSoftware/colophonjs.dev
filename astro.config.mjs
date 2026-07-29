// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Per-page social images come from Colophon itself (see colophon.config.ts),
// and the tags are emitted by src/components/Head.astro, so there are no
// hardcoded og: tags here.
export default defineConfig({
  site: "https://colophonjs.dev",
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
          ],
        },
        {
          label: "Guides",
          items: [
            // guide-sidebar:start
            { label: "Templates", slug: "templates" },
            { label: "The code template", slug: "code-template" },
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
  ],
});
