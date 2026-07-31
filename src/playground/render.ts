/**
 * Turning what someone typed into an image, and saying what went wrong when it
 * does not.
 *
 * This is the whole of the playground that is not user interface, kept apart
 * from it so the awkward cases have somewhere to be handled once: a config that
 * is not valid JSON yet because the caret is halfway through a key, frontmatter
 * that describes a post Colophon would skip, an option that only works where
 * there is a filesystem.
 *
 * Everything here comes from `@kensio/colophon/core`, the entry point that
 * holds no Node. See its docs for the two things it cannot do.
 *
 * It is imported dynamically, and the type-only import above it is what keeps
 * that honest: types are erased, so nothing but `core()` reaches the package at
 * runtime. Two things follow. The build never resolves it for the server, where
 * `/core` is the Node halves and pulls resvg's native binary in with them. And
 * the templates, the measuring and Shiki's grammars arrive in a chunk of their
 * own, when someone opens the playground rather than when they open the site.
 */
import type {
  ColophonConfig,
  MetaImageProps,
  OutputSize,
  ResolvedConfig,
} from "@kensio/colophon/core";
import { parse as parseYaml } from "yaml";

import {
  locateConfigProblem,
  locateJsonError,
  locateYamlError,
  type Range,
} from "./locate.js";

type Core = typeof import("@kensio/colophon/core");

let loading: Promise<Core> | undefined;

/** The core, loaded once and shared by every render after the first. */
function core(): Promise<Core> {
  loading ??= import("@kensio/colophon/core");
  return loading;
}

export type Failure = {
  /** Which editor to point at, or `undefined` for a whole-render failure. */
  readonly field: "config" | "frontmatter" | undefined;
  readonly message: string;
  /**
   * Where in that editor the problem is, when it was possible to work out. The
   * editor underlines these and lists the rest underneath itself.
   */
  readonly range?: Range;
};

export type Rendered = {
  readonly svg: string;
  readonly size: OutputSize;
  readonly config: ResolvedConfig;
  readonly props: MetaImageProps;
  /** Compromises the template reported, which are not failures. */
  readonly warnings: readonly string[];
};

export type Outcome =
  | {
      readonly ok: true;
      readonly rendered: Rendered;
      readonly sizes: readonly OutputSize[];
    }
  | { readonly ok: false; readonly failures: readonly Failure[] };

/**
 * Frontmatter as someone would paste it, fences and all.
 *
 * People copy a post, not a YAML fragment, so the `---` rules come with it. A
 * body after the closing fence is dropped rather than refused: it is the rest
 * of their post, and they are not wrong to have pasted it.
 */
function stripFences(text: string): { yaml: string; offset: number } {
  const match = text.match(/^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n[\s\S]*)?$/);
  const yaml = match?.[1];
  if (yaml === undefined) {
    return { yaml: text, offset: 0 };
  }

  // Where the YAML starts in the text the editor is showing, so a position the
  // parser reports still points at the right character once the fence is back.
  return { yaml, offset: text.indexOf(yaml) };
}

/**
 * A parse error with the noise taken off. Both parsers name a line and column,
 * which is worth keeping, but YAML's runs to several lines of context that has
 * nowhere to go in a message beside an editor.
 */
function parseMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0]?.trim() ?? "Could not parse this.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfig(text: string): ColophonConfig | Failure {
  if (text.trim() === "") {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = parseMessage(error);
    return { field: "config", message, range: locateJsonError(text, message) };
  }

  if (!isRecord(parsed)) {
    return {
      field: "config",
      message: "A config is a JSON object, so this needs to start with {.",
    };
  }

  return parsed as ColophonConfig;
}

function parseFrontmatter(text: string): Record<string, unknown> | Failure {
  const { yaml, offset } = stripFences(text);
  if (yaml.trim() === "") {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(yaml);
  } catch (error) {
    return {
      field: "frontmatter",
      message: parseMessage(error),
      range: locateYamlError(error, offset),
    };
  }

  if (!isRecord(parsed)) {
    return {
      field: "frontmatter",
      message: "Frontmatter should be a set of keys and values.",
    };
  }

  return parsed;
}

function isFailure(value: unknown): value is Failure {
  return isRecord(value) && typeof value.message === "string";
}

/**
 * `resolveConfig` rejects a font or an image given as a path, because there is
 * no filesystem here to resolve one against. That is right, and its wording is
 * right for a build, where the fix is to supply bytes. Here the fix is to stop
 * expecting it to work, so it says so in those terms instead.
 */
function explainResolveFailure(message: string): string {
  return /no filesystem/i.test(message)
    ? `${message} The playground has no filesystem, so a file path cannot be ` +
        "read here. It will work in a real build."
    : message;
}

/**
 * Render one image, or say why not.
 *
 * Both inputs are parsed before either is used, so someone with a typo in each
 * is told about both rather than being sent round twice.
 */
export async function render(
  configText: string,
  frontmatterText: string,
  sizeName: string | undefined,
): Promise<Outcome> {
  const config = parseConfig(configText);
  const frontmatter = parseFrontmatter(frontmatterText);

  const failures = [config, frontmatter].filter(isFailure);
  if (failures.length > 0) {
    return { ok: false, failures };
  }

  // Awaited after the parsing above, so a keystroke that could not have
  // rendered anything is answered without waiting for a megabyte of chunk.
  const { buildSvg, configProblems, extractProps, resolveConfig } =
    await core();

  // Not a throw, so three mistyped options are three messages beside the
  // editor rather than one message per attempt at fixing them.
  const problems = configProblems(config as ColophonConfig);
  if (problems.length > 0) {
    return {
      ok: false,
      failures: problems.map((message) => ({
        field: "config" as const,
        message,
        range: locateConfigProblem(configText, message),
      })),
    };
  }

  const warnings: string[] = [];
  let resolved: ResolvedConfig;
  try {
    resolved = resolveConfig({
      ...(config as ColophonConfig),
      onWarning: (message) => warnings.push(message),
    });
  } catch (error) {
    return {
      ok: false,
      failures: [
        {
          field: "config",
          message: explainResolveFailure(parseMessage(error)),
        },
      ],
    };
  }

  const props = extractProps(
    frontmatter as Record<string, unknown>,
    (config as ColophonConfig).content,
  );
  if (props === undefined) {
    return {
      ok: false,
      failures: [
        {
          field: "frontmatter",
          message:
            'This frontmatter does not ask for an image. Add a "meta_img_props" ' +
            'block, or set "content.defaultTemplate" in the config and give ' +
            "this post a title.",
        },
      ],
    };
  }

  const sizes = resolved.sizes;
  const size = sizes.find((each) => each.name === sizeName) ?? sizes[0];
  if (size === undefined) {
    return {
      ok: false,
      failures: [
        { field: "config", message: "The sizes list in this config is empty." },
      ],
    };
  }

  try {
    const svg = await buildSvg(props, resolved, size);
    return {
      ok: true,
      rendered: { svg, size, config: resolved, props, warnings },
      sizes,
    };
  } catch (error) {
    return {
      ok: false,
      failures: [{ field: undefined, message: parseMessage(error) }],
    };
  }
}
