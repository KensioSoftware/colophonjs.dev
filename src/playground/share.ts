/**
 * Putting the playground's state in the URL, and getting it back out.
 *
 * The state goes in the query string rather than the fragment, and that is a
 * decision worth writing down because it is hard to undo. A fragment never
 * leaves the browser, so a link carrying one can never be unfurled into
 * anything but a generic card. A query string reaches the server, so if this
 * site ever renders share cards for playground links, the links people have
 * already saved will still work.
 *
 * Deflated and base64url'd because a config and a post's frontmatter are a lot
 * of repeated punctuation, and the result is a link people paste into chat.
 * `CompressionStream` is in every browser in scope, so this costs no bytes.
 */
export type ShareState = {
  readonly config: string;
  readonly frontmatter: string;
  readonly size?: string;
  /**
   * Which preset tab was open. Only the open one is shared, since a link is
   * meant to show one image. A link naming a preset this version has dropped
   * opens on the default tab with the shared text still in it.
   */
  readonly preset?: string;
};

const param = "s";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function through(
  stream: TransformStream<Uint8Array, Uint8Array>,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();

  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }

  return out;
}

/** The query string for a link to this state, without the leading `?`. */
export async function encodeState(state: ShareState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(state));
  const deflated = await through(new CompressionStream("deflate-raw"), json);

  return `${param}=${toBase64Url(deflated)}`;
}

/**
 * The state a link carries, or `undefined` for a link that carries none or
 * carries something this cannot read. A share link is the one input here that
 * did not come from the person looking at it, so a broken one opens the
 * playground on its defaults rather than on an error about their URL.
 */
export async function decodeState(
  search: string,
): Promise<ShareState | undefined> {
  const encoded = new URLSearchParams(search).get(param);
  if (encoded === null || encoded === "") {
    return undefined;
  }

  try {
    const inflated = await through(
      new DecompressionStream("deflate-raw"),
      fromBase64Url(encoded),
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(inflated));

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as ShareState).config !== "string" ||
      typeof (parsed as ShareState).frontmatter !== "string"
    ) {
      return undefined;
    }

    return parsed as ShareState;
  } catch {
    return undefined;
  }
}
