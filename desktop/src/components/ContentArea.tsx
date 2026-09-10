import { useEffect, useRef, useState } from "react";
import type { NoteSketch } from "../types";
import { DrawIcon, TrashIcon } from "../icons";

const MIN_SKETCH_SIZE = 40;
const MAX_SKETCH_SIZE = 480;

/** A flat [start, end) character range into the note's body string. */
type Occurrence = { start: number; end: number };

function isWordChar(c: string): boolean {
  return /[\p{L}\p{N}_]/u.test(c);
}

/** Expands a collapsed caret position out to the word surrounding it, matching what Ctrl+D
 * selects first in VS Code/Sublime when nothing is already selected. */
function wordRangeAt(text: string, pos: number): Occurrence | null {
  let start = pos;
  let end = pos;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;
  return start < end ? { start, end } : null;
}

/** Next match of `query` after `from`, wrapping around the document, skipping anything
 * already in `exclude` (so repeated Ctrl+D presses keep advancing instead of re-picking). */
function findNextOccurrence(body: string, query: string, from: number, exclude: Occurrence[]): Occurrence | null {
  if (!query) return null;
  const excluded = new Set(exclude.map((o) => o.start));
  const search = (start: number, end: number): Occurrence | null => {
    let idx = body.indexOf(query, start);
    while (idx !== -1 && idx < end) {
      if (!excluded.has(idx)) return { start: idx, end: idx + query.length };
      idx = body.indexOf(query, idx + 1);
    }
    return null;
  };
  return search(from, body.length) ?? search(0, from);
}

/** Smallest single edit that turns `oldStr` into `newStr` - valid as long as only one
 * contiguous region actually changed, which holds for a single keystroke or paste. */
function diffEdit(oldStr: string, newStr: string): { start: number; oldEnd: number; newText: string } | null {
  if (oldStr === newStr) return null;
  let prefix = 0;
  const maxPrefix = Math.min(oldStr.length, newStr.length);
  while (prefix < maxPrefix && oldStr[prefix] === newStr[prefix]) prefix++;
  let oldEnd = oldStr.length;
  let newEnd = newStr.length;
  while (oldEnd > prefix && newEnd > prefix && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { start: prefix, oldEnd, newText: newStr.slice(prefix, newEnd) };
}

/** Replays the edit the browser just made at one occurrence onto every other tracked
 * occurrence, working right-to-left so earlier offsets stay valid while splicing. This is
 * what makes typing while multiple matches are selected edit all of them at once. */
function applyMultiEdit(
  oldBody: string,
  newBody: string,
  occs: Occurrence[]
): { patchedBody: string; newOccurrences: Occurrence[]; primaryIndex: number } | null {
  const diff = diffEdit(oldBody, newBody);
  if (!diff) return null;
  const primaryIndex = occs.findIndex((o) => diff.start >= o.start && diff.oldEnd <= o.end);
  if (primaryIndex === -1) return null;

  const edited = occs[primaryIndex];
  const relStart = diff.start - edited.start;
  const relEnd = diff.oldEnd - edited.start;
  const oldLen = edited.end - edited.start;
  const newLen = oldLen - (relEnd - relStart) + diff.newText.length;
  const delta = newLen - oldLen;

  // Every occurrence's position in newBody's coordinate space - newBody
  // already reflects the primary edit, so anything after it has already
  // shifted by delta there.
  const mapped = occs.map((o, i) => ({
    i,
    start: i === primaryIndex ? edited.start : o.start > edited.start ? o.start + delta : o.start,
  }));

  // Splice the same edit into every OTHER occurrence, right-to-left so each
  // splice target is still valid for the ones still waiting their turn.
  let patched = newBody;
  for (const { start } of [...mapped].filter((m) => m.i !== primaryIndex).sort((a, b) => b.start - a.start)) {
    patched = patched.slice(0, start + relStart) + diff.newText + patched.slice(start + relEnd);
  }

  // Final positions: every occurrence has the same length before and after
  // (they're all copies of the same matched text), so the k-th occurrence
  // left to right simply shifts by k * delta from the ones already spliced
  // in ahead of it - unlike the splicing above, this can't be done
  // right-to-left, since each occurrence's own final position depends on
  // every occurrence to ITS left, not the one after it.
  const finalStart = new Map<number, number>();
  [...mapped]
    .sort((a, b) => a.start - b.start)
    .forEach(({ i, start }, k) => finalStart.set(i, start + k * delta));

  const newOccurrences = occs.map((_, i) => {
    const start = finalStart.get(i)!;
    return { start, end: start + newLen };
  });

  return { patchedBody: patched, newOccurrences, primaryIndex };
}

/** Finds the text node + offset `localOffset` characters into `container`, walking through
 * any nested highlight <span>s - needed since a line's content isn't always one plain text
 * node once occurrence highlights are in play. */
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

/** Inverse of domPointFromFlatOffset: how far (node, offset) is into the document's flat text. */
function flatOffsetFromPoint(el: HTMLElement, node: Node, offset: number): number {
  let total = 0;
  for (const child of Array.from(el.childNodes)) {
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

/** Which line (1-based) and column (1-based) the caret currently sits on, read straight
 * from the DOM so it stays right even when React's `body` prop is a keystroke behind. */
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

  // Caret sitting directly on the editor itself (empty note, or between lines).
  if (focusNode === el) return { line: Math.min(focusOffset + 1, Math.max(children.length, 1)), col: 1 };
  return null;
}

function setSelectionRange(el: HTMLElement, start: number, end: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const a = domPointFromFlatOffset(el, start);
  const b = domPointFromFlatOffset(el, end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Builds one line <div>'s children, wrapping any `highlights` that fall inside it in a
 * <span> so multiple occurrences can be shown selected at once - Chromium's Selection API
 * only supports one real range, so the extras are faked with background-colored spans. */
function buildLineChildren(lineText: string, lineStart: number, highlights: Occurrence[]): Node[] {
  if (!lineText) return [document.createElement("br")];
  const local = highlights
    .map((r) => ({ start: Math.max(0, r.start - lineStart), end: Math.min(lineText.length, r.end - lineStart) }))
    .filter((r) => r.start < r.end)
    .sort((a, b) => a.start - b.start);

  const nodes: Node[] = [];
  let pos = 0;
  for (const r of local) {
    if (r.start > pos) nodes.push(document.createTextNode(lineText.slice(pos, r.start)));
    const span = document.createElement("span");
    span.className = "occurrence-highlight";
    span.textContent = lineText.slice(r.start, r.end);
    nodes.push(span);
    pos = r.end;
  }
  if (pos < lineText.length) nodes.push(document.createTextNode(lineText.slice(pos)));
  return nodes;
}

function rebuildDom(el: HTMLElement, text: string, highlights: Occurrence[] = []) {
  el.innerHTML = "";
  let offset = 0;
  for (const line of text.split("\n")) {
    const div = document.createElement("div");
    for (const node of buildLineChildren(line, offset, highlights)) div.appendChild(node);
    el.appendChild(div);
    offset += line.length + 1;
  }
}

type Props = {
  body: string;
  sketches: NoteSketch[];
  spellCheck: boolean;
  onBodyInput: (value: string) => void;
  onCaretChange: (line: number, col: number) => void;
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
  onCaretChange,
  onMoveSketch,
  onResizeSketch,
  onEditSketch,
  onDeleteSketch,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Ctrl+D multi-select: every occurrence currently "selected" (VS Code/Sublime
  // style). The last one always carries the real native Selection - the rest are
  // faked with .occurrence-highlight spans (see buildLineChildren above), since
  // Chromium doesn't support more than one real selection range.
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [multiQuery, setMultiQuery] = useState<string | null>(null);

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
    rebuildDom(el, body);
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

  // selectionchange is the only event that catches every way the caret moves -
  // typing, arrow keys, clicking, selecting - so the Ln/Col readout tracks all
  // of them from one place.
  useEffect(() => {
    const report = () => {
      const el = ref.current;
      if (!el) return;
      const pos = caretLineCol(el);
      if (pos) onCaretChange(pos.line, pos.col);
    };
    report();
    document.addEventListener("selectionchange", report);
    return () => document.removeEventListener("selectionchange", report);
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

  // el.innerText miscounts blank lines in this browser: an empty
  // <div><br></div> sometimes adds an extra "\n" beyond its block boundary,
  // sometimes drops its line entirely, and it's worse with consecutive blank
  // lines - each reopen-and-edit cycle could compound the drift into a
  // growing gap of "phantom" blank lines nobody typed. Serialize from the
  // DOM structure itself instead (one line per top-level child, matching
  // what the mount effect above builds and what Enter/paste produce), which
  // has no such ambiguity.
  const getBodyText = (el: HTMLElement): string => {
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
  };

  // Drops the fake multi-select highlights and, unless the caller already knows
  // where the caret should land (e.g. a click that's about to place it itself),
  // keeps it wherever it already was.
  const clearMultiSelect = () => {
    if (occurrences.length === 0) return;
    const el = ref.current;
    let caret: number | null = null;
    if (el) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        caret = flatOffsetFromPoint(el, r.startContainer, r.startOffset);
      }
    }
    setOccurrences([]);
    setMultiQuery(null);
    if (el) {
      rebuildDom(el, body);
      if (caret !== null) setSelectionRange(el, caret, caret);
    }
  };

  // Ctrl+D: first press selects the current selection (or the word under the
  // caret, if nothing's selected) and jumps to the next matching occurrence;
  // each press after that adds one more. Typing while several are selected
  // (see onInput below) edits all of them at once.
  const onCtrlD = () => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const a = flatOffsetFromPoint(el, range.startContainer, range.startOffset);
    const b = flatOffsetFromPoint(el, range.endContainer, range.endOffset);
    const selStart = Math.min(a, b);
    const selEnd = Math.max(a, b);

    if (occurrences.length === 0) {
      const base = selStart !== selEnd ? { start: selStart, end: selEnd } : wordRangeAt(body, selStart);
      if (!base) return;
      const query = body.slice(base.start, base.end);
      if (!query) return;
      const next = findNextOccurrence(body, query, base.end, [base]);
      const all = next ? [base, next] : [base];
      setMultiQuery(query);
      setOccurrences(all);
      rebuildDom(el, body, all.slice(0, -1));
      const focus = all[all.length - 1];
      setSelectionRange(el, focus.start, focus.end);
    } else if (multiQuery) {
      const last = occurrences[occurrences.length - 1];
      const next = findNextOccurrence(body, multiQuery, last.end, occurrences);
      if (!next) return;
      const all = [...occurrences, next];
      setOccurrences(all);
      rebuildDom(el, body, all.slice(0, -1));
      setSelectionRange(el, next.start, next.end);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      onCtrlD();
      return;
    }
    if (occurrences.length === 0) return;
    if (e.key === "Escape") {
      e.preventDefault();
      clearMultiSelect();
    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      clearMultiSelect();
    }
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

    const children = Array.from(el.childNodes);
    const index = children.indexOf(target);
    const isLast = target === el.lastChild;

    // Select the line break along with the text, not just the text, so
    // pressing Delete/Backspace afterwards removes the whole line instead
    // of leaving an empty one behind - selectNodeContents alone only ever
    // grabbed what's inside this line's own <div>, never the boundary that
    // actually separates it from its neighbor.
    const range = document.createRange();
    if (children.length === 1) {
      range.selectNodeContents(target);
    } else if (!isLast) {
      range.setStart(el, index);
      range.setEnd(el, index + 1);
    } else {
      // Last line: there's no next line to extend into, so swallow the
      // break *before* it instead. A parent-indexed boundary can only sit
      // between whole siblings, so "before the previous line" (like the
      // branch above) would pull that entire line in too - the break itself
      // only exists at the *end* of the previous line's own content.
      const prev = target.previousSibling!;
      const prevEnd = prev.nodeType === Node.TEXT_NODE ? (prev.textContent?.length ?? 0) : prev.childNodes.length;
      range.setStart(prev, prevEnd);
      range.setEnd(el, index + 1);
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

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
          onKeyDown={onKeyDown}
          onMouseDown={clearMultiSelect}
          onBlur={clearMultiSelect}
          onInput={(e) => {
            const el = e.currentTarget;
            const newBody = getBodyText(el);

            if (occurrences.length > 1) {
              const result = applyMultiEdit(body, newBody, occurrences);
              if (result) {
                const others = result.newOccurrences.filter((_, i) => i !== result.primaryIndex);
                rebuildDom(el, result.patchedBody, others);
                const primary = result.newOccurrences[result.primaryIndex];
                setSelectionRange(el, primary.end, primary.end);
                setOccurrences(result.newOccurrences);
                onBodyInput(result.patchedBody);
                return;
              }
              setOccurrences([]);
              setMultiQuery(null);
            }

            onBodyInput(newBody);
          }}
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
