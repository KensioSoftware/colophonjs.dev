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
import { defaultPreset, presetById, presets } from "./presets.js";
import { render, type Failure, type Outcome } from "./render.js";
import { decodeState, encodeState } from "./share.js";

/** How long to wait after a keystroke before rendering again. */
const debounceMs = 200;

/**
 * What one tab holds. Each preset keeps its own, so going to look at what the
 * `quote` template does and coming back finds the banner as it was left.
 */
type Draft = {
  readonly config: string;
  readonly frontmatter: string;
  readonly size?: string;
};

type Drafts = Readonly<Record<string, Draft>>;

function draftsFromPresets(): Drafts {
  return Object.fromEntries(
    presets.map((preset) => [
      preset.id,
      { config: preset.config, frontmatter: preset.frontmatter },
    ]),
  );
}

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
  const [drafts, setDrafts] = useState<Drafts>(draftsFromPresets);
  const [activeId, setActiveId] = useState(defaultPreset.id);
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  const [status, setStatus] = useState<Status>(undefined);
  const [ready, setReady] = useState(false);

  const preset = presetById(activeId) ?? defaultPreset;
  const draft = drafts[activeId] ?? {
    config: preset.config,
    frontmatter: preset.frontmatter,
  };
  const { config: configText, frontmatter: frontmatterText } = draft;
  const sizeName = draft.size;

  // The last image that rendered, kept while a later keystroke is failing, so
  // the preview does not blink out to nothing between a `{` and its `}`.
  const lastGood = useRef<Outcome | undefined>(undefined);

  const debouncedConfig = useDebounced(configText, debounceMs);
  const debouncedFrontmatter = useDebounced(frontmatterText, debounceMs);

  const editDraft = useCallback(
    (id: string, change: Partial<Draft>) => {
      setDrafts((current) => {
        const existing = current[id];
        if (existing === undefined) {
          return current;
        }
        return { ...current, [id]: { ...existing, ...change } };
      });
    },
    [setDrafts],
  );

  // A shared link is read once, before the first render, so that opening one
  // shows what was shared rather than a preset for a frame first.
  useEffect(() => {
    void (async () => {
      const shared = await decodeState(window.location.search);
      if (shared !== undefined) {
        // A link from a later version may name a preset this one has never
        // heard of. The text it carries is still worth showing, so it goes on
        // the default tab rather than being dropped.
        const target = presetById(shared.preset) ?? defaultPreset;
        setActiveId(target.id);
        editDraft(target.id, {
          config: shared.config,
          frontmatter: shared.frontmatter,
          size: shared.size,
        });
      }
      setReady(true);
    })();
  }, [editDraft]);

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
        preset: activeId,
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
  }, [configText, frontmatterText, sizeName, activeId, announce]);

  /**
   * Switching tabs drops the image on screen rather than dimming it.
   * `lastGood` exists so a half-typed config keeps showing the last good
   * render of the same thing, and a banner left behind while the quote
   * template renders is not that.
   */
  const onSelectPreset = useCallback(
    (id: string) => {
      // Clicking the tab already open would otherwise clear the image and
      // leave nothing to bring it back: the render only reruns when the text
      // it renders from changes, and selecting the same tab changes nothing.
      if (id === activeId) {
        return;
      }

      lastGood.current = undefined;
      setOutcome(undefined);
      setActiveId(id);
    },
    [activeId],
  );

  const onReset = useCallback(() => {
    editDraft(preset.id, {
      config: preset.config,
      frontmatter: preset.frontmatter,
      size: undefined,
    });
  }, [preset, editDraft]);

  const edited =
    draft.config !== preset.config || draft.frontmatter !== preset.frontmatter;

  const sizes = shown?.ok === true ? shown.sizes : [];
  const warnings = shown?.ok === true ? shown.rendered.warnings : [];

  // `not-content` opts this subtree out of Starlight's prose styling. Without
  // it, the rule that puts a top margin on any element following a sibling
  // applies inside the toolbar, and every button after the first sits lower
  // than the one before it.
  return (
    <div class="pg not-content">
      <div class="pg-tabs" role="tablist" aria-label="Template">
        {presets.map((each) => (
          <button
            key={each.id}
            id={`pg-tab-${each.id}`}
            type="button"
            role="tab"
            class={`pg-tab${each.id === activeId ? " pg-tab-on" : ""}`}
            aria-selected={each.id === activeId}
            aria-controls="pg-panel"
            onClick={() => {
              onSelectPreset(each.id);
            }}
          >
            {each.label}
          </button>
        ))}
      </div>

      <p class="pg-note">
        <span>{preset.note}</span>
        {edited && (
          <button type="button" class="pg-reset" onClick={onReset}>
            Reset this tab
          </button>
        )}
      </p>

      <div
        class="pg-inputs"
        id="pg-panel"
        role="tabpanel"
        aria-labelledby={`pg-tab-${activeId}`}
      >
        <CodeEditor
          label="Config"
          hint="JSON, the same options a colophon.config.ts sets"
          language="json"
          value={configText}
          onInput={(next) => {
            editDraft(activeId, { config: next });
          }}
          failures={failuresFor("config")}
        />
        <CodeEditor
          label="Post frontmatter"
          hint="YAML, exactly as it appears at the top of a post"
          language="yaml"
          value={frontmatterText}
          onInput={(next) => {
            editDraft(activeId, { frontmatter: next });
          }}
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
                      editDraft(activeId, { size: size.name });
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
