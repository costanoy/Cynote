import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NoteSketch } from "../types";
import { EditIcon, GripIcon, TrashIcon } from "../icons";
import * as core from "../editorCore";
import type { EditorState, Sel } from "../editorCore";
import { drawOps } from "../ink";
import { layoutOf, placeAt, sketchRect, type NoteLayout, type Rect } from "../noteLayout";
import { imagesFor } from "../sketchImages";
import { FindBar, type FindMode } from "./FindBar";

const MIN_SKETCH_SIZE = 16;
// How close to the ink a click still grabs a drawing, in px.
const INK_REACH = 5;
// Pen ink is solid; a marker's is see-through. Pressing on solid ink grabs the
// drawing, while a highlight leaves the text under it clickable - any ink
// still brings up the drawing's toolbar, whose handle moves it.
const SOLID_INK = 140;
const ANY_INK = 24;

type EditKind = Parameters<core.History["record"]>[1];

// ------------------------------------------------ DOM <-> text offsets
//
// The editable div always holds one top-level <div> per line (see rebuildDom),
// so a flat character offset into the note's text maps onto (line div, offset
// within it) and back.

/** Finds the text node + offset `localOffset` characters into `container`. */
function pointAtLocalOffset(container: Node, localOffset: number): { node: Node; offset: number } {
  let remaining = localOffset;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let lastText: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    lastText = node;
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) return { node, offset: remaining };
    remaining -= len;
    node = walker.nextNode() as Text | null;
  }
  return lastText ? { node: lastText, offset: lastText.textContent?.length ?? 0 } : { node: container, offset: 0 };
}

function domPointFromFlatOffset(el: HTMLElement, pos: number): { node: Node; offset: number } {
  let remaining = pos;
  const children = Array.from(el.childNodes);
  for (const child of children) {
    const len = (child.textContent ?? "").length;
    if (remaining <= len) {
      return child.nodeType === Node.TEXT_NODE ? { node: child, offset: remaining } : pointAtLocalOffset(child, remaining);
    }
    remaining -= len + 1; // +1 for the newline joining this line to the next
  }
  const last = children[children.length - 1];
  if (!last) return { node: el, offset: 0 };
  const lastLen = (last.textContent ?? "").length;
  return last.nodeType === Node.TEXT_NODE ? { node: last, offset: lastLen } : pointAtLocalOffset(last, lastLen);
}

/** Inverse of domPointFromFlatOffset. */
function flatOffsetFromPoint(el: HTMLElement, node: Node, offset: number): number {
  const children = Array.from(el.childNodes);
  if (node === el) {
    // Caret between line divs (the browser does this for empty documents
    // and after some edits): offset counts whole lines.
    let total = 0;
    for (let i = 0; i < offset && i < children.length; i++) total += (children[i].textContent ?? "").length + 1;
    return total;
  }
  let total = 0;
  for (const child of children) {
    if (child === node && node.nodeType === Node.TEXT_NODE) return total + offset;
    if (child.nodeType === Node.ELEMENT_NODE && child.contains(node)) {
      const range = document.createRange();
      range.selectNodeContents(child);
      range.setEnd(node, offset);
      return total + range.toString().length;
    }
    total += (child.textContent ?? "").length + 1;
  }
  return total;
}

/** Which line (1-based) and column (1-based) the caret currently sits on. */
function caretLineCol(el: HTMLElement): { line: number; col: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const { focusNode, focusOffset } = sel;
  if (!focusNode || !el.contains(focusNode)) return null;

  const children = Array.from(el.childNodes);
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child !== focusNode && !(child.nodeType === Node.ELEMENT_NODE && child.contains(focusNode))) continue;
    if (child === focusNode && child.nodeType === Node.TEXT_NODE) return { line: i + 1, col: focusOffset + 1 };
    const range = document.createRange();
    range.selectNodeContents(child);
    range.setEnd(focusNode, focusOffset);
    return { line: i + 1, col: range.toString().length + 1 };
  }
  if (focusNode === el) return { line: Math.min(focusOffset + 1, Math.max(children.length, 1)), col: 1 };
  return null;
}

// el.innerText miscounts blank lines in this browser: an empty <div><br></div>
// sometimes adds an extra "\n" beyond its block boundary, sometimes drops its
// line entirely - each reopen-and-edit cycle could compound the drift into a
// growing gap of "phantom" blank lines. Serialize from the DOM structure
// itself instead (one line per top-level child), which has no such ambiguity.
function readBody(el: HTMLElement): string {
  const lines: string[] = [];
  let current = "";
  let hasCurrent = false;
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      current += child.textContent ?? "";
      hasCurrent = true;
    } else {
      if (hasCurrent) {
        lines.push(current);
        current = "";
        hasCurrent = false;
      }
      lines.push(child.textContent ?? "");
    }
  }
  if (hasCurrent || lines.length === 0) lines.push(current);
  return lines.join("\n");
}

function rebuildDom(el: HTMLElement, text: string) {
  el.innerHTML = "";
  for (const line of text.split("\n")) {
    const div = document.createElement("div");
    div.appendChild(line ? document.createTextNode(line) : document.createElement("br"));
    el.appendChild(div);
  }
}

function domRange(el: HTMLElement, from: number, to: number): Range {
  const a = domPointFromFlatOffset(el, from);
  const b = domPointFromFlatOffset(el, to);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

function setDomSelection(el: HTMLElement, s: Sel) {
  const sel = window.getSelection();
  if (!sel) return;
  const a = domPointFromFlatOffset(el, s.anchor);
  const h = domPointFromFlatOffset(el, s.head);
  sel.setBaseAndExtent(a.node, a.offset, h.node, h.offset);
}

/** Screen box of a caret at `pos` - an empty line has no text to measure, so
 * fall back to the line's own box. */
function caretRect(el: HTMLElement, pos: number): DOMRect {
  const p = domPointFromFlatOffset(el, pos);
  const range = document.createRange();
  range.setStart(p.node, p.offset);
  range.collapse(true);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1];
  const lineEl = p.node.nodeType === Node.ELEMENT_NODE ? (p.node as Element) : p.node.parentElement;
  return (lineEl ?? el).getBoundingClientRect();
}

/** Paints extra selections / search matches through the CSS Custom Highlight
 * API, which styles text ranges without touching the DOM - so the note's text
 * structure (and with it typing and spellcheck) is never disturbed by it. */
function setHighlight(name: string, ranges: Range[]) {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  if (ranges.length === 0) CSS.highlights.delete(name);
  else CSS.highlights.set(name, new Highlight(...ranges));
}

// ------------------------------------------------- column selection
//
// Dragging with the mouse wheel pressed (or Shift+Alt+drag) selects a
// rectangle, as in VS Code: one cursor or selection per visual row it crosses.
// The note's font is proportional - there's no character grid to snap to - so
// the rectangle is in pixels, and each row finds its own nearest characters.

interface VisualRow {
  top: number;
  bottom: number;
  /** Horizontal extent of the row's text. */
  left: number;
  right: number;
}

function nodeBox(node: Node): DOMRect {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).getBoundingClientRect();
  const r = document.createRange();
  r.selectNodeContents(node);
  return r.getBoundingClientRect();
}

/** The rows one line wraps into, top to bottom. */
function visualRows(line: Node): VisualRow[] {
  const range = document.createRange();
  range.selectNodeContents(line);
  const rows: VisualRow[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.height === 0) continue;
    const row = rows.find((x) => Math.abs(x.top - r.top) < r.height / 2);
    if (row) {
      row.left = Math.min(row.left, r.left);
      row.right = Math.max(row.right, r.right);
      row.bottom = Math.max(row.bottom, r.bottom);
    } else {
      rows.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
  }
  if (rows.length === 0) {
    const b = nodeBox(line);
    rows.push({ top: b.top, bottom: b.bottom, left: b.left, right: b.left });
  }
  return rows.sort((a, b) => a.top - b.top);
}

function pointInLine(line: Node, k: number): { node: Node; offset: number } {
  return line.nodeType === Node.TEXT_NODE ? { node: line, offset: k } : pointAtLocalOffset(line, k);
}

/** Center of the k-th character of a line, on screen. */
function charCenter(line: Node, k: number): { x: number; y: number } {
  const a = pointInLine(line, k);
  const b = pointInLine(line, k + 1);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const r = range.getClientRects()[0];
  return r ? { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 } : { x: -Infinity, y: -Infinity };
}

/** First k in [lo, hi) where `pred` turns true (it must go false -> true once); hi if never. */
function firstTrue(lo: number, hi: number, pred: (k: number) => boolean): number {
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pred(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Caret offset within `line`, on its `rowIndex`-th visual row, nearest to screen x. */
function offsetOnRow(line: Node, rows: VisualRow[], rowIndex: number, x: number): number {
  const text = line.textContent ?? "";
  const row = rows[rowIndex];
  const start = rows.length === 1 ? 0 : firstTrue(0, text.length, (k) => charCenter(line, k).y >= row.top);
  const end = rows.length === 1 ? text.length : firstTrue(start, text.length, (k) => charCenter(line, k).y > row.bottom);
  const k = firstTrue(start, end, (k) => charCenter(line, k).x > x);
  // Past the end of a wrapped row: stop before the space it wrapped at, so the
  // cursor shows on this row rather than at the start of the next one.
  if (k === end && end < text.length && end > start && /\s/.test(text[end - 1])) return end - 1;
  return k;
}

// -------------------------------------------------- per-note memory
//
// Switching tabs remounts the editor; undo history, cursors and scroll
// position live here so they survive that, the way they do per file in
// Notepad and VS Code.

interface NoteMemory {
  history: core.History;
  sels: Sel[] | null;
  scrollTop: number | null;
}
const noteMemory = new Map<string, NoteMemory>();
function memoryFor(id: string): NoteMemory {
  let m = noteMemory.get(id);
  if (!m) {
    m = { history: new core.History(), sels: null, scrollTop: null };
    noteMemory.set(id, m);
  }
  return m;
}

type Motion = core.Motion;
const MOTIONS: Record<string, (ctrl: boolean) => Motion> = {
  ArrowLeft: (ctrl) => (ctrl ? "wordLeft" : "left"),
  ArrowRight: (ctrl) => (ctrl ? "wordRight" : "right"),
  ArrowUp: () => "up",
  ArrowDown: () => "down",
  Home: (ctrl) => (ctrl ? "docStart" : "home"),
  End: (ctrl) => (ctrl ? "docEnd" : "end"),
};
const NAV_KEYS = new Set([...Object.keys(MOTIONS), "PageUp", "PageDown"]);

interface FindState {
  mode: FindMode;
  query: string;
  replacement: string;
  caseSensitive: boolean;
  index: number;
  focusToken: number;
}

type Props = {
  noteId: string;
  body: string;
  sketches: NoteSketch[];
  spellCheck: boolean;
  darkMode: boolean;
  /** Changes whenever the text is set differently (zoom, reading mode) - the
   * editor's box doesn't always change size with it, so nothing else would
   * tell the drawings and extra cursors to follow. */
  textStyleKey: string;
  /** The drawing open in Note Styling, shown there instead of here meanwhile. */
  hiddenSketchId: string | null;
  onBodyInput: (value: string) => void;
  onCaretChange: (line: number, col: number) => void;
  /** Moves or resizes drawings. `quiet` when nothing visible changes - only
   * anchoring a drawing made before anchors existed. */
  onUpdateSketches: (patches: Record<string, Partial<NoteSketch>>, quiet?: boolean) => void;
  onEditSketch: (id: string) => void;
  onDeleteSketch: (id: string) => void;
};

export function ContentArea({
  noteId,
  body,
  sketches,
  spellCheck,
  darkMode,
  textStyleKey,
  hiddenSketchId,
  onBodyInput,
  onCaretChange,
  onUpdateSketches,
  onEditSketch,
  onDeleteSketch,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const mem = memoryFor(noteId);
  // The text the editor currently shows - kept equal to the DOM, and ahead of
  // the `body` prop by up to one render.
  const bodyRef = useRef(body);
  // Every selection while several cursors are active (primary last), or []
  // when there's just the browser's own single selection.
  const multiRef = useRef<Sel[]>([]);
  const [multiSels, setMultiSels] = useState<Sel[]>([]);
  const [caretBoxes, setCaretBoxes] = useState<{ left: number; top: number; height: number }[]>([]);
  // Outline around the current search match: highlights can only tint text,
  // so the ring is drawn as overlay boxes, like the extra carets.
  const [matchBoxes, setMatchBoxes] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  const currentMatchRef = useRef<Sel | null>(null);
  const composingFrom = useRef<EditorState | null>(null);
  const [find, setFind] = useState<FindState | null>(null);
  const findOrigin = useRef(0);

  const scroller = () => (ref.current?.closest(".content-wrap") as HTMLElement | null) ?? null;

  const readSels = (): Sel[] => {
    if (multiRef.current.length > 1) return multiRef.current;
    const el = ref.current;
    const sel = window.getSelection();
    const len = bodyRef.current.length;
    const clamp = (n: number) => Math.max(0, Math.min(len, n));
    if (el && sel && sel.rangeCount > 0 && sel.anchorNode && sel.focusNode && el.contains(sel.anchorNode) && el.contains(sel.focusNode)) {
      return [
        {
          anchor: clamp(flatOffsetFromPoint(el, sel.anchorNode, sel.anchorOffset)),
          head: clamp(flatOffsetFromPoint(el, sel.focusNode, sel.focusOffset)),
        },
      ];
    }
    const saved = mem.sels?.[mem.sels.length - 1];
    return [saved ? { anchor: clamp(saved.anchor), head: clamp(saved.head) } : core.caret(len)];
  };

  const currentState = (): EditorState => ({ body: bodyRef.current, sels: readSels() });

  const setMulti = (sels: Sel[]) => {
    multiRef.current = sels;
    setMultiSels(sels);
  };

  const scrollToPos = (pos: number) => {
    const el = ref.current;
    const sc = scroller();
    if (!el || !sc) return;
    const r = caretRect(el, pos);
    const box = sc.getBoundingClientRect();
    const margin = Math.min(48, box.height / 4);
    if (r.top < box.top + margin) sc.scrollTop -= box.top + margin - r.top;
    else if (r.bottom > box.bottom - margin) sc.scrollTop += r.bottom - (box.bottom - margin);
  };

  const showSels = (sels: Sel[], opts: { scroll?: boolean; focus?: boolean } = {}) => {
    const el = ref.current;
    if (!el || sels.length === 0) return;
    setMulti(sels.length > 1 ? sels : []);
    if (opts.focus !== false && document.activeElement !== el) el.focus({ preventScroll: true });
    setDomSelection(el, sels[sels.length - 1]);
    mem.sels = sels;
    if (opts.scroll !== false) scrollToPos(sels[sels.length - 1].head);
  };

  /** The single way every non-native edit reaches the screen: text, cursors, undo and the app. */
  const applyState = (
    next: EditorState,
    opts: { record?: EditKind | false; scroll?: boolean; focus?: boolean } = {}
  ) => {
    const el = ref.current;
    if (!el) return;
    const before = currentState();
    const changed = next.body !== before.body;
    if (changed && opts.record !== false) mem.history.record(before, opts.record ?? "edit");
    if (readBody(el) !== next.body) rebuildDom(el, next.body);
    bodyRef.current = next.body;
    showSels(next.sels, opts);
    if (changed) onBodyInput(next.body);
  };

  const undo = () => {
    const prev = mem.history.undo(currentState());
    if (prev) applyState(core.clampState(prev), { record: false });
  };
  const redo = () => {
    const next = mem.history.redo(currentState());
    if (next) applyState(core.clampState(next), { record: false });
  };

  const paintExtras = () => {
    const el = ref.current;
    const row = rowRef.current;
    if (!el || !row) return;
    const focused = document.activeElement === el;
    const all = multiRef.current.length > 1 ? multiRef.current : mem.sels ?? [];
    const extras = multiRef.current.length > 1 ? multiRef.current.slice(0, -1) : [];
    // The browser stops drawing the real selection once focus leaves the
    // editor (e.g. into the find box) - keep every selection visible then.
    const painted = focused ? extras : all;
    const len = bodyRef.current.length;
    setHighlight(
      "cy-multi",
      painted
        .filter((s) => !core.isEmpty(s) && core.hi(s) <= len)
        .map((s) => domRange(el, core.lo(s), core.hi(s)))
    );
    const rowBox = row.getBoundingClientRect();
    setCaretBoxes(
      extras.map((s) => {
        const r = caretRect(el, s.head);
        return { left: r.left - rowBox.left, top: r.top - rowBox.top, height: r.height };
      })
    );
  };

  useLayoutEffect(paintExtras, [multiSels, body]);

  const paintMatchRing = () => {
    const el = ref.current;
    const row = rowRef.current;
    const cur = currentMatchRef.current;
    if (!el || !row || !cur || core.hi(cur) > bodyRef.current.length) {
      setMatchBoxes((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const rowBox = row.getBoundingClientRect();
    setMatchBoxes(
      Array.from(domRange(el, cur.anchor, cur.head).getClientRects()).map((r) => ({
        left: r.left - rowBox.left,
        top: r.top - rowBox.top,
        width: r.width,
        height: r.height,
      }))
    );
  };

  // ------------------------------------------------------------ drawings
  //
  // Drawings sit in the text column, each hanging from a line (see
  // noteLayout.ts). They don't take the mouse over the text: a press only
  // grabs one where there's ink, so a highlight laid over a line never gets
  // in the way of clicking into that line.

  const sketchesRef = useRef(sketches);
  sketchesRef.current = sketches;
  const hiddenSketchRef = useRef(hiddenSketchId);
  hiddenSketchRef.current = hiddenSketchId;
  const onUpdateSketchesRef = useRef(onUpdateSketches);
  onUpdateSketchesRef.current = onUpdateSketches;
  const layoutRef = useRef<NoteLayout | null>(null);
  const sketchCanvases = useRef(new Map<string, HTMLCanvasElement>());
  const [sketchRects, setSketchRects] = useState<Map<string, Rect>>(() => new Map());
  const [hoveredSketch, setHoveredSketch] = useState<string | null>(null);
  const [selectedSketch, setSelectedSketch] = useState<string | null>(null);
  // While a drawing is dragged or resized: where it would land.
  const [sketchPreview, setSketchPreview] = useState<{ id: string; rect: Rect; kind: "move" | "resize" } | null>(null);
  const [overInk, setOverInk] = useState(false);
  const sketchGesture = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    start: Rect;
    latest: Rect | null;
  } | null>(null);
  const lastSketchPress = useRef({ id: "", time: 0, x: 0, y: 0 });
  const hoverFrame = useRef(0);

  const measureSketches = () => {
    const el = ref.current;
    const row = rowRef.current;
    const sc = scroller();
    if (!el || !row || !sc) return;
    if (sketchesRef.current.length === 0) {
      layoutRef.current = null;
      setSketchRects((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    const layout = layoutOf(sc, row, el);
    layoutRef.current = layout;
    const next = new Map<string, Rect>();
    for (const s of sketchesRef.current) next.set(s.id, sketchRect(s, layout));
    setSketchRects((prev) => (sameRects(prev, next) ? prev : next));
    // Drawings from before anchors existed get one, from where they are now.
    const patches: Record<string, Partial<NoteSketch>> = {};
    for (const s of sketchesRef.current) {
      if (s.anchor) continue;
      patches[s.id] = { anchor: placeAt(layout, next.get(s.id)!).anchor };
    }
    if (Object.keys(patches).length > 0) onUpdateSketchesRef.current(patches, true);
  };

  useLayoutEffect(measureSketches, [sketches, body]);

  useLayoutEffect(() => {
    paintExtras();
    paintMatchRing();
    measureSketches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textStyleKey]);

  /** The drawing with ink at (or right next to) this point, topmost first. */
  const sketchAt = (clientX: number, clientY: number, minAlpha: number): string | null => {
    const list = sketchesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      const canvas = sketchCanvases.current.get(s.id);
      if (!canvas || s.id === hiddenSketchRef.current) continue;
      if (inkNear(canvas, clientX, clientY, minAlpha)) return s.id;
    }
    return null;
  };

  const rectOf = (id: string) => (sketchPreview?.id === id ? sketchPreview.rect : sketchRects.get(id));

  const commitRect = (id: string, r: Rect, resized: boolean) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const patch: Partial<NoteSketch> = placeAt(layout, r);
    if (resized) {
      patch.width = Math.round((r.width / layout.factor) * 10) / 10;
      patch.height = Math.round((r.height / layout.factor) * 10) / 10;
    }
    onUpdateSketchesRef.current({ [id]: patch });
  };

  const selectSketch = (id: string | null) => {
    setSelectedSketch(id);
    if (id) requestAnimationFrame(() => document.getElementById("sketch-" + id)?.focus({ preventScroll: true }));
  };

  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest?.(".sketch-toolbar, .sketch-resize-handle")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const id = sketchAt(e.clientX, e.clientY, SOLID_INK);
    if (!id) {
      if (selectedSketch) setSelectedSketch(null);
      return;
    }
    // Pressing on ink belongs to the drawing, not the text underneath.
    e.preventDefault();
    e.stopPropagation();
    const last = lastSketchPress.current;
    if (last.id === id && e.timeStamp - last.time < 450 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6) {
      lastSketchPress.current = { id: "", time: 0, x: 0, y: 0 };
      onEditSketch(id);
      return;
    }
    lastSketchPress.current = { id, time: e.timeStamp, x: e.clientX, y: e.clientY };
    const start = rectOf(id);
    if (!start) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sketchGesture.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, start, latest: null };
    selectSketch(id);
  };

  const onRowPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = sketchGesture.current;
    if (g && g.pointerId === e.pointerId) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.latest && Math.hypot(dx, dy) < 3) return;
      g.latest = { ...g.start, left: Math.max(0, g.start.left + dx), top: Math.max(0, g.start.top + dy) };
      setSketchPreview({ id: g.id, rect: g.latest, kind: "move" });
      return;
    }
    if (sketchesRef.current.length === 0 || hoverFrame.current) return;
    const { clientX, clientY } = e;
    hoverFrame.current = requestAnimationFrame(() => {
      hoverFrame.current = 0;
      const solid = sketchAt(clientX, clientY, SOLID_INK);
      const hit = solid ?? sketchAt(clientX, clientY, ANY_INK);
      setOverInk(solid !== null);
      setHoveredSketch((current) => {
        if (hit) return hit;
        // Stay put while the pointer is still around the drawing (or on its way
        // up to its toolbar), not just on its ink.
        const canvas = current ? sketchCanvases.current.get(current) : null;
        if (!canvas) return null;
        const box = canvas.getBoundingClientRect();
        const inside = clientX > box.left - 12 && clientX < box.right + 12 && clientY > box.top - 40 && clientY < box.bottom + 40;
        return inside ? current : null;
      });
    });
  };

  const onRowPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = sketchGesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    sketchGesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.latest) commitRect(g.id, g.latest, false);
    setSketchPreview(null);
  };

  const onRowPointerLeave = () => {
    if (sketchGesture.current) return;
    setOverInk(false);
    setHoveredSketch(null);
  };

  /** The toolbar's handle: moves any drawing, even a highlight with no solid
   * ink to grab. The pointer events it captures bubble to the row's handlers. */
  const startMove = (id: string, e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const start = rectOf(id);
    if (!start) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sketchGesture.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, start, latest: null };
    selectSketch(id);
  };

  const startResize = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const start = rectOf(id);
    if (!start) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    selectSketch(id);
    let latest = start;
    // Grows from the top-left corner and keeps its proportions, following
    // whichever way the pointer moved more.
    const onMove = (ev: PointerEvent) => {
      const grow = Math.max((start.width + ev.clientX - e.clientX) / start.width, (start.height + ev.clientY - e.clientY) / start.height);
      const min = MIN_SKETCH_SIZE / Math.min(start.width, start.height);
      const scale = Math.max(grow, min);
      latest = { ...start, width: start.width * scale, height: start.height * scale };
      setSketchPreview({ id, rect: latest, kind: "resize" });
    };
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      if (latest !== start) commitRect(id, latest, true);
      setSketchPreview(null);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  };

  const onSketchKeyDown = (id: string, e: React.KeyboardEvent) => {
    const r = rectOf(id);
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setSelectedSketch(null);
      onDeleteSketch(id);
      ref.current?.focus({ preventScroll: true });
    } else if (e.key === "Enter") {
      e.preventDefault();
      onEditSketch(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setSelectedSketch(null);
      ref.current?.focus({ preventScroll: true });
    } else if (r && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      commitRect(id, { ...r, left: Math.max(0, r.left + dx), top: Math.max(0, r.top + dy) }, false);
    }
  };

  // Mount: fill the editor once, then restore where this note was left.
  useLayoutEffect(() => {
    const el = ref.current!;
    rebuildDom(el, body);
    bodyRef.current = body;
    const sc = scroller();
    const restored = mem.sels ? core.clampState({ body, sels: mem.sels }).sels : [core.caret(body.length)];
    showSels(restored, { scroll: false });
    if (sc) sc.scrollTop = mem.scrollTop ?? 0;

    const onScroll = () => {
      if (sc) mem.scrollTop = sc.scrollTop;
    };
    sc?.addEventListener("scroll", onScroll);
    // Rewrapping, zoom and reading mode all move the text - and the drawings
    // hanging from it.
    const resize = new ResizeObserver(() => {
      paintExtras();
      paintMatchRing();
      measureSketches();
    });
    resize.observe(el);
    if (rowRef.current) resize.observe(rowRef.current);
    // The note's typeface can finish loading after the first layout and
    // shift every line a little.
    document.fonts?.ready.then(() => {
      if (ref.current) measureSketches();
    });
    return () => {
      if (sc) mem.scrollTop = sc.scrollTop;
      sc?.removeEventListener("scroll", onScroll);
      resize.disconnect();
      if (hoverFrame.current) cancelAnimationFrame(hoverFrame.current);
      ["cy-multi", "cy-find", "cy-find-current"].forEach((n) => setHighlight(n, []));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typing keeps `body` equal to the editor's text, so a mismatch means the
  // note changed from outside (sync pulled in a newer version). Show it - the
  // div is otherwise uncontrolled and would keep the old text, then write it
  // straight back over the update on the next keystroke - and keep it undoable.
  useEffect(() => {
    const el = ref.current;
    if (!el || body === bodyRef.current) return;
    if (readBody(el) === body) {
      bodyRef.current = body;
      return;
    }
    const before = currentState();
    mem.history.record(before, "external");
    const hadFocus = document.activeElement === el;
    rebuildDom(el, body);
    bodyRef.current = body;
    const kept = core.clampState({ body, sels: [before.sels[before.sels.length - 1]] }).sels;
    if (hadFocus) showSels(kept, { scroll: false });
    else {
      setMulti([]);
      mem.sels = kept;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  // selectionchange catches every way the caret moves - typing, arrows,
  // clicks - so the Ln/Col readout and the remembered cursor track it here.
  useEffect(() => {
    const onSelectionChange = () => {
      const el = ref.current;
      if (!el) return;
      const pos = caretLineCol(el);
      if (pos) onCaretChange(pos.line, pos.col);
      const s = window.getSelection();
      if (multiRef.current.length <= 1 && s?.anchorNode && el.contains(s.anchorNode)) mem.sels = readSels();
    };
    onSelectionChange();
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------------------------------- find

  const matches = useMemo(
    () => (find && find.mode !== "goto" ? core.findAll(body, find.query, find.caseSensitive) : []),
    [body, find?.query, find?.caseSensitive, find?.mode]
  );
  const currentMatch = find && matches.length > 0 ? Math.min(find.index, matches.length - 1) : -1;

  const firstMatchFrom = (text: string, query: string, caseSensitive: boolean, from: number) => {
    const found = core.findAll(text, query, caseSensitive).findIndex((m) => m.anchor >= from);
    return found === -1 ? 0 : found;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (currentMatch === -1) {
      setHighlight("cy-find", []);
      setHighlight("cy-find-current", []);
      currentMatchRef.current = null;
      paintMatchRing();
      return;
    }
    setHighlight(
      "cy-find",
      matches.filter((_, i) => i !== currentMatch).map((m) => domRange(el, m.anchor, m.head))
    );
    const cur = matches[currentMatch];
    setHighlight("cy-find-current", [domRange(el, cur.anchor, cur.head)]);
    currentMatchRef.current = cur;
    paintMatchRing();
    scrollToPos(cur.anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, currentMatch]);

  const openFind = (mode: FindMode) => {
    const st = currentState();
    const p = core.primary(st);
    const selected = core.isEmpty(p) ? "" : st.body.slice(core.lo(p), core.hi(p));
    findOrigin.current = core.lo(p);
    setFind((prev) => {
      const base = prev ?? { mode, query: "", replacement: "", caseSensitive: false, index: 0, focusToken: 0 };
      const query = mode !== "goto" && selected && !selected.includes("\n") ? selected : base.query;
      return {
        ...base,
        mode,
        query,
        index: firstMatchFrom(st.body, query, base.caseSensitive, findOrigin.current),
        focusToken: base.focusToken + 1,
      };
    });
  };

  const closeFind = () => {
    const cur = currentMatch !== -1 ? matches[currentMatch] : null;
    setFind(null);
    if (cur) showSels([cur], { scroll: false });
    else ref.current?.focus({ preventScroll: true });
  };

  const stepMatch = (delta: number) => {
    if (matches.length === 0) return;
    setFind((f) => (f ? { ...f, index: (currentMatch + delta + matches.length) % matches.length } : f));
  };

  const replaceOne = () => {
    if (!find || currentMatch === -1) return;
    const m = matches[currentMatch];
    const next = core.replaceRanges(currentState(), [m], find.replacement);
    applyState(next, { focus: false, scroll: false });
    const resumeAt = m.anchor + find.replacement.length;
    setFind((f) => (f ? { ...f, index: firstMatchFrom(next.body, f.query, f.caseSensitive, resumeAt) } : f));
  };

  const replaceAll = () => {
    if (!find || matches.length === 0) return;
    applyState(core.replaceRanges(currentState(), matches, find.replacement), { focus: false, scroll: false });
  };

  const goToLine = (line: number) => {
    setFind(null);
    showSels([core.caret(core.lineStartOffset(bodyRef.current, line - 1))]);
  };

  // ------------------------------------------------ native events

  const handlers = useRef({
    beforeInput: (_e: InputEvent) => {},
    compositionStart: () => {},
    compositionEnd: (_e: CompositionEvent) => {},
    windowKeyDown: (_e: KeyboardEvent) => {},
  });

  handlers.current.beforeInput = (e: InputEvent) => {
    const t = e.inputType;
    if (t.startsWith("format")) {
      // Notes are plain text - bold/italic from a shortcut or the context
      // menu would only ever be a lie the next time the note loads.
      e.preventDefault();
      return;
    }
    if (t === "historyUndo" || t === "historyRedo") {
      e.preventDefault();
      if (t === "historyUndo") undo();
      else redo();
      return;
    }
    if (t === "insertCompositionText") return;

    const text = e.data ?? e.dataTransfer?.getData("text/plain") ?? "";
    const kind: EditKind =
      t === "insertText"
        ? text.length > 1
          ? "edit"
          : /\s/.test(text)
            ? "space"
            : "type"
        : t === "deleteContentBackward" || t === "deleteContentForward" || t.startsWith("deleteWord")
          ? "delete"
          : "edit";

    if (multiRef.current.length <= 1) {
      // Single cursor: the browser does the edit itself; just snapshot for undo.
      mem.history.record(currentState(), kind);
      return;
    }

    e.preventDefault();
    const st = currentState();
    let next: EditorState | null = null;
    if (t === "insertText" || t === "insertReplacementText") next = core.insertText(st, text);
    else if (t === "insertParagraph" || t === "insertLineBreak") next = core.insertText(st, "\n");
    else if (t === "deleteContentBackward") next = core.deleteBackward(st);
    else if (t === "deleteWordBackward") next = core.deleteBackward(st, true);
    else if (t === "deleteContentForward") next = core.deleteForward(st);
    else if (t === "deleteWordForward") next = core.deleteForward(st, true);
    if (next) applyState(next, { record: kind });
  };

  // Accents typed with dead keys (´ + e = é) arrive as a composition, which
  // can't be cancelled like ordinary input - with several cursors, let it
  // land at the primary and then redo it properly at every cursor.
  handlers.current.compositionStart = () => {
    if (multiRef.current.length > 1) composingFrom.current = currentState();
    else mem.history.record(currentState(), "type");
  };
  handlers.current.compositionEnd = (e: CompositionEvent) => {
    const from = composingFrom.current;
    if (!from) return;
    composingFrom.current = null;
    mem.history.record(from, "type");
    applyState(core.insertText(from, e.data), { record: false });
  };

  handlers.current.windowKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const lower = e.key.toLowerCase();
    if (ctrl && !e.altKey && !e.shiftKey && (lower === "f" || lower === "h" || lower === "g")) {
      e.preventDefault();
      if (lower === "h" && find?.mode === "replace") setFind((f) => (f ? { ...f, focusToken: f.focusToken + 1 } : f));
      else openFind(lower === "f" ? "find" : lower === "h" ? "replace" : "goto");
    } else if (e.key === "F3" && find && find.mode !== "goto") {
      e.preventDefault();
      stepMatch(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape" && find && document.activeElement === ref.current) {
      e.preventDefault();
      closeFind();
    }
  };

  useEffect(() => {
    const el = ref.current!;
    const onBeforeInput = (e: Event) => handlers.current.beforeInput(e as InputEvent);
    const onCompositionStart = () => handlers.current.compositionStart();
    const onCompositionEnd = (e: Event) => handlers.current.compositionEnd(e as CompositionEvent);
    const onWindowKeyDown = (e: KeyboardEvent) => handlers.current.windowKeyDown(e);
    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("compositionstart", onCompositionStart);
    el.addEventListener("compositionend", onCompositionEnd);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      el.removeEventListener("beforeinput", onBeforeInput);
      el.removeEventListener("compositionstart", onCompositionStart);
      el.removeEventListener("compositionend", onCompositionEnd);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, []);

  // Strip whatever formatting the source had (fonts, colors, bold, links...)
  // so pasted text always matches the note's own style. With several cursors
  // and as many pasted lines, each cursor gets its own line (VS Code does this).
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (!text) return;
    if (multiRef.current.length > 1) {
      const lines = text.split("\n");
      const st = currentState();
      applyState(core.insertText(st, lines.length === st.sels.length ? lines : text), { record: "edit" });
      return;
    }
    mem.history.record(currentState(), "edit");
    document.execCommand("insertText", false, text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key;
    const lower = key.toLowerCase();
    const multi = multiRef.current.length > 1;
    const run = (next: EditorState, record: EditKind | false = "edit") => {
      e.preventDefault();
      applyState(next, { record });
    };

    if (ctrl && !e.altKey && (lower === "b" || lower === "i" || lower === "u")) {
      e.preventDefault();
      return;
    }
    if (ctrl && !e.altKey && (lower === "z" || lower === "y")) {
      e.preventDefault();
      if (lower === "z" && !e.shiftKey) undo();
      else redo();
      return;
    }
    // Tab inserts a real tab (the browser's default would move focus out of
    // the note, onto the next button); across several lines it indents them.
    if (key === "Tab" && !ctrl && !e.altKey) {
      e.preventDefault();
      const st = currentState();
      if (e.shiftKey) applyState(core.outdent(st));
      else if (multi || st.sels.some((s) => core.lineStart(st.body, core.lo(s)) !== core.lineStart(st.body, core.hi(s)))) {
        applyState(core.tab(st));
      } else {
        // execCommand doesn't fire beforeinput, so snapshot for undo here.
        mem.history.record(st, "space");
        document.execCommand("insertText", false, "\t");
      }
      return;
    }
    if (ctrl && !e.altKey && !e.shiftKey && lower === "d") return run(core.addNextOccurrence(currentState()), false);
    if (ctrl && !e.altKey && e.shiftKey && lower === "l") return run(core.selectAllOccurrences(currentState()), false);
    if (ctrl && !e.altKey && !e.shiftKey && lower === "l") return run(core.selectLine(currentState()), false);
    if (ctrl && !e.altKey && e.shiftKey && lower === "k") return run(core.deleteLines(currentState()));
    if (e.altKey && !ctrl && (key === "ArrowUp" || key === "ArrowDown")) {
      const dir = key === "ArrowUp" ? "up" : "down";
      return run(e.shiftKey ? core.duplicateLines(currentState(), dir) : core.moveLines(currentState(), dir));
    }
    if (ctrl && e.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
      return run(core.addCursorVertical(currentState(), key === "ArrowUp" ? "up" : "down"), false);
    }
    if (ctrl && !e.altKey && key === "Enter") return run(core.insertLine(currentState(), e.shiftKey ? "above" : "below"));
    if (ctrl && !e.altKey && !e.shiftKey && (lower === "c" || lower === "x")) {
      const st = currentState();
      const nothingSelected = st.sels.every(core.isEmpty);
      if (multi || nothingSelected) {
        e.preventDefault();
        navigator.clipboard?.writeText(core.copyText(st)).catch(() => {});
        if (lower === "x") applyState(nothingSelected ? core.deleteLines(st) : core.deleteSelections(st));
      }
      return;
    }

    if (!multi) {
      if (NAV_KEYS.has(key)) mem.history.breakGroup();
      return;
    }

    if (key === "Escape") {
      e.preventDefault();
      showSels([core.primary(currentState())]);
      return;
    }
    if (ctrl && lower === "a") {
      setMulti([]); // let the browser select everything
      return;
    }
    const motion = MOTIONS[key]?.(ctrl);
    if (motion && !e.altKey) {
      e.preventDefault();
      mem.history.breakGroup();
      applyState(core.move(currentState(), motion, e.shiftKey), { record: false });
      return;
    }
    if (key === "PageUp" || key === "PageDown") setMulti([]);
  };

  /** The rectangle between two screen points, as one selection per visual row
   * it crosses - the row under (x2, y2) is the primary. Same rules as VS Code:
   * a straight vertical drag puts a cursor on every row (at its end, if the
   * row is shorter); a wider rectangle skips rows whose text ends before its
   * left edge; and if that skips everything, every row gets a cursor at its end. */
  const columnSels = (x1: number, y1: number, x2: number, y2: number): Sel[] => {
    const el = ref.current;
    if (!el || el.childNodes.length === 0) return [];
    const lines = Array.from(el.childNodes);
    const first = nodeBox(lines[0]);
    const last = nodeBox(lines[lines.length - 1]);
    const clampY = (y: number) => Math.min(Math.max(y, first.top + 1), last.bottom - 1);
    const top = Math.min(clampY(y1), clampY(y2));
    const bottom = Math.max(clampY(y1), clampY(y2));
    const left = Math.min(x1, x2);
    // About half a character: hands drift sideways while dragging down, and a
    // rectangle edge "on" a character shouldn't depend on which half it's in.
    const slack = parseFloat(getComputedStyle(el).fontSize) * 0.3;
    const straightDown = Math.abs(x2 - x1) < slack;

    const crossed: { line: Node; rows: VisualRow[]; r: number; lineStart: number }[] = [];
    for (let i = firstTrue(0, lines.length, (k) => nodeBox(lines[k]).bottom > top); i < lines.length; i++) {
      const line = lines[i];
      if (nodeBox(line).top > bottom) break;
      const rows = visualRows(line);
      const lineStart = flatOffsetFromPoint(el, line, 0);
      rows.forEach((row, r) => {
        if (row.bottom > top && row.top <= bottom) crossed.push({ line, rows, r, lineStart });
      });
    }

    const inBox = crossed.filter((c) => straightDown || left <= c.rows[c.r].right + slack);
    const sels: Sel[] =
      inBox.length > 0
        ? inBox.map((c) => ({
            anchor: c.lineStart + offsetOnRow(c.line, c.rows, c.r, x1),
            head: c.lineStart + offsetOnRow(c.line, c.rows, c.r, x2),
          }))
        : crossed.map((c) => core.caret(c.lineStart + offsetOnRow(c.line, c.rows, c.r, Infinity)));
    return y2 < y1 ? sels.reverse() : sels;
  };

  const startColumnSelect = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    // Also keeps Windows' middle-button autoscroll from kicking in.
    e.preventDefault();
    const startX = e.clientX;
    const startYInNote = e.clientY - el.getBoundingClientRect().top;

    const selectTo = (x: number, y: number) => {
      const sels = columnSels(startX, el.getBoundingClientRect().top + startYInNote, x, y);
      if (sels.length > 0) showSels(core.normalize(sels), { scroll: false });
    };
    selectTo(e.clientX, e.clientY);

    const onMove = (ev: MouseEvent) => {
      const sc = scroller();
      if (sc) {
        const box = sc.getBoundingClientRect();
        if (ev.clientY < box.top) sc.scrollTop -= box.top - ev.clientY;
        else if (ev.clientY > box.bottom) sc.scrollTop += ev.clientY - box.bottom;
      }
      selectTo(ev.clientX, ev.clientY);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    mem.history.breakGroup();
    if (e.button === 1 || (e.button === 0 && e.altKey && e.shiftKey)) {
      startColumnSelect(e);
      return;
    }
    if (e.altKey && e.button === 0) {
      // Alt+click adds a cursor, like VS Code.
      e.preventDefault();
      const el = ref.current!;
      const hit = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (!hit || !el.contains(hit.startContainer)) return;
      const pos = Math.min(flatOffsetFromPoint(el, hit.startContainer, hit.startOffset), bodyRef.current.length);
      applyState(core.addCursor(currentState(), pos), { record: false, scroll: false });
      return;
    }
    if (multiRef.current.length > 1) setMulti([]);
  };

  /** The line (top-level child of the editor) closest to a given screen height. */
  const lineAtY = (y: number): { index: number; rect: DOMRect } | null => {
    const el = ref.current;
    if (!el || el.childNodes.length === 0) return null;
    let best: { index: number; rect: DOMRect } | null = null;
    let bestDist = Infinity;
    Array.from(el.childNodes).forEach((child, i) => {
      const rect =
        child.nodeType === Node.ELEMENT_NODE
          ? (child as HTMLElement).getBoundingClientRect()
          : (() => {
              const r = document.createRange();
              r.selectNodeContents(child);
              return r.getBoundingClientRect();
            })();
      const dist = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = { index: i, rect };
      }
    });
    return best;
  };

  /** Start of line `index`, and its end including the line break (if any). */
  const lineBounds = (index: number) => {
    const text = bodyRef.current;
    const start = core.lineStartOffset(text, index);
    const end = core.lineEnd(text, start);
    return { start, end: end < text.length ? end + 1 : end };
  };

  // The left margin works like Notepad's: press to select the whole line
  // under the mouse, drag up or down to extend the selection line by line.
  const onGutterMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const first = lineAtY(e.clientY);
    if (!first) return;
    e.preventDefault();
    mem.history.breakGroup();
    const anchorLine = first.index;

    const selectTo = (clientY: number) => {
      const hit = lineAtY(clientY);
      if (!hit) return;
      const a = lineBounds(anchorLine);
      const b = lineBounds(hit.index);
      const range =
        hit.index >= anchorLine ? { anchor: a.start, head: b.end } : { anchor: a.end, head: b.start };
      showSels([range], { scroll: false });
    };
    selectTo(e.clientY);

    // Dragging past the top or bottom edge scrolls the note along.
    const onMove = (ev: MouseEvent) => {
      const sc = scroller();
      if (sc) {
        const box = sc.getBoundingClientRect();
        if (ev.clientY < box.top) sc.scrollTop -= box.top - ev.clientY;
        else if (ev.clientY > box.bottom) sc.scrollTop += ev.clientY - box.bottom;
      }
      selectTo(ev.clientY);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <>
      <div className="find-anchor">
        {find && (
          <FindBar
            mode={find.mode}
            query={find.query}
            replacement={find.replacement}
            caseSensitive={find.caseSensitive}
            matchCount={matches.length}
            currentIndex={currentMatch}
            lineCount={core.lineCount(body)}
            focusToken={find.focusToken}
            onQueryChange={(query) =>
              setFind((f) =>
                f ? { ...f, query, index: firstMatchFrom(bodyRef.current, query, f.caseSensitive, findOrigin.current) } : f
              )
            }
            onReplacementChange={(replacement) => setFind((f) => (f ? { ...f, replacement } : f))}
            onToggleCase={() =>
              setFind((f) =>
                f
                  ? {
                      ...f,
                      caseSensitive: !f.caseSensitive,
                      index: firstMatchFrom(bodyRef.current, f.query, !f.caseSensitive, findOrigin.current),
                      focusToken: f.focusToken + 1,
                    }
                  : f
              )
            }
            onToggleReplace={() =>
              setFind((f) => (f ? { ...f, mode: f.mode === "replace" ? "find" : "replace", focusToken: f.focusToken + 1 } : f))
            }
            onNext={() => stepMatch(1)}
            onPrev={() => stepMatch(-1)}
            onReplaceOne={replaceOne}
            onReplaceAll={replaceAll}
            onGoToLine={goToLine}
            onClose={closeFind}
          />
        )}
      </div>
      <div
        className={"note-body-row" + (overInk ? " over-ink" : "") + (sketchPreview ? " " + sketchPreview.kind + "-sketch" : "")}
        ref={rowRef}
        onPointerDownCapture={onRowPointerDown}
        onPointerMove={onRowPointerMove}
        onPointerUp={onRowPointerUp}
        onPointerCancel={onRowPointerUp}
        onPointerLeave={onRowPointerLeave}
      >
        <div className="line-gutter" onMouseDown={onGutterMouseDown} />
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          spellCheck={spellCheck}
          className="note-body"
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onMouseDown={onMouseDown}
          onFocus={paintExtras}
          onBlur={paintExtras}
          onInput={(e) => {
            if (composingFrom.current) return;
            const newBody = readBody(e.currentTarget);
            if (multiRef.current.length > 1) setMulti([]);
            bodyRef.current = newBody;
            onBodyInput(newBody);
          }}
        />
        {caretBoxes.map((b, i) => (
          <div key={i} className="fake-caret" style={{ left: b.left, top: b.top, height: b.height }} />
        ))}
        {matchBoxes.map((b, i) => (
          <div key={i} className="match-ring" style={b} />
        ))}
        {sketches.map((s) => {
          const rect = rectOf(s.id);
          if (!rect || s.id === hiddenSketchId) return null;
          return (
            <SketchView
              key={s.id}
              sketch={s}
              rect={rect}
              darkMode={darkMode}
              active={s.id === hoveredSketch || s.id === selectedSketch || s.id === sketchPreview?.id}
              moving={s.id === sketchPreview?.id && sketchPreview.kind === "move"}
              canvases={sketchCanvases.current}
              onEdit={() => onEditSketch(s.id)}
              onDelete={() => {
                setSelectedSketch(null);
                setHoveredSketch(null);
                onDeleteSketch(s.id);
              }}
              onMoveStart={(e) => startMove(s.id, e)}
              onResizeStart={(e) => startResize(s.id, e)}
              onKeyDown={(e) => onSketchKeyDown(s.id, e)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setSelectedSketch((current) => (current === s.id ? null : current));
                }
              }}
            />
          );
        })}
      </div>
    </>
  );
}

function sameRects(a: Map<string, Rect>, b: Map<string, Rect>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, r] of b) {
    const o = a.get(id);
    if (!o) return false;
    if (Math.abs(o.left - r.left) > 0.25 || Math.abs(o.top - r.top) > 0.25) return false;
    if (Math.abs(o.width - r.width) > 0.25 || Math.abs(o.height - r.height) > 0.25) return false;
  }
  return true;
}

/** Whether a drawing has ink at least `minAlpha` opaque (0 to 255) at, or
 * within reach of, this point on screen. */
function inkNear(canvas: HTMLCanvasElement, clientX: number, clientY: number, minAlpha: number): boolean {
  const box = canvas.getBoundingClientRect();
  const x = clientX - box.left;
  const y = clientY - box.top;
  if (box.width === 0 || box.height === 0) return false;
  if (x < -INK_REACH || y < -INK_REACH || x > box.width + INK_REACH || y > box.height + INK_REACH) return false;
  const sx = canvas.width / box.width;
  const sy = canvas.height / box.height;
  const x0 = Math.max(0, Math.floor((x - INK_REACH) * sx));
  const y0 = Math.max(0, Math.floor((y - INK_REACH) * sy));
  const x1 = Math.min(canvas.width, Math.ceil((x + INK_REACH) * sx));
  const y1 = Math.min(canvas.height, Math.ceil((y + INK_REACH) * sy));
  if (x1 <= x0 || y1 <= y0) return false;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] >= minAlpha) return true;
  return false;
}

/** A drawing in the note, painted from its strokes at its current size and in
 * the current theme (or from its picture, for drawings made before strokes
 * were kept). The mouse goes straight through it except on its toolbar and
 * resize handle - ContentArea decides from the ink what a press means. */
function SketchView({
  sketch,
  rect,
  darkMode,
  active,
  moving,
  canvases,
  onEdit,
  onDelete,
  onMoveStart,
  onResizeStart,
  onKeyDown,
  onBlur,
}: {
  sketch: NoteSketch;
  rect: Rect;
  darkMode: boolean;
  active: boolean;
  moving: boolean;
  canvases: Map<string, HTMLCanvasElement>;
  onEdit: () => void;
  onDelete: () => void;
  onMoveStart: (e: React.PointerEvent<HTMLElement>) => void;
  onResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBlur: (e: React.FocusEvent<HTMLDivElement>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imagesLoaded, setImagesLoaded] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvases.set(sketch.id, canvas);
    return () => {
      canvases.delete(sketch.id);
    };
  }, [canvases, sketch.id]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * ratio));
    const h = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(w / rect.width, 0, 0, h / rect.height, 0, 0);
    const ops = sketch.strokes ?? [{ tool: "image" as const, src: sketch.dataUrl, x: 0, y: 0, w: rect.width, h: rect.height }];
    const { images } = imagesFor(ops, () => setImagesLoaded((n) => n + 1));
    const scale = sketch.strokes ? rect.width / (sketch.naturalWidth ?? sketch.width) : 1;
    drawOps(ctx, ops, { dark: darkMode, scale, images });
  }, [sketch.strokes, sketch.dataUrl, sketch.naturalWidth, sketch.width, rect.width, rect.height, darkMode, imagesLoaded]);

  return (
    <div
      id={"sketch-" + sketch.id}
      className={"note-sketch-wrap" + (active ? " active" : "") + (moving ? " moving" : "") + (rect.top < 36 ? " below" : "")}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      tabIndex={-1}
      role="group"
      aria-label="Desenho"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <canvas ref={canvasRef} className="note-sketch" />
      <div className="sketch-toolbar">
        <span className="sketch-tool-btn grip" title="Arraste para mover" onPointerDown={onMoveStart}>
          <GripIcon />
        </span>
        <button className="sketch-tool-btn" title="Editar desenho (Enter)" aria-label="Editar desenho" onClick={onEdit}>
          <EditIcon />
        </button>
        <button className="sketch-tool-btn delete" title="Excluir desenho (Delete)" aria-label="Excluir desenho" onClick={onDelete}>
          <TrashIcon />
        </button>
      </div>
      <div className="sketch-resize-handle" title="Redimensionar" onPointerDown={onResizeStart} />
    </div>
  );
}
