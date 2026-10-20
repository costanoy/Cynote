import type { SketchOp } from "./types";

// Pictures inside drawings (drawings made before strokes were kept), decoded
// once and shared by the note and the drawing canvas.
const cache = new Map<string, HTMLImageElement>();

function cachedImage(src: string): HTMLImageElement {
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    cache.set(src, img);
  }
  return img;
}

/** Every picture `ops` uses that's ready to draw, and whether any is still
 * loading - `onLoad` runs when one finishes. A picture that fails to load
 * counts as done; it's just not drawn. */
export function imagesFor(ops: readonly SketchOp[], onLoad: () => void): { images: Map<string, HTMLImageElement>; ready: boolean } {
  const images = new Map<string, HTMLImageElement>();
  let ready = true;
  for (const op of ops) {
    if (op.tool !== "image" || images.has(op.src)) continue;
    const img = cachedImage(op.src);
    if (img.complete) {
      if (img.naturalWidth > 0) images.set(op.src, img);
    } else {
      ready = false;
      img.addEventListener("load", onLoad, { once: true });
      img.addEventListener("error", onLoad, { once: true });
    }
  }
  return { images, ready };
}
