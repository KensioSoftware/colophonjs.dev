/**
 * A starting point per template, so the playground opens on something worth
 * looking at rather than an empty editor.
 *
 * Each one is a whole config and a whole post, written to show what that
 * template is for. They are examples to take apart, so the values are the kind
 * a real site would carry: a theme that suits the subject, a footer with a
 * domain in it, and text of a length the layout actually has to deal with.
 *
 * The order is roughly how often a site would reach for them, with `banner`
 * first because it is the one most posts use.
 */
export type Preset = {
  /** Stable across releases: it goes in shared links. */
  readonly id: string;
  readonly label: string;
  /** What this template is for, shown under the tabs. */
  readonly note: string;
  readonly config: string;
  readonly frontmatter: string;
};

function config(body: string): string {
  return `${body.trim()}\n`.replace(/\n+$/, "");
}

export const presets: readonly Preset[] = [
  {
    id: "banner",
    label: "Banner",
    note: "A left-aligned title with a corner badge. What most posts use.",
    config: config(`{
  "theme": "midnight",
  "colors": {
    "brand": "#4f46e5",
    "brandWarm": "#db2777"
  },
  "badge": { "text": "blog" },
  "footer": "example.com"
}`),
    frontmatter: `---
title: Setting up continuous integration
description: A walkthrough of the build, test and deploy steps.
meta_img_props:
  template: banner
  subtitle: A walkthrough of the build, test and deploy steps
---`,
  },
  {
    id: "article",
    label: "Article",
    note: "Tags, headline and standfirst, with a byline along the bottom.",
    config: config(`{
  "theme": "slate",
  "colors": { "brand": "#0d9488" },
  "footer": "example.com"
}`),
    frontmatter: `---
title: Keep test state inside each test case
meta_img_props:
  template: article
  subtitle: Shared fixtures save a few lines and cost you the ability to read one test on its own
  tags: [typescript, testing]
  author: Ada Lovelace
  date: 30 July 2026
---`,
  },
  {
    id: "code",
    label: "Code",
    note: "A syntax-highlighted snippet, coloured by a real editor theme.",
    config: config(`{
  "theme": "midnight",
  "code": { "theme": "github-dark" },
  "footer": "example.com"
}`),
    frontmatter: `---
title: A moving average in Python
meta_img_props:
  template: code
  title: stats.py
  language: python
  code: |
    def moving_average(values, window):
        if window < 1:
            raise ValueError("window must be at least 1")

        return [
            sum(values[i : i + window]) / window
            for i in range(len(values) - window + 1)
        ]
---`,
  },
  {
    id: "terminal",
    label: "Terminal",
    note: "A command and what it printed, in window chrome.",
    config: config(`{
  "theme": "slate",
  "code": { "theme": "github-dark" },
  "footer": "example.com"
}`),
    frontmatter: `---
title: Rendering a content tree
meta_img_props:
  template: terminal
  title: colophon
  command: colophon src/content --config colophon.config.ts
  output: |
    wrote public/og/getting-started-og.png
    wrote public/og/configuration-og.png
    Done: 14 written, 7 skipped.
---`,
  },
  {
    id: "quote",
    label: "Quote",
    note: "A pull quote with the speaker under it. No logo: the words are the image.",
    config: config(`{
  "theme": "ember",
  "footer": "example.com"
}`),
    frontmatter: `---
title: On layouts
meta_img_props:
  template: quote
  quote: A template is a layout, and a layout is arithmetic you can look at.
  author: Ada Lovelace
  role: Example Software
---`,
  },
  {
    id: "release",
    label: "Release",
    note: "A version, what it is, and the headline changes as a list.",
    config: config(`{
  "theme": "forest",
  "badge": { "text": "release" },
  "footer": "example.com"
}`),
    frontmatter: `---
title: Version 2.8.0
meta_img_props:
  template: release
  version: 2.8.0
  title: Templates, themes and a browser-safe core
  changes:
    - Nine more templates to choose from
    - A manifest of every image a build wrote
    - WebP, JPEG and AVIF as well as PNG
---`,
  },
  {
    id: "stat",
    label: "Stat",
    note: "One figure, with a label above it and a caption below.",
    config: config(`{
  "theme": "aurora",
  "footer": "example.com"
}`),
    frontmatter: `---
title: Downloads this month
meta_img_props:
  template: stat
  stat: 1.4M
  subtitle: Up from 900k in June
---`,
  },
  {
    id: "docs",
    label: "Docs",
    note: "A breadcrumb trail, a rule, then the page title. Docs pages share badly alone.",
    // No `colors` here on purpose. A theme supplies its palette only when the
    // config names none at all, so setting one colour drops the rest back to
    // the defaults. On a light theme that means white text on near-white
    // paper. Override the theme's brand by naming `foreground` alongside it.
    config: config(`{
  "theme": "paper",
  "footer": "example.com"
}`),
    frontmatter: `---
title: Fonts
meta_img_props:
  template: docs
  breadcrumb: [Docs, Configuration, Fonts]
  subtitle: Load font files so a build renders the same image everywhere
---`,
  },
  {
    id: "event",
    label: "Event",
    note: "A date on a plate, then what the event is and where.",
    config: config(`{
  "theme": "bloom",
  "footer": "example.com"
}`),
    frontmatter: `---
title: Rendering text without a browser
meta_img_props:
  template: event
  date: 14 November 2026
  location: Bristol JS, The Old Fire Station
---`,
  },
  {
    id: "card",
    label: "Card",
    note: "A centred title and little else. For pages that need no framing.",
    config: config(`{
  "theme": "sandstone",
  "footer": "example.com"
}`),
    frontmatter: `---
title: About
meta_img_props:
  template: card
  subtitle: Who we are and what we make
---`,
  },
  {
    id: "wordmark",
    label: "Wordmark",
    note: "A name and tagline, for when the thing shared is the project rather than a post.",
    config: config(`{
  "theme": "midnight",
  "colors": { "brand": "#4f46e5", "brandWarm": "#db2777" },
  "footer": "example.com"
}`),
    frontmatter: `---
title: "@example/colophon"
meta_img_props:
  template: wordmark
  subtitle: Social meta images from frontmatter
---`,
  },
];

export const defaultPreset = presets[0] as Preset;

export function presetById(id: string | undefined): Preset | undefined {
  return presets.find((preset) => preset.id === id);
}
