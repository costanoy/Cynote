import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NoteSketch } from "../types";
import { DrawIcon, TrashIcon } from "../icons";
import * as core from "../editorCore";
import type { EditorState, Sel } from "../editorCore";
import { FindBar, type FindMode } from "./FindBar";

const MIN_SKETCH_SIZE = 40;
const MAX_SKETCH_SIZE = 480;

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
  onBodyInput: (value: string) => void;
  onCaretChange: (line: number, col: number) => void;
  onMoveSketch: (id: string, x: number, y: number) => void;
  onResizeSketch: (id: string, width: number, height: number) => void;
  onEditSketch: (id: string) => void;
  onDeleteSketch: (id: string) => void;
};

export function ContentArea({
  noteId,
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
    const resize = new ResizeObserver(() => paintExtras());
    resize.observe(el);
    return () => {
      if (sc) mem.scrollTop = sc.scrollTop;
      sc?.removeEventListener("scroll", onScroll);
      resize.disconnect();
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
      return;
    }
    setHighlight(
      "cy-find",
      matches.filter((_, i) => i !== currentMatch).map((m) => domRange(el, m.anchor, m.head))
    );
    const cur = matches[currentMatch];
    setHighlight("cy-find-current", [domRange(el, cur.anchor, cur.head)]);
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

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    mem.history.breakGroup();
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

  // Notepad-margin-click: select the whole line at the click's height
  // (including its line break, so Delete removes the line) and copy it.
  const onGutterClick = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || el.childNodes.length === 0) return;
    mem.history.breakGroup();
    const y = e.clientY;
    const children = Array.from(el.childNodes);
    let index = 0;
    let bestDist = Infinity;
    children.forEach((child, i) => {
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
        index = i;
      }
    });
    const text = bodyRef.current;
    const start = core.lineStartOffset(text, index);
    const end = core.lineEnd(text, start);
    const isLast = end === text.length;
    const range = isLast ? { anchor: start > 0 ? start - 1 : 0, head: end } : { anchor: start, head: end + 1 };
    showSels([range], { scroll: false });
    const lineText = text.slice(start, end) + (isLast ? "" : "\n");
    navigator.clipboard?.writeText(lineText).catch(() => {});
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
      <div className="note-body-row" ref={rowRef}>
        <div className="line-gutter" title="Clique para copiar a linha" onClick={onGutterClick} />
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
