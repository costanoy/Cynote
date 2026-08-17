import { useEffect, useRef } from "react";

const COLORS_DARK = ["#ff8c3a", "#ffb02e", "#c1530a", "#f5eee6"];
const COLORS_LIGHT = ["#ff8c3a", "#ffb02e", "#c1530a", "#2a1a10"];

const MAX_WIDTH = 3.2;
const MIN_WIDTH = 1.1;
const WIDTH_SMOOTHING = 0.35;
const INK_ALPHA = 0.86;

type Props = {
  open: boolean;
  darkMode: boolean;
  drawColor: string;
  onSetColor: (c: string) => void;
  onCancel: () => void;
  onInsert: (canvas: HTMLCanvasElement) => void;
};

export function DrawingOverlay({ open, darkMode, drawColor, onSetColor, onCancel, onInsert }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cssSize = useRef({ w: 0, h: 0 });
  const isDrawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const currentWidth = useRef(MAX_WIDTH * 0.6);
  const colors = darkMode ? COLORS_DARK : COLORS_LIGHT;

  // Keep the canvas's real pixel buffer matching its displayed CSS size (at
  // device pixel ratio) instead of the fixed 360x200 it used to render at -
  // that mismatch (stretched via CSS) was the actual source of the
  // "pixelated" look, not the icon.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      if (isDrawing.current) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      cssSize.current = { w: rect.width, h: rect.height };
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    lastPoint.current = getPos(e);
    currentWidth.current = MAX_WIDTH * 0.6;
  };

  // Smooths freehand input into a soft, continuous stroke - like a signature
  // pad: each new point curves through the midpoint of the last two samples
  // instead of connecting them with a straight (faceted) line, and the line
  // width eases toward a speed-based target so fast strokes taper thin and
  // slow ones stay fuller - closer to a real pen's feel than a flat 4px line.
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const pos = getPos(e);
    const last = lastPoint.current;
    const mid = { x: (last.x + pos.x) / 2, y: (last.y + pos.y) / 2 };

    const dist = Math.hypot(pos.x - last.x, pos.y - last.y);
    const targetWidth = Math.max(MIN_WIDTH, MAX_WIDTH - dist * 0.25);
    currentWidth.current += (targetWidth - currentWidth.current) * WIDTH_SMOOTHING;

    ctx.globalAlpha = INK_ALPHA;
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = currentWidth.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.stroke();

    lastPoint.current = pos;
  };

  const onUp = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, cssSize.current.w, cssSize.current.h);
  };

  return (
    <div className={"overlay" + (open ? " open" : "")}>
      <div className="overlay-header">
        <span className="overlay-title heading-font">Note Styling</span>
        <div style={{ flex: 1 }} />
        {colors.map((c) => (
          <button
            key={c}
            className={"swatch" + (drawColor === c ? " selected" : "")}
            style={{ background: c }}
            onClick={() => onSetColor(c)}
          />
        ))}
        <button className="clear-btn" onClick={clearCanvas}>
          Limpar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="draw-canvas"
        style={{
          background: `repeating-linear-gradient(0deg, var(--canvas-bg), var(--canvas-bg) 27px, var(--canvas-line) 28px)`,
        }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      />
      <div className="overlay-footer">
        <button className="cancel-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="insert-btn"
          onClick={() => {
            if (canvasRef.current) onInsert(canvasRef.current);
            clearCanvas();
          }}
        >
          Inserir no texto
        </button>
      </div>
    </div>
  );
}
