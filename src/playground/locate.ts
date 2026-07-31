/**
 * Finding where in the text a problem belongs, so the editor can underline it.
 *
 * Colophon reports problems as sentences, because a build prints them and a
 * line number would mean nothing there. An editor has the text in front of it
 * and can do better, so this reads the sentence back and works out which run of
 * characters it is about. A problem this cannot place keeps its place in the
 * list under the editor, which is why every function here returns `undefined`
 * rather than guessing.
 */

/** A run of characters in the document, as CodeMirror counts them. */
export type Range = { readonly from: number; readonly to: number };

/** Character offset of a one-based line and column. */
function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split("\n");
  let offset = 0;

  for (let index = 0; index < line - 1 && index < lines.length; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }

  return Math.min(offset + column - 1, text.length);
}

/** Widen a bare position to the token starting there, so it is visible. */
function tokenAt(text: string, at: number): Range {
  const from = Math.max(0, Math.min(at, text.length - 1));
  const match = /^\s*\S+/.exec(text.slice(from));
  const to = match === null ? from + 1 : from + match[0].length;

  return { from, to: Math.min(to, text.length) };
}

/**
 * Where a `JSON.parse` failure happened.
 *
 * Every engine words this differently. V8 gives a character position and, more
 * recently, a line and column as well; Firefox gives only a line and column;
 * Safari often gives neither. They are tried in that order, and a message with
 * none of them leaves the problem unplaced.
 */
export function locateJsonError(
  text: string,
  message: string,
): Range | undefined {
  const position = /position (\d+)/i.exec(message);
  if (position?.[1] !== undefined) {
    return tokenAt(text, Number(position[1]));
  }

  const lineColumn = /line (\d+) column (\d+)/i.exec(message);
  if (lineColumn?.[1] !== undefined && lineColumn[2] !== undefined) {
    return tokenAt(
      text,
      offsetOf(text, Number(lineColumn[1]), Number(lineColumn[2])),
    );
  }

  return undefined;
}

/**
 * Where a YAML parse failure happened.
 *
 * The `yaml` package carries a `pos` pair on the error, so unlike JSON there is
 * nothing to read out of the wording. `offset` shifts it back over whatever the
 * `---` fences took off the front.
 */
export function locateYamlError(
  error: unknown,
  offset: number,
): Range | undefined {
  const pos = (error as { pos?: unknown }).pos;
  if (!Array.isArray(pos) || typeof pos[0] !== "number") {
    return undefined;
  }

  const from = pos[0] + offset;
  const to = typeof pos[1] === "number" ? pos[1] + offset : from + 1;

  return { from, to: Math.max(to, from + 1) };
}

/** Escape a string so it can sit inside a regular expression as a literal. */
function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Where the option a config problem names appears in the config.
 *
 * The messages read `Unknown option "colors.forground". Did you mean
 * "foreground"?`, and it is the last part of that path that is actually written
 * in the document: the rest describes where it sits. Searching for it as a key
 * is safe here because every one of these problems is a name Colophon does not
 * know, so it is a name that appears once.
 */
export function locateConfigProblem(
  text: string,
  message: string,
): Range | undefined {
  const quoted = /"([^"]+)"/.exec(message);
  const path = quoted?.[1];
  if (path === undefined) {
    return undefined;
  }

  const leaf = path.split(".").pop();
  if (leaf === undefined || leaf === "") {
    return undefined;
  }

  const key = new RegExp(`"${escapeForRegExp(leaf)}"\\s*:`);
  const found = key.exec(text);
  if (found?.index === undefined) {
    return undefined;
  }

  return { from: found.index, to: found.index + leaf.length + 2 };
}
