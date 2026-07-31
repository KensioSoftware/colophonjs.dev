/**
 * A CodeMirror editor that falls back to a plain textarea.
 *
 * CodeMirror arrives in a chunk of its own, so the page is usable before it
 * lands. Until then this is a textarea holding the same text, styled to match,
 * and swapping one for the other keeps the value. Someone who starts typing
 * immediately keeps what they typed.
 *
 * Problems that know where they belong are handed to the lint extension and
 * underlined in place. The ones that do not are listed by the caller instead.
 */
import { useEffect, useRef, useState } from "preact/hooks";

import type { Failure } from "./render.js";

/** The parts of CodeMirror this needs, loaded together and once. */
type Editor = {
  readonly view: import("@codemirror/view").EditorView;
  readonly setDiagnostics: (
    view: import("@codemirror/view").EditorView,
    failures: readonly Failure[],
  ) => void;
};

type Language = "json" | "yaml";

let loading: Promise<typeof import("./codemirror.js")> | undefined;

function codemirror(): Promise<typeof import("./codemirror.js")> {
  loading ??= import("./codemirror.js");
  return loading;
}

export function CodeEditor({
  label,
  hint,
  language,
  value,
  onInput,
  failures,
}: {
  label: string;
  hint: string;
  language: Language;
  value: string;
  onInput: (next: string) => void;
  failures: readonly Failure[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | undefined>(undefined);
  const [ready, setReady] = useState(false);

  // Held in a ref so the editor built below always calls the current one. It
  // is created once, and a callback captured then would go stale.
  const latestInput = useRef(onInput);
  latestInput.current = onInput;

  useEffect(() => {
    let live = true;

    void (async () => {
      const module = await codemirror();
      if (!live || host.current === null) {
        return;
      }

      editor.current = module.createEditor({
        parent: host.current,
        doc: value,
        language,
        onChange: (next) => {
          latestInput.current(next);
        },
      });
      setReady(true);
    })();

    return () => {
      live = false;
      editor.current?.view.destroy();
      editor.current = undefined;
    };
    // Built once. Later `value` changes are pushed in by the effect below,
    // which avoids tearing down the editor and the caret with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Someone else changed the text, such as a shared link being read on load.
  // A change that came from typing is already in the document, so comparing
  // first is what stops this fighting the person using it.
  useEffect(() => {
    const view = editor.current?.view;
    if (view === undefined || view.state.doc.toString() === value) {
      return;
    }

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value, ready]);

  useEffect(() => {
    const current = editor.current;
    if (current !== undefined) {
      current.setDiagnostics(current.view, failures);
    }
  }, [failures, ready]);

  // Every problem is listed, including the ones the editor has underlined.
  // The underline says where, and reading it needs a hover; the list says what,
  // and is simply there. Between them nothing has to be hunted for.

  return (
    <div class="pg-editor">
      <label class="pg-editor-head" for={`pg-fallback-${language}`}>
        <span class="pg-editor-label">{label}</span>
        <span class="pg-editor-hint">{hint}</span>
      </label>

      <div class="pg-code" ref={host} hidden={!ready} />

      {!ready && (
        <textarea
          id={`pg-fallback-${language}`}
          class="pg-textarea"
          spellcheck={false}
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          value={value}
          onInput={(event) => {
            onInput((event.target as HTMLTextAreaElement).value);
          }}
        />
      )}

      {failures.length > 0 && (
        <ul class="pg-problems">
          {failures.map((failure) => (
            <li key={failure.message}>{failure.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
