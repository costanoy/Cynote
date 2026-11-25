import type { EditorView } from "@codemirror/view";
import { getActiveView } from "./editor/bridge";
import type { NoteSketch } from "./types";

/*
 * Where things are in the open note, for laying drawings over it.
 *
 * The note-body row (".note-body-row") is the frame of reference. Layout is
 * read from the live editor (see editor/bridge.ts), not from DOM selectors:
 * where the text starts, how tall a line is, where each logical line begins.
 * Geometry is stored against a base line pitch and scaled with the current
 * one, and a drawing's height comes from the line it hangs from - so it
 * follows the text when lines are added or removed above it, when the window
 * rewraps the text, or when it's zoomed.
 */

/** Where text started at the base size, from the page's left edge - what
 * older versions measured x from. */
export const BASE_TEXT_LEFT = 38;
/** The page's top padding: older versions measured y from above it. */
const ROW_TOP = 16;
/** The line pitch the stored coordinates were authored against (the old
 * 15px text at a 1.65 line height). */
export const BASE_PITCH = 24.75;
const FALLBACK_PITCH = 24;

export interface NoteLayout {
  row: HTMLElement;
  scroller: HTMLElement;
  view: EditorView;
  /** px from the row's left edge to where the text starts. */
  textLeft: number;
  /** The current line pitch relative to the base one. */
  factor: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function readNoteLayout(): NoteLayout | null {
  const view = getActiveView();
  if (!view) return null;
  const scroller = view.dom.closest<HTMLElement>(".content-wrap");
  const row = view.dom.closest<HTMLElement>(".note-body-row");
  if (!scroller || !row) return null;
  return layoutOf(scroller, row, view);
}

/** The line pitch in px: the --pitch App sets on the scroller. */
function pitchOf(scroller: HTMLElement, view: EditorView): number {
  const fromVar = parseFloat(getComputedStyle(scroller).getPropertyValue("--pitch"));
  if (fromVar > 0) return fromVar;
  const lineHeight = parseFloat(getComputedStyle(view.contentDOM).lineHeight);
  return lineHeight > 0 ? lineHeight : FALLBACK_PITCH;
}

export function layoutOf(scroller: HTMLElement, row: HTMLElement, view: EditorView): NoteLayout {
  const factor = pitchOf(scroller, view) / BASE_PITCH;
  const content = view.contentDOM.getBoundingClientRect();
  const line = view.contentDOM.querySelector<HTMLElement>(".cm-line");
  const padding = line ? parseFloat(getComputedStyle(line).paddingLeft) || 0 : 0;
  const textLeft = content.left - row.getBoundingClientRect().left + padding;
  return { row, scroller, view, textLeft, factor };
}

function lineCount(layout: NoteLayout): number {
  return layout.view.state.doc.lines;
}

/** Top of logical line `line` (0-based), px from the row's top. */
export function lineTop(layout: NoteLayout, line: number): number {
  const { view, row } = layout;
  const n = Math.max(1, Math.min(lineCount(layout), line + 1));
  const block = view.lineBlockAt(view.state.doc.line(n).from);
  return view.documentTop + block.top - row.getBoundingClientRect().top;
}

/** The logical line (0-based) at `y`, px from the row's top: the last line
 * whose top is at or above it. */
export function lineAt(layout: NoteLayout, y: number): number {
  const { view, row } = layout;
  const height = y + row.getBoundingClientRect().top - view.documentTop;
  const block = view.lineBlockAtHeight(height);
  return view.state.doc.lineAt(block.from).number - 1;
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
