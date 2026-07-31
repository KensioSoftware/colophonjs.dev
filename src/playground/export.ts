/**
 * Getting the image out: onto the clipboard, or into a file.
 *
 * Both go through a canvas rather than through a wasm build of resvg, which is
 * the other way to turn this SVG into pixels. The canvas draws the same
 * document the preview is already showing, with the same fonts the browser
 * drew it with, so what someone copies is what they were looking at. resvg
 * would be a second renderer with its own font situation, and a PNG that did
 * not quite match the preview is worse than no PNG at all.
 *
 * It also costs nothing. The preview is already an `<img>`; this draws it.
 */

/** The SVG as a `data:` URI, which is what an `<img>` can be pointed at. */
export function svgDataUri(svg: string): string {
  // `encodeURIComponent` rather than base64: the document is mostly ASCII, so
  // percent-encoding is shorter, and it survives the non-Latin-1 characters
  // that would make `btoa` throw.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve(image);
    });
    image.addEventListener("error", () => {
      reject(new Error("The browser could not draw this SVG."));
    });
    image.src = source;
  });
}

/**
 * The rendered image as PNG bytes.
 *
 * `scale` renders above the configured size, for someone who wants the image
 * at 2x for a display that will show it there.
 */
export async function toPng(
  svg: string,
  width: number,
  height: number,
  scale = 1,
): Promise<Blob> {
  const image = await loadImage(svgDataUri(svg));

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("This browser has no 2D canvas to render into.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("The browser produced no image."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

/** Whether the clipboard will take an image here. Safari and Firefox differ. */
export function canCopyImages(): boolean {
  return (
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function"
  );
}

/**
 * Put the PNG on the clipboard, ready to paste into a post.
 *
 * Safari only allows a clipboard write in the turn of the event loop that the
 * click happened in, so it is handed the promise rather than the blob and does
 * the waiting itself. Chrome and Firefox accept the same thing.
 */
export async function copyPng(png: Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/** Save bytes to a file, by the only route a browser offers. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  // Revoked on the next turn: doing it synchronously can beat the click.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
