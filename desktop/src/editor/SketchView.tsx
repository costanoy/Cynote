import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NoteSketch } from "../types";
import { EditIcon, GripIcon, TrashIcon } from "../icons";
import { drawOps } from "../ink";
import type { Rect } from "../noteLayout";
import { imagesFor } from "../sketchImages";

/** How close to the ink a click still grabs a drawing, in px. */
export const INK_REACH = 5;
/** Pen ink is solid; a marker's is see-through. Pressing on solid ink grabs
 * the drawing, while a highlight leaves the text under it clickable - any ink
 * still brings up the drawing's toolbar, whose handle moves it. */
export const SOLID_INK = 140;
export const ANY_INK = 24;
export const MIN_SKETCH_SIZE = 16;

export function sameRects(a: Map<string, Rect>, b: Map<string, Rect>): boolean {
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
export function inkNear(canvas: HTMLCanvasElement, clientX: number, clientY: number, minAlpha: number): boolean {
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
export function SketchView({
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
