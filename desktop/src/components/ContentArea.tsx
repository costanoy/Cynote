import { useEffect, useRef, useState } from "react";
import type { NoteSketch } from "../types";

type Props = {
  body: string;
  sketches: NoteSketch[];
  spellCheck: boolean;
  onBodyInput: (value: string) => void;
  onMoveSketch: (id: string, x: number, y: number) => void;
};

export function ContentArea({ body, sketches, spellCheck, onBodyInput, onMoveSketch }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Set the initial text once on mount only. The div is intentionally left
  // uncontrolled after that — React must never touch its text content again,
  // or the caret resets to the start on every keystroke (looks like typing
  // "backwards" and stuck on the first line).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerText = body;
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

  return (
    <>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={spellCheck}
        className="note-body"
        // innerText reports line breaks as "\r\n" on Windows, which counts as
        // 2 characters per Enter press instead of 1 - normalize to "\n".
        onInput={(e) => onBodyInput(e.currentTarget.innerText.replace(/\r\n/g, "\n"))}
      />

      {sketches.map((sketch) => (
        <DraggableSketch key={sketch.id} sketch={sketch} onMove={onMoveSketch} />
      ))}
    </>
  );
}

function DraggableSketch({
  sketch,
  onMove,
}: {
  sketch: NoteSketch;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 });

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

  const pos = dragPos ?? { x: sketch.x, y: sketch.y };

  return (
    <img
      src={sketch.dataUrl}
      alt=""
      draggable={false}
      className="note-sketch"
      style={{ left: pos.x, top: pos.y, width: sketch.width, height: sketch.height }}
      onMouseDown={onMouseDown}
    />
  );
}
