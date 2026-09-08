import { useEffect, useRef, useState } from "react";
import type { NoteSketch } from "../types";
import { DrawIcon, TrashIcon } from "../icons";

const MIN_SKETCH_SIZE = 40;
const MAX_SKETCH_SIZE = 480;

type Props = {
  body: string;
  sketches: NoteSketch[];
  spellCheck: boolean;
  onBodyInput: (value: string) => void;
  onMoveSketch: (id: string, x: number, y: number) => void;
  onResizeSketch: (id: string, width: number, height: number) => void;
  onEditSketch: (id: string) => void;
  onDeleteSketch: (id: string) => void;
};

export function ContentArea({
  body,
  sketches,
  spellCheck,
  onBodyInput,
  onMoveSketch,
  onResizeSketch,
  onEditSketch,
  onDeleteSketch,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Set the initial text once on mount only. The div is intentionally left
  // uncontrolled after that — React must never touch its text content again,
  // or the caret resets to the start on every keystroke (looks like typing
  // "backwards" and stuck on the first line).
  //
  // Each line gets its own top-level <div> (matching what Chromium itself
  // creates when the user presses Enter) instead of relying on the innerText
  // setter's own line-break handling, which can produce a different, less
  // predictable structure. The line-gutter's click handler depends on this
  // one-line-per-top-level-child shape to know which line was clicked.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    for (const line of body.split("\n")) {
      const div = document.createElement("div");
      if (line) div.textContent = line;
      else div.appendChild(document.createElement("br"));
      el.appendChild(div);
    }
    el.focus();
    // Land the caret at the end of any existing text rather than the start,
    // so switching tabs (or opening a fresh blank one) is ready to type into.
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Strip whatever formatting the source had (fonts, colors, bold, links...)
  // so pasted text always matches the note's own style, instead of dragging
  // in a webpage's or Word doc's original look.
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  // Notepad-margin-click: pick whichever top-level line sits at the click's
  // height, select it (so it's visibly highlighted, same as clicking there
  // in Word) and copy it straight to the clipboard - a trailing newline is
  // included unless it's the last line, so pasting elsewhere drops in a
  // ready-made line rather than text that runs into whatever follows it.
  const onGutterClick = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || el.childNodes.length === 0) return;
    const y = e.clientY;

    let target: ChildNode = el.firstChild!;
    let bestDist = Infinity;
    for (const child of Array.from(el.childNodes)) {
      const rect =
        child.nodeType === Node.ELEMENT_NODE
          ? (child as HTMLElement).getBoundingClientRect()
          : (() => {
              const r = document.createRange();
              r.selectNodeContents(child);
              return r.getBoundingClientRect();
            })();
      if (y >= rect.top && y <= rect.bottom) {
        target = child;
        break;
      }
      const dist = y < rect.top ? rect.top - y : y - rect.bottom;
      if (dist < bestDist) {
        bestDist = dist;
        target = child;
      }
    }

    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const isLast = target === el.lastChild;
    const text = (target.textContent ?? "") + (isLast ? "" : "\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <>
      <div className="note-body-row">
        <div className="line-gutter" title="Clique para copiar a linha" onClick={onGutterClick} />
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          spellCheck={spellCheck}
          className="note-body"
          onPaste={onPaste}
          // innerText reports line breaks as "\r\n" on Windows, which counts as
          // 2 characters per Enter press instead of 1 - normalize to "\n".
          onInput={(e) => onBodyInput(e.currentTarget.innerText.replace(/\r\n/g, "\n"))}
        />
      </div>

      {sketches.map((sketch) => (
        <DraggableSketch
          key={sketch.id}
          sketch={sketch}
          onMove={onMoveSketch}
          onResize={onResizeSketch}
          onEdit={onEditSketch}
          onDelete={onDeleteSketch}
        />
      ))}
    </>
  );
}

function DraggableSketch({
  sketch,
  onMove,
  onResize,
  onEdit,
  onDelete,
}: {
  sketch: NoteSketch;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [resizeDims, setResizeDims] = useState<{ width: number; height: number } | null>(null);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 });
  const resizeStart = useRef({ mouseX: 0, width: 0, height: 0, aspect: 1 });

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, x: sketch.x, y: sketch.y };

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStart.current.mouseX;
      const dy = ev.clientY - dragStart.current.mouseY;
      setDragPos({ x: dragStart.current.x + dx, y: dragStart.current.y + dy });
    };
    const onMouseUp = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStart.current.mouseX;
      const dy = ev.clientY - dragStart.current.mouseY;
      onMove(sketch.id, dragStart.current.x + dx, dragStart.current.y + dy);
      setDragPos(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Drags the bottom-right handle to scale the sketch up or down, keeping
  // its original aspect ratio instead of stretching it out of shape.
  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeStart.current = {
      mouseX: e.clientX,
      width: sketch.width,
      height: sketch.height,
      aspect: sketch.width / sketch.height,
    };

    const computeSize = (clientX: number) => {
      const dx = clientX - resizeStart.current.mouseX;
      const width = Math.min(MAX_SKETCH_SIZE, Math.max(MIN_SKETCH_SIZE, resizeStart.current.width + dx));
      const height = width / resizeStart.current.aspect;
      return { width, height };
    };
    const onMouseMove = (ev: MouseEvent) => setResizeDims(computeSize(ev.clientX));
    const onMouseUp = (ev: MouseEvent) => {
      const size = computeSize(ev.clientX);
      onResize(sketch.id, size.width, size.height);
      setResizeDims(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const pos = dragPos ?? { x: sketch.x, y: sketch.y };
  const size = resizeDims ?? { width: sketch.width, height: sketch.height };

  return (
    <div className="note-sketch-wrap" style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}>
      <img
        src={sketch.dataUrl}
        alt=""
        draggable={false}
        className="note-sketch"
        onMouseDown={onMouseDown}
        onDoubleClick={() => onEdit(sketch.id)}
      />
      <div className="sketch-toolbar">
        <button
          className="sketch-tool-btn"
          title="Editar desenho"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onEdit(sketch.id)}
        >
          <DrawIcon size={11} />
        </button>
        <button
          className="sketch-tool-btn delete"
          title="Excluir desenho"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(sketch.id)}
        >
          <TrashIcon size={11} />
        </button>
      </div>
      <div className="sketch-resize-handle" title="Redimensionar" onMouseDown={onResizeMouseDown} />
    </div>
  );
}
