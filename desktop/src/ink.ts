import type { InkKey, InkStroke, InkTool, SketchOp } from "./types";

/*
 * Note Styling's ink: how a stroke is recorded, smoothed and drawn.
 *
 * A drawing is a list of operations replayed in order: pen and marker strokes
 * lay ink down, an eraser stroke cuts through whatever came before it, and an
 * image op stands for a drawing made before strokes were kept. It stays as
 * points until the moment it's painted, so the same drawing renders crisply at
 * any size and in either theme.
 */

export const INKS: { key: InkKey; name: string; light: string; dark: string }[] = [
  { key: "ink", name: "Nanquim", light: "#2b2a22", dark: "#efe7cf" },
  { key: "leaf", name: "Verde-folha", light: "#3f7f45", dark: "#93cc7d" },
  { key: "petrol", name: "Azul-petróleo", light: "#28697a", dark: "#80c6ce" },
  { key: "terracotta", name: "Terracota", light: "#a7502e", dark: "#ec926e" },
  { key: "amber", name: "Âmbar", light: "#c4861c", dark: "#edbd58" },
];

/** Thin, medium and thick, per tool. */
export const TOOL_SIZES: Record<InkTool, readonly number[]> = {
  pen: [1.8, 3.2, 5.4],
  marker: [10, 16, 24],
  eraser: [10, 22, 40],
};

const MARKER_ALPHA = { light: 0.34, dark: 0.3 };

export function isInkKey(v: unknown): v is InkKey {
  return INKS.some((i) => i.key === v);
}

export function inkColor(key: InkKey, dark: boolean): string {
  const ink = INKS.find((i) => i.key === key) ?? INKS[0];
  return dark ? ink.dark : ink.light;
}

export const START_PRESSURE = 0.72;

/** Mice and fingers report no pressure, so it's made up from speed: a pen
 * line thins out when it moves fast and fills in when it slows down. */
export function nextPressure(prev: number, distance: number, ms: number): number {
  const speed = distance / Math.max(ms, 4); // px per ms
  const target = 1 - Math.min(1, speed / 2.2) * 0.62;
  return prev + (target - prev) * 0.3;
}

// ------------------------------------------------------------- geometry

interface Sample {
  x: number;
  y: number;
  p: number;
}

const dist = (a: Sample, b: Sample) => Math.hypot(b.x - a.x, b.y - a.y);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function samplesOf(points: readonly number[]): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i + 2 < points.length; i += 3) out.push({ x: points[i], y: points[i + 1], p: points[i + 2] });
  return out;
}

/** Each point eases only part of the way toward where the pointer went, which
 * irons out the small wobbles of a hand. The last point is kept as it is, so
 * the line still ends exactly where the pointer stopped. */
function streamline(raw: Sample[], follow: number): Sample[] {
  if (raw.length < 3) return raw;
  const out: Sample[] = [raw[0]];
  let prev = raw[0];
  for (let i = 1; i < raw.length - 1; i++) {
    const r = raw[i];
    prev = { x: prev.x + (r.x - prev.x) * follow, y: prev.y + (r.y - prev.y) * follow, p: r.p };
    out.push(prev);
  }
  out.push(raw[raw.length - 1]);
  return out;
}

/** A smooth curve from the first sample to the last, bending around each one
 * in between (from midpoint to midpoint), picked up every `step` px. Both
 * ends are part of it - nothing is cut off where the stroke starts or stops. */
function resample(s: Sample[], step: number): Sample[] {
  if (s.length <= 1) return s.slice();
  const out: Sample[] = [s[0]];
  const add = (a: Sample, c: Sample | null, b: Sample) => {
    const len = c ? (dist(a, c) + dist(c, b) + dist(a, b)) / 2 : dist(a, b);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      const p = a.p + (b.p - a.p) * t;
      if (c) out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y, p });
      else out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p });
    }
  };
  if (s.length === 2) {
    add(s[0], null, s[1]);
    return out;
  }
  const mid = (a: Sample, b: Sample): Sample => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2 });
  let from = s[0];
  for (let i = 1; i < s.length - 1; i++) {
    const to = i === s.length - 2 ? s[s.length - 1] : mid(s[i], s[i + 1]);
    add(from, s[i], to);
    from = to;
  }
  return out;
}

/** A pen line's half-width at a point: pressure sets it, and both ends taper,
 * like a nib touching down and lifting off. Never wider than size / 2. */
function penRadius(size: number, p: number, along: number, total: number): number {
  let r = (size / 2) * (0.4 + 0.6 * p);
  const taperIn = Math.min(total * 0.3, size * 2.4);
  const taperOut = Math.min(total * 0.42, size * 3.4);
  if (along < taperIn) r *= 0.42 + 0.58 * easeOut(along / taperIn);
  if (total - along < taperOut) r *= 0.18 + 0.82 * easeOut((total - along) / taperOut);
  return Math.max(r, 0.3);
}

/** A stroke's outline as pieces to fill together: a circle at each point and
 * a quad joining each pair. Filled in one go they make one solid shape, so a
 * translucent marker comes out even instead of beaded where pieces overlap. */
export interface StrokeShape {
  /** x, y, r for each circle. */
  circles: number[];
  /** Four corners (eight numbers) for each quad. */
  quads: number[];
}

export function strokeShape(stroke: Pick<InkStroke, "tool" | "size" | "points">): StrokeShape {
  const raw = samplesOf(stroke.points);
  if (raw.length === 0) return { circles: [], quads: [] };
  const pen = stroke.tool === "pen";
  const step = Math.min(2, Math.max(0.8, stroke.size / 3));
  const pts = resample(streamline(raw, pen ? 0.5 : 0.65), step);

  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + dist(pts[i - 1], pts[i]));
  const total = along[along.length - 1];
  const radius = (i: number) => (pen ? penRadius(stroke.size, pts[i].p, along[i], total) : stroke.size / 2);

  const circles: number[] = [];
  const quads: number[] = [];
  let prevR = radius(0);
  circles.push(pts[0].x, pts[0].y, prevR);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const r = radius(i);
    const d = dist(a, b);
    if (d > 0.01) {
      const nx = -(b.y - a.y) / d;
      const ny = (b.x - a.x) / d;
      pushQuad(quads, [
        a.x - nx * prevR, a.y - ny * prevR,
        b.x - nx * r, b.y - ny * r,
        b.x + nx * r, b.y + ny * r,
        a.x + nx * prevR, a.y + ny * prevR,
      ]);
    }
    circles.push(b.x, b.y, r);
    prevR = r;
  }
  return { circles, quads };
}

/** Winds every quad the same way canvas arcs go, so where pieces overlap
 * their windings add up instead of cancelling into holes. */
function pushQuad(out: number[], c: number[]) {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += c[i * 2] * c[j * 2 + 1] - c[j * 2] * c[i * 2 + 1];
  }
  if (area < 0) out.push(c[6], c[7], c[4], c[5], c[2], c[3], c[0], c[1]);
  else out.push(...c);
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where an op can leave ink - an eraser stroke leaves none. */
export function opBounds(op: SketchOp): Box | null {
  if (op.tool === "image") return { x0: op.x, y0: op.y, x1: op.x + op.w, y1: op.y + op.h };
  if (op.tool === "eraser" || op.points.length < 3) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 2 < op.points.length; i += 3) {
    x0 = Math.min(x0, op.points[i]);
    x1 = Math.max(x1, op.points[i]);
    y0 = Math.min(y0, op.points[i + 1]);
    y1 = Math.max(y1, op.points[i + 1]);
  }
  // Smoothing only ever pulls points inward, and no line is wider than its size.
  const r = op.size / 2 + 1;
  return { x0: x0 - r, y0: y0 - r, x1: x1 + r, y1: y1 + r };
}

export function opsBounds(ops: readonly SketchOp[]): Box | null {
  let box: Box | null = null;
  for (const op of ops) {
    const b = opBounds(op);
    if (!b) continue;
    box = box
      ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) }
      : b;
  }
  return box;
}

/** How far an eraser pass reaches (the same as a pen line of its size would). */
export function eraserBounds(stroke: InkStroke): Box | null {
  return opBounds({ ...stroke, tool: "pen" });
}

export function overlaps(a: Box | null, b: Box | null): boolean {
  return !!a && !!b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Splits a sheet into separate drawings: strokes (and pictures) whose boxes
 * come within `gap` of each other stay together, so marks made in different
 * places each hang from their own line instead of moving as one block. Each
 * eraser pass goes with every group it touches, in its original order.
 */
export function groupsApart(ops: readonly SketchOp[], gap: number): SketchOp[][] {
  const boxes = ops.map((op) => (op.tool === "eraser" ? null : opBounds(op)));
  const inked = boxes.flatMap((b, i) => (b ? [i] : []));
  const parent = new Map(inked.map((i) => [i, i]));
  const root = (i: number): number => {
    let r = i;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(i, r);
    return r;
  };
  const near = (a: Box, b: Box) => a.x0 - gap < b.x1 && b.x0 - gap < a.x1 && a.y0 - gap < b.y1 && b.y0 - gap < a.y1;
  for (let x = 0; x < inked.length; x++) {
    for (let y = x + 1; y < inked.length; y++) {
      if (near(boxes[inked[x]]!, boxes[inked[y]]!)) parent.set(root(inked[x]), root(inked[y]));
    }
  }
  const members = new Map<number, Set<number>>();
  for (const i of inked) {
    const r = root(i);
    if (!members.has(r)) members.set(r, new Set());
    members.get(r)!.add(i);
  }
  const groups: { top: number; ops: SketchOp[] }[] = [];
  for (const set of members.values()) {
    let box: Box | null = null;
    for (const i of set) {
      const b = boxes[i]!;
      box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
    }
    const group = ops.filter((op, i) => set.has(i) || (op.tool === "eraser" && overlaps(eraserBounds(op), box)));
    groups.push({ top: box!.y0, ops: group });
  }
  return groups.sort((a, b) => a.top - b.top).map((g) => g.ops);
}

/** The same drawing moved and scaled: (x, y) becomes (x * scale + dx,
 * y * scale + dy), and line widths scale along. */
export function mapOps(ops: readonly SketchOp[], scale: number, dx: number, dy: number): SketchOp[] {
  return ops.map((op) => {
    if (op.tool === "image") return { ...op, x: op.x * scale + dx, y: op.y * scale + dy, w: op.w * scale, h: op.h * scale };
    const points = op.points.slice();
    for (let i = 0; i + 2 < points.length; i += 3) {
      points[i] = points[i] * scale + dx;
      points[i + 1] = points[i + 1] * scale + dy;
    }
    return { ...op, size: op.size * scale, points };
  });
}

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Rounded to what can be seen (tenths of a pixel, pressure in hundredths),
 * without points that land on the one before - keeps saved notes small. */
export function compactOps(ops: readonly SketchOp[]): SketchOp[] {
  return ops.map((op) => {
    if (op.tool === "image") return { ...op, x: round(op.x, 1), y: round(op.y, 1), w: round(op.w, 1), h: round(op.h, 1) };
    const points: number[] = [];
    for (let i = 0; i + 2 < op.points.length; i += 3) {
      const x = round(op.points[i], 1);
      const y = round(op.points[i + 1], 1);
      const n = points.length;
      if (n >= 3 && points[n - 3] === x && points[n - 2] === y) continue;
      points.push(x, y, round(op.points[i + 2], 2));
    }
    return { ...op, size: round(op.size, 2), points };
  });
}

// --------------------------------------------------------------- painting

const pathCache = new WeakMap<InkStroke, Path2D>();

function strokePath(stroke: InkStroke): Path2D {
  const cached = pathCache.get(stroke);
  if (cached) return cached;
  const path = new Path2D();
  const { circles, quads } = strokeShape(stroke);
  for (let i = 0; i < quads.length; i += 8) {
    path.moveTo(quads[i], quads[i + 1]);
    path.lineTo(quads[i + 2], quads[i + 3]);
    path.lineTo(quads[i + 4], quads[i + 5]);
    path.lineTo(quads[i + 6], quads[i + 7]);
    path.closePath();
  }
  for (let i = 0; i < circles.length; i += 3) {
    path.moveTo(circles[i] + circles[i + 2], circles[i + 1]);
    path.arc(circles[i], circles[i + 1], circles[i + 2], 0, Math.PI * 2);
    path.closePath();
  }
  pathCache.set(stroke, path);
  return path;
}

export interface InkView {
  dark: boolean;
  /** Drawing units to canvas units. */
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  /** Loaded pictures for image ops, by src. */
  images?: ReadonlyMap<string, CanvasImageSource>;
}

export function drawOp(ctx: CanvasRenderingContext2D, op: SketchOp, view: InkView): void {
  ctx.save();
  ctx.translate(view.offsetX ?? 0, view.offsetY ?? 0);
  const s = view.scale ?? 1;
  ctx.scale(s, s);
  if (op.tool === "image") {
    const img = view.images?.get(op.src);
    if (img) ctx.drawImage(img, op.x, op.y, op.w, op.h);
  } else if (op.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    ctx.fill(strokePath(op));
  } else {
    ctx.fillStyle = inkColor(op.color, view.dark);
    if (op.tool === "marker") ctx.globalAlpha = view.dark ? MARKER_ALPHA.dark : MARKER_ALPHA.light;
    ctx.fill(strokePath(op));
  }
  ctx.restore();
}

export function drawOps(ctx: CanvasRenderingContext2D, ops: readonly SketchOp[], view: InkView): void {
  for (const op of ops) drawOp(ctx, op, view);
}

/** The see-through look a marker has, for previews. */
export function markerAlpha(dark: boolean): number {
  return dark ? MARKER_ALPHA.dark : MARKER_ALPHA.light;
}
