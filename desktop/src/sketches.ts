import { isInkKey } from "./ink";
import type { NoteSketch, SketchAnchor, SketchOp, TabData } from "./types";

const EMBEDDED_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,/i;

// A drawing arriving in a file or through sync is only numbers and a palette
// name, but there's no reason to let one be big enough to stall the app.
const MAX_OPS = 4000;
const MAX_NUMBERS_PER_STROKE = 3 * 20000;
const MAX_NUMBERS = 3 * 200000;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Drawings made in Cynote are always embedded images. Anything else - a web
 * address arriving through sync, or inside a .cyte file someone sent - is
 * dropped: showing it would make the app fetch it, telling whoever picked
 * that address your IP and when you opened the note.
 */
export function safeSketches(list: unknown): NoteSketch[] {
  if (!Array.isArray(list)) return [];
  const num = (v: unknown, fallback: number) => (isNum(v) ? v : fallback);
  const out: NoteSketch[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const s = raw as Record<string, unknown>;
    if (typeof s.dataUrl !== "string" || !EMBEDDED_IMAGE.test(s.dataUrl)) continue;
    const sketch: NoteSketch = {
      id: typeof s.id === "string" ? s.id : "s" + out.length + "-" + Date.now(),
      dataUrl: s.dataUrl,
      x: num(s.x, 0),
      y: num(s.y, 0),
      width: num(s.width, 160),
      height: num(s.height, 120),
    };
    const anchor = safeAnchor(s.anchor);
    if (anchor) sketch.anchor = anchor;
    const strokes = safeOps(s.strokes);
    if (strokes && strokes.length > 0) {
      sketch.strokes = strokes;
      sketch.naturalWidth = isNum(s.naturalWidth) && s.naturalWidth > 0 ? s.naturalWidth : sketch.width;
    }
    out.push(sketch);
  }
  return out;
}

function safeAnchor(v: unknown): SketchAnchor | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const a = v as Record<string, unknown>;
  if (!isNum(a.line) || !Number.isInteger(a.line) || a.line < 0 || a.line > 1e7 || !isNum(a.dy)) return undefined;
  return { line: a.line, dy: a.dy };
}

function safeOps(list: unknown): SketchOp[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const out: SketchOp[] = [];
  let budget = MAX_NUMBERS;
  for (const raw of list.slice(0, MAX_OPS)) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (o.tool === "image") {
      if (typeof o.src !== "string" || !EMBEDDED_IMAGE.test(o.src)) continue;
      if (!isNum(o.x) || !isNum(o.y) || !isNum(o.w) || !isNum(o.h) || o.w <= 0 || o.h <= 0) continue;
      out.push({ tool: "image", src: o.src, x: o.x, y: o.y, w: o.w, h: o.h });
      continue;
    }
    if (o.tool !== "pen" && o.tool !== "marker" && o.tool !== "eraser") continue;
    if (!isInkKey(o.color) || !isNum(o.size) || o.size <= 0 || o.size > 400) continue;
    const points = o.points;
    if (!Array.isArray(points) || points.length < 3 || points.length % 3 !== 0) continue;
    if (points.length > MAX_NUMBERS_PER_STROKE || points.length > budget || !points.every(isNum)) continue;
    budget -= points.length;
    out.push({ tool: o.tool, color: o.color, size: o.size, points: points.slice() });
  }
  return out;
}

const lineCount = (text: string) => {
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
};

/**
 * Keeps drawings on their lines when the text changes from `oldBody` to
 * `newBody`: lines added or removed above a drawing move it along, and one
 * whose own line was removed settles where the removal happened.
 */
export function shiftSketchAnchors<T extends NoteSketch[] | undefined>(sketches: T, oldBody: string, newBody: string): T {
  if (!sketches || !sketches.some((s) => s.anchor)) return sketches;
  if (lineCount(oldBody) === lineCount(newBody)) return sketches;
  const a = oldBody.split("\n");
  const b = newBody.split("\n");
  const shortest = Math.min(a.length, b.length);
  let start = 0;
  while (start < shortest && a[start] === b[start]) start++;
  let tail = 0;
  while (tail < shortest - start && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const oldEnd = a.length - tail;
  const newEnd = b.length - tail;

  let changed = false;
  const next = sketches.map((s) => {
    if (!s.anchor) return s;
    const line = s.anchor.line;
    let moved = line;
    if (line >= oldEnd) moved = line + (newEnd - oldEnd);
    else if (line >= start) moved = Math.min(line, Math.max(start, newEnd - 1));
    moved = Math.max(0, Math.min(b.length - 1, moved));
    if (moved === line) return s;
    changed = true;
    return { ...s, anchor: { ...s.anchor, line: moved } };
  });
  return (changed ? next : sketches) as T;
}

/** Notes as they're uploaded for internet sync. The strokes stay on this
 * computer: the phone has no drawings at all, and another computer can still
 * show (and draw over) the picture - this keeps the uploads small. */
export function tabsForSync(tabs: TabData[]): TabData[] {
  return tabs.map((t) =>
    t.sketches?.some((s) => s.strokes)
      ? { ...t, sketches: t.sketches.map(({ strokes: _strokes, naturalWidth: _naturalWidth, ...rest }) => rest) }
      : t
  );
}
