/**
 * The playground: a config, a post's frontmatter, and the image they make.
 *
 * Config is JSON rather than the JavaScript a real project writes. Colophon's
 * `resolveConfig` takes a plain object either way, so nothing is lost in the
 * rendering path: the options that have to be functions are the ones about
 * finding posts and writing files, and there are no posts or files here.
 *
 * Frontmatter is YAML, fences and all, because that is what people have in
 * front of them to paste.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import { CodeEditor } from "./CodeEditor.js";
import {
  canCopyImages,
  copyPng,
  download,
  svgDataUri,
  toPng,
} from "./export.js";
import { render, type Failure, type Outcome } from "./render.js";
import { decodeState, encodeState } from "./share.js";

const defaultConfig = `{
  "theme": "midnight",
  "colors": {
    "brand": "#4f46e5",
    "brandWarm": "#db2777"
  },
  "badge": { "text": "blog" },
  "footer": "example.com"
}`;

/**
 * The props go in `meta_img_props` rather than being mapped from the `title`
 * and `description` a post already has, which is what most projects do. That
 * mapping is `content.props`, and it is a function, so it is one of the few
 * things a JSON config here cannot say. See the note under the playground.
 */
const defaultFrontmatter = `---
title: The unreasonable effectiveness of doing it twice
description: Why the second attempt is where the design shows up.
meta_img_props:
  template: banner
  title: The unreasonable effectiveness of doing it twice
  subtitle: Why the second attempt is where the design shows up
---`;

/** How long to wait after a keystroke before rendering again. */
const debounceMs = 200;

type Status =
  { readonly message: string; readonly tone: "ok" | "bad" } | undefined;

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return settled;
}

export default function Playground() {
  const [configText, setConfigText] = useState(defaultConfig);
  const [frontmatterText, setFrontmatterText] = useState(defaultFrontmatter);
  const [sizeName, setSizeName] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  const [status, setStatus] = useState<Status>(undefined);
  const [ready, setReady] = useState(false);

  // The last image that rendered, kept while a later keystroke is failing, so
  // the preview does not blink out to nothing between a `{` and its `}`.
  const lastGood = useRef<Outcome | undefined>(undefined);

  const debouncedConfig = useDebounced(configText, debounceMs);
  const debouncedFrontmatter = useDebounced(frontmatterText, debounceMs);

  // A shared link is read once, before the first render, so that opening one
  // shows what was shared rather than the defaults for a frame first.
  useEffect(() => {
    void (async () => {
      const shared = await decodeState(window.location.search);
      if (shared !== undefined) {
        setConfigText(shared.config);
        setFrontmatterText(shared.frontmatter);
        setSizeName(shared.size);
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let current = true;
    void (async () => {
      const next = await render(
        debouncedConfig,
        debouncedFrontmatter,
        sizeName,
      );
      if (!current) {
        return;
      }
      if (next.ok) {
        lastGood.current = next;
      }
      setOutcome(next);
    })();

    return () => {
      current = false;
    };
  }, [debouncedConfig, debouncedFrontmatter, sizeName, ready]);

  const failuresFor = useCallback(
    (field: Failure["field"]): readonly Failure[] =>
      outcome !== undefined && !outcome.ok
        ? outcome.failures.filter((failure) => failure.field === field)
        : [],
    [outcome],
  );

  const shown = outcome?.ok === true ? outcome : lastGood.current;
  const stale = outcome !== undefined && !outcome.ok && shown !== undefined;

  const generalFailures = failuresFor(undefined);

  const preview = useMemo(
    () => (shown?.ok === true ? svgDataUri(shown.rendered.svg) : undefined),
    [shown],
  );

  const announce = useCallback((message: string, tone: "ok" | "bad") => {
    setStatus({ message, tone });
    setTimeout(() => {
      setStatus(undefined);
    }, 2500);
  }, []);

  const pngFor = useCallback(async (): Promise<Blob> => {
    if (shown?.ok !== true) {
      throw new Error("There is no image to export yet.");
    }
    const { svg, size } = shown.rendered;
    return await toPng(svg, size.width, size.height);
  }, [shown]);

  const onCopy = useCallback(() => {
    // Handed the promise rather than awaited: Safari wants the clipboard
    // write to start in the click that asked for it.
    copyPng(pngFor()).then(
      () => {
        announce("Copied. You can paste it anywhere.", "ok");
      },
      () => {
        announce(
          "The browser would not take it. Try downloading instead.",
          "bad",
        );
      },
    );
  }, [pngFor, announce]);

  const onDownload = useCallback(() => {
    void (async () => {
      try {
        const blob = await pngFor();
        const name = shown?.ok === true ? shown.rendered.size.name : "image";
        download(blob, `colophon-${name}.png`);
      } catch {
        announce("Could not render that to a file.", "bad");
      }
    })();
  }, [pngFor, shown, announce]);

  const onShare = useCallback(() => {
    void (async () => {
      const query = await encodeState({
        config: configText,
        frontmatter: frontmatterText,
        ...(sizeName === undefined ? {} : { size: sizeName }),
      });
      const url = `${window.location.origin}${window.location.pathname}?${query}`;

      // Replaced rather than pushed: this is the same page showing the same
      // thing, and a back button that walks every copied link is a nuisance.
      window.history.replaceState(null, "", url);

      try {
        await navigator.clipboard.writeText(url);
        announce("Link copied.", "ok");
      } catch {
        announce("The link is in the address bar.", "ok");
      }
    })();
  }, [configText, frontmatterText, sizeName, announce]);

  const sizes = shown?.ok === true ? shown.sizes : [];
  const warnings = shown?.ok === true ? shown.rendered.warnings : [];

  // `not-content` opts this subtree out of Starlight's prose styling. Without
  // it, the rule that puts a top margin on any element following a sibling
  // applies inside the toolbar, and every button after the first sits lower
  // than the one before it.
  return (
    <div class="pg not-content">
      <div class="pg-inputs">
        <CodeEditor
          label="Config"
          hint="JSON, the same options a colophon.config.ts sets"
          language="json"
          value={configText}
          onInput={setConfigText}
          failures={failuresFor("config")}
        />
        <CodeEditor
          label="Post frontmatter"
          hint="YAML, exactly as it appears at the top of a post"
          language="yaml"
          value={frontmatterText}
          onInput={setFrontmatterText}
          failures={failuresFor("frontmatter")}
        />
      </div>

      <div class="pg-output">
        <div class="pg-toolbar">
          {sizes.length > 1 && (
            <div class="pg-sizes" role="group" aria-label="Output size">
              {sizes.map((size) => {
                const active =
                  shown?.ok === true && shown.rendered.size.name === size.name;
                return (
                  <button
                    key={size.name}
                    type="button"
                    class={`pg-size${active ? " pg-size-on" : ""}`}
                    aria-pressed={active}
                    onClick={() => {
                      setSizeName(size.name);
                    }}
                  >
                    {size.name}
                    <span class="pg-size-dims">
                      {size.width}×{size.height}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div class="pg-actions">
            {canCopyImages() && (
              <button
                type="button"
                class="pg-button"
                onClick={onCopy}
                disabled={preview === undefined}
              >
                Copy image
              </button>
            )}
            <button
              type="button"
              class="pg-button"
              onClick={onDownload}
              disabled={preview === undefined}
            >
              Download PNG
            </button>
            <button
              type="button"
              class="pg-button pg-button-primary"
              onClick={onShare}
            >
              Copy link
            </button>
          </div>
        </div>

        <div class={`pg-preview${stale ? " pg-preview-stale" : ""}`}>
          {preview === undefined ? (
            <p class="pg-empty">
              {ready
                ? "Fix the problems above to see an image."
                : "Starting up…"}
            </p>
          ) : (
            <img
              class="pg-image"
              src={preview}
              alt="The rendered social meta image"
              width={shown?.ok === true ? shown.rendered.size.width : undefined}
              height={
                shown?.ok === true ? shown.rendered.size.height : undefined
              }
            />
          )}
        </div>

        {generalFailures.length > 0 && (
          <ul class="pg-problems pg-problems-general">
            {generalFailures.map((failure) => (
              <li key={failure.message}>{failure.message}</li>
            ))}
          </ul>
        )}

        {warnings.length > 0 && (
          <ul class="pg-warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        <p class="pg-status" role="status" aria-live="polite">
          {status !== undefined && (
            <span
              class={status.tone === "ok" ? "pg-status-ok" : "pg-status-bad"}
            >
              {status.message}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
