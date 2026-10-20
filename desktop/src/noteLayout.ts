import type { NoteSketch } from "./types";

/*
 * Where things are in the open note, for laying drawings over it.
 *
 * The text column (".note-body-row") is the frame of reference, so drawings
 * go wherever reading mode centers the text. Geometry is kept at the base
 * text size and scaled with the current one, and a drawing's height comes
 * from the line it hangs from - so it follows the text when lines are added
 * or removed above it, when the window rewraps the text, or when it's zoomed.
 */

/** Where text starts at the base size, from the page's left edge (34px margin
 * + 4px padding) - also what older versions measured x from. */
export const BASE_TEXT_LEFT = 38;
/** The page's top padding: older versions measured y from above it. */
const ROW_TOP = 16;
const BASE_FONT_SIZE = 15;

export interface NoteLayout {
  row: HTMLElement;
  scroller: HTMLElement;
  /** px from the row's left edge to where the text starts. */
  textLeft: number;
  /** The current text size relative to the base one. */
  factor: number;
  /** Top of each line, px from the row's top - measured only when asked, so a
   * long note isn't measured line by line on every keystroke. */
  lineTops: (() => number)[];
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function readNoteLayout(): NoteLayout | null {
  const scroller = document.querySelector<HTMLElement>(".content-wrap");
  const row = scroller?.querySelector<HTMLElement>(".note-body-row");
  const body = row?.querySelector<HTMLElement>(".note-body");
  if (!scroller || !row || !body) return null;
  return layoutOf(scroller, row, body);
}

export function layoutOf(scroller: HTMLElement, row: HTMLElement, body: HTMLElement): NoteLayout {
  const style = getComputedStyle(body);
  const factor = (parseFloat(style.fontSize) || BASE_FONT_SIZE) / BASE_FONT_SIZE;
  const textLeft = body.offsetLeft + (parseFloat(style.paddingLeft) || 0);
  return { row, scroller, textLeft, factor, lineTops: lineTopsOf(body) };
}

/** One entry per line of the note, counted the way the editor reads them:
 * each element is a line, and a run of loose text is one more. */
function lineTopsOf(body: HTMLElement): (() => number)[] {
  const tops: (() => number)[] = [];
  let inText = false;
  let previous: HTMLElement | null = null;
  for (const child of Array.from(body.childNodes)) {
    if (child instanceof HTMLElement) {
      const line = child;
      tops.push(() => line.offsetTop);
      previous = line;
      inText = false;
    } else if (child.nodeType === Node.TEXT_NODE && !inText) {
      const above = previous;
      tops.push(() => (above ? above.offsetTop + above.offsetHeight : body.offsetTop));
      inText = true;
    }
  }
  return tops.length > 0 ? tops : [() => body.offsetTop];
}

export function lineTop(layout: NoteLayout, line: number): number {
  const tops = layout.lineTops;
  return tops[Math.max(0, Math.min(tops.length - 1, line))]();
}

/** The last line whose top is at or above `y`. */
export function lineAt(layout: NoteLayout, y: number): number {
  const tops = layout.lineTops;
  let lo = 0;
  let hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid]() <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Where a drawing sits in the row right now. */
export function sketchRect(s: NoteSketch, layout: NoteLayout): Rect {
  const f = layout.factor;
  const top = s.anchor ? lineTop(layout, s.anchor.line) + s.anchor.dy * f : (s.y - ROW_TOP) * f;
  return { left: layout.textLeft + (s.x - BASE_TEXT_LEFT) * f, top, width: s.width * f, height: s.height * f };
}

const tenth = (v: number) => Math.round(v * 10) / 10;

/** What to store for a drawing at `rect` in the row. It hangs from the line
 * across its middle - a circle drawn around a word starts a little above the
 * word's line, but is centered on it. */
export function placeAt(layout: NoteLayout, rect: Rect): Pick<NoteSketch, "x" | "y" | "anchor"> {
  const f = layout.factor;
  const line = lineAt(layout, rect.top + rect.height / 2);
  return {
    x: tenth(BASE_TEXT_LEFT + (rect.left - layout.textLeft) / f),
    y: tenth(ROW_TOP + rect.top / f),
    anchor: { line, dy: tenth((rect.top - lineTop(layout, line)) / f) },
  };
}
