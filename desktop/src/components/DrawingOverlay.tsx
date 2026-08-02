import { useRef } from "react";

const COLORS_DARK = ["#ff8c3a", "#ffb02e", "#c1530a", "#f5eee6"];
const COLORS_LIGHT = ["#ff8c3a", "#ffb02e", "#c1530a", "#2a1a10"];

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
  const isDrawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const colors = darkMode ? COLORS_DARK : COLORS_LIGHT;

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    last.current = getPos(e);
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pos = getPos(e);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x * scaleX, last.current.y * scaleY);
    ctx.lineTo(pos.x * scaleX, pos.y * scaleY);
    ctx.stroke();
    last.current = pos;
  };

  const onUp = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
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
        width={360}
        height={200}
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
