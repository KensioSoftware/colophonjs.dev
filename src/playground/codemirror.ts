/**
 * The CodeMirror setup, in a module of its own so it becomes a chunk of its
 * own and the page can render before it arrives.
 *
 * The extensions are listed rather than taken from the `codemirror` package's
 * `basicSetup`, which would also bring autocompletion, search and a fold
 * gutter. None of those help with a config that fits on a screen.
 *
 * Colours come from Starlight's custom properties, so the editor follows the
 * site's light and dark themes without knowing which one is showing.
 */
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";

import type { Failure } from "./render.js";

/**
 * Token colours, on the same palette the site uses for its own code blocks.
 * A config is mostly keys, strings and numbers, so those three carry the work
 * and everything else stays at the body colour.
 */
const highlighting = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--sl-color-blue-high)" },
  { tag: tags.string, color: "var(--sl-color-green-high)" },
  {
    tag: [tags.number, tags.bool, tags.null],
    color: "var(--sl-color-purple-high)",
  },
  { tag: tags.keyword, color: "var(--sl-color-purple-high)" },
  { tag: tags.comment, color: "var(--sl-color-gray-3)", fontStyle: "italic" },
  { tag: tags.invalid, color: "var(--sl-color-red-high)" },
]);

const theme = EditorView.theme({
  "&": {
    border: "1px solid var(--sl-color-gray-5)",
    borderRadius: "0.5rem",
    backgroundColor: "var(--sl-color-black)",
    color: "var(--sl-color-white)",
    fontSize: "var(--sl-text-sm)",
  },
  "&.cm-focused": {
    outline: "2px solid var(--sl-color-accent-high)",
    outlineOffset: "1px",
  },
  ".cm-scroller": {
    fontFamily: "var(--sl-font-mono, ui-monospace, monospace)",
    lineHeight: "1.6",
    // Matches the minimum height the textarea it replaces had.
    minHeight: "12rem",
  },
  ".cm-content": { padding: "0.75rem 0" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--sl-color-gray-4)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.5rem 0 0.75rem" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-cursor": { borderLeftColor: "var(--sl-color-white)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--sl-color-accent-low)" },
  ".cm-lintRange-error": {
    // The default is a wavy underline drawn as a background image, which does
    // not follow the theme. This one does.
    backgroundImage: "none",
    borderBottom: "2px wavy var(--sl-color-red)",
    textDecoration: "underline wavy var(--sl-color-red)",
    textUnderlineOffset: "0.25em",
  },
  ".cm-tooltip": {
    border: "1px solid var(--sl-color-gray-5)",
    borderRadius: "0.4rem",
    backgroundColor: "var(--sl-color-bg)",
    color: "var(--sl-color-white)",
    fontSize: "var(--sl-text-xs)",
  },
  ".cm-tooltip .cm-diagnostic": { padding: "0.4rem 0.6rem" },
});

/** Failures that know where they belong, as CodeMirror describes them. */
function diagnosticsFor(
  failures: readonly Failure[],
  length: number,
): Diagnostic[] {
  return failures.flatMap((failure) => {
    const range = failure.range;
    if (range === undefined) {
      return [];
    }

    // A stale render can name a position past the end of what is now in the
    // document. CodeMirror throws on those rather than ignoring them.
    const from = Math.max(0, Math.min(range.from, length));
    const to = Math.max(from, Math.min(range.to, length));
    if (from === to) {
      return [];
    }

    return [{ from, to, severity: "error" as const, message: failure.message }];
  });
}

export function createEditor({
  parent,
  doc,
  language,
  onChange,
}: {
  parent: HTMLElement;
  doc: string;
  language: "json" | "yaml";
  onChange: (next: string) => void;
}) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(highlighting),
        language === "json" ? json() : yaml(),
        // No `linter()` source. The problems come from rendering rather than
        // from reading the document, so they are pushed in with
        // `setDiagnostics`. A source would also run on its own schedule after
        // every edit, and return nothing, wiping the ones that were pushed.
        lintGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    }),
  });

  return {
    view,
    setDiagnostics: (target: EditorView, failures: readonly Failure[]) => {
      target.dispatch(
        setDiagnostics(
          target.state,
          diagnosticsFor(failures, target.state.doc.length),
        ),
      );
    },
  };
}
