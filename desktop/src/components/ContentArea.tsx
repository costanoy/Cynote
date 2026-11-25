import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll as cmReplaceAll,
  replaceNext as cmReplaceNext,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { EditorSelection, EditorState, StateEffect, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { NoteSketch } from "../types";
import { layoutOf, placeAt, sketchRect, type NoteLayout, type Rect } from "../noteLayout";
import { clearActiveView, setActiveView } from "../editor/bridge";
import {
  buildExtensions,
  configEffects,
  External,
  newCompartments,
  selectionInfo,
  type EditorCompartments,
  type EditorConfig,
  type SelectionInfo,
} from "../editor/extensions";
import { minimalChange } from "../editor/helpers";
import { recallNote, rememberNote } from "../editor/memory";
import { ANY_INK, inkNear, MIN_SKETCH_SIZE, sameRects, SketchView, SOLID_INK } from "../editor/SketchView";
import { FindBar, type FindMode } from "./FindBar";
import "../editor.css";

/** Most matches counted for the find bar's "n de m". */
const MAX_COUNTED_MATCHES = 5000;

interface FindState {
  mode: FindMode;
  query: string;
  replacement: string;
  caseSensitive: boolean;
  focusToken: number;
}

const normalizeBreaks = (text: string) => text.replace(/\r\n?/g, "\n");

type Props = {
  noteId: string;
  body: string;
  sketches: NoteSketch[];
  spellCheck: boolean;
  darkMode: boolean;
  /** Changes whenever the text is set differently (zoom, reading mode) - the
   * editor's box doesn't always change size with it, so nothing else would
   * tell the drawings to follow. */
  textStyleKey: string;
  /** The drawing open in Note Styling, shown there instead of here meanwhile. */
  hiddenSketchId: string | null;
  /** Line numbers in the margin (default true). */
  lineNumbers?: boolean;
  /** Long lines wrap at the window's edge (default true). */
  wordWrap?: boolean;
  /** Alt+Z. */
  onToggleWordWrap?: () => void;
  /** Where the cursors are: for the status bar. */
  onSelectionInfo?: (info: SelectionInfo) => void;
  /** Only for what the user typed or pasted, never for a change that came in
   * from outside (sync); always the whole text. */
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
  lineNumbers = true,
  wordWrap = true,
  onToggleWordWrap,
  onSelectionInfo,
  onBodyInput,
  onCaretChange,
  onUpdateSketches,
  onEditSketch,
  onDeleteSketch,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compsRef = useRef<EditorCompartments | null>(null);
  // The text the editor and the app last agreed on.
  const lastBodyRef = useRef(body);

  // Latest props, for the callbacks the editor holds on to.
  const cb = useRef({ onBodyInput, onCaretChange, onSelectionInfo, onToggleWordWrap });
  cb.current = { onBodyInput, onCaretChange, onSelectionInfo, onToggleWordWrap };
  const config: EditorConfig = { lineNumbers, wordWrap, spellCheck, darkMode };
  const configRef = useRef(config);
  configRef.current = config;

  const scroller = () => (rowRef.current?.closest(".content-wrap") as HTMLElement | null) ?? null;

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
    const view = viewRef.current;
    const row = rowRef.current;
    const sc = scroller();
    if (!view || !row || !sc) return;
    if (sketchesRef.current.length === 0) {
      layoutRef.current = null;
      setSketchRects((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    const layout = layoutOf(sc, row, view);
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
  const measureRef = useRef(measureSketches);
  measureRef.current = measureSketches;

  useLayoutEffect(measureSketches, [sketches, body]);

  // Zoom and reading mode change the type without always changing the box.
  useLayoutEffect(() => {
    viewRef.current?.requestMeasure();
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
      viewRef.current?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      onEditSketch(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setSelectedSketch(null);
      viewRef.current?.focus();
    } else if (r && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      commitRect(id, { ...r, left: Math.max(0, r.left + dx), top: Math.max(0, r.top + dy) }, false);
    }
  };

  // ------------------------------------------------------------- find
  //
  // The find bar is the app's own FindBar, mounted by a React portal into the
  // panel CodeMirror's search extension asks for, so CodeMirror highlights
  // every match and does the finding, selecting and replacing.

  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const [find, setFindState] = useState<FindState | null>(null);
  const findRef = useRef<FindState | null>(null);
  const [findTick, setFindTick] = useState(0);
  const [findInfo, setFindInfo] = useState({ count: 0, index: 0, lines: 1 });
  // Where the next incremental match is looked for from.
  const findOrigin = useRef(0);
  // What the bar held when it was last closed, for the next time it opens.
  const lastFind = useRef({ query: "", replacement: "", caseSensitive: false });

  const setFind = (next: FindState | null) => {
    findRef.current = next;
    if (next) lastFind.current = { query: next.query, replacement: next.replacement, caseSensitive: next.caseSensitive };
    setFindState(next);
  };

  const queryOf = (f: FindState) =>
    f.mode === "goto"
      ? new SearchQuery({ search: "" })
      : new SearchQuery({ search: f.query, caseSensitive: f.caseSensitive, replace: f.replacement, literal: true });

  /** Selects the first match at or after `origin` (wrapping), without taking focus from the bar. */
  const selectMatchFrom = (view: EditorView, query: SearchQuery, origin: number) => {
    if (!query.valid) return;
    let hit = query.getCursor(view.state, origin).next();
    if (hit.done) hit = query.getCursor(view.state, 0).next();
    if (hit.done) return;
    const { from, to } = hit.value;
    view.dispatch({
      selection: EditorSelection.range(from, to),
      effects: EditorView.scrollIntoView(EditorSelection.range(from, to), { y: "center" }),
      userEvent: "select.search",
    });
  };

  const applyQuery = (f: FindState, select: boolean) => {
    const view = viewRef.current;
    if (!view) return;
    const query = queryOf(f);
    view.dispatch({ effects: setSearchQuery.of(query) });
    if (select && f.mode !== "goto" && f.query) selectMatchFrom(view, query, findOrigin.current);
  };

  const openFind = (mode: FindMode) => {
    const view = viewRef.current;
    if (!view) return;
    const main = view.state.selection.main;
    const selected = main.empty ? "" : view.state.sliceDoc(main.from, main.to);
    findOrigin.current = main.from;
    const prev = findRef.current;
    const base: FindState = prev ?? { mode, ...lastFind.current, focusToken: 0 };
    const query = mode !== "goto" && selected && !selected.includes("\n") ? selected : base.query;
    const next: FindState = { ...base, mode, query, focusToken: base.focusToken + 1 };
    setFind(next);
    if (!searchPanelOpen(view.state)) openSearchPanel(view);
    applyQuery(next, true);
  };

  const closeFind = () => {
    const view = viewRef.current;
    if (view && searchPanelOpen(view.state)) closeSearchPanel(view);
    setFind(null);
    view?.focus();
  };

  const stepMatch = (delta: 1 | -1) => {
    const view = viewRef.current;
    if (!view) return;
    (delta === 1 ? findNext : findPrevious)(view);
    findOrigin.current = view.state.selection.main.from;
  };

  const goToLine = (line: number) => {
    const view = viewRef.current;
    closeFind();
    if (!view) return;
    const target = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, line)));
    view.dispatch({
      selection: EditorSelection.cursor(target.from),
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
      userEvent: "select",
    });
    view.focus();
  };

  // "n de m": counted from the editor's own query, again whenever the text,
  // the selection or the query moves.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !find || !panelHost) return;
    const lines = view.state.doc.lines;
    let count = 0;
    let index = -1;
    if (find.mode !== "goto" && find.query) {
      const query = queryOf(find);
      if (query.valid) {
        const from = view.state.selection.main.from;
        const cursor = query.getCursor(view.state);
        for (let r = cursor.next(); !r.done && count < MAX_COUNTED_MATCHES; r = cursor.next()) {
          if (index < 0 && r.value.from >= from) index = count;
          count++;
        }
      }
    }
    const next = { count, index: Math.max(0, index), lines };
    setFindInfo((prev) => (prev.count === next.count && prev.index === next.index && prev.lines === next.lines ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find?.query, find?.caseSensitive, find?.mode, panelHost, findTick]);

  // -------------------------------------------------------- the editor

  // Mount: restore where this note was left, or open it with the caret at the end.
  useLayoutEffect(() => {
    const parent = hostRef.current!;
    const comps = newCompartments();
    compsRef.current = comps;
    const extensions = buildExtensions(
      {
        textChanged: (text) => {
          lastBodyRef.current = text;
          cb.current.onBodyInput(text);
        },
        selectionChanged: (info) => {
          cb.current.onCaretChange(info.line, info.col);
          cb.current.onSelectionInfo?.(info);
          if (findRef.current) setFindTick((n) => n + 1);
        },
        layoutChanged: () => {
          if (findRef.current) setFindTick((n) => n + 1);
          measureRef.current();
        },
        toggleWordWrap: () => cb.current.onToggleWordWrap?.(),
        createFindPanel: () => {
          const dom = document.createElement("div");
          dom.className = "cy-find-host";
          setPanelHost(dom);
          return {
            dom,
            top: true,
            destroy() {
              setPanelHost((cur) => (cur === dom ? null : cur));
              if (findRef.current) {
                findRef.current = null;
                setFindState(null);
              }
            },
          };
        },
      },
      configRef.current,
      comps
    );

    const saved = recallNote(noteId);
    const text = normalizeBreaks(body);
    let state: EditorState;
    if (saved) {
      state = saved.state.update({ effects: StateEffect.reconfigure.of(extensions) }).state;
      // The note changed while it was away (sync): bring that in without touching history or cursors.
      const change = minimalChange(state.doc.toString(), text);
      if (change) state = state.update({ changes: change, annotations: [External.of(true), Transaction.addToHistory.of(false)] }).state;
    } else {
      state = EditorState.create({ doc: text, extensions });
      state = state.update({ selection: EditorSelection.cursor(state.doc.length) }).state;
    }
    lastBodyRef.current = body;

    const view = new EditorView({ state, parent });
    viewRef.current = view;
    setActiveView(view);

    const sc = scroller();
    let lastScroll = saved?.scrollTop ?? 0;
    const onScroll = () => {
      if (sc) lastScroll = sc.scrollTop;
    };
    sc?.addEventListener("scroll", onScroll);
    if (sc) {
      if (saved) {
        sc.scrollTop = lastScroll;
        // Heights of wrapped lines settle after the first measure.
        requestAnimationFrame(() => {
          if (viewRef.current === view && Math.abs(sc.scrollTop - lastScroll) > 1) sc.scrollTop = lastScroll;
        });
      } else {
        // First visit: the caret is at the end of the note, so show the end.
        sc.scrollTop = sc.scrollHeight;
        view.dispatch({ effects: EditorView.scrollIntoView(state.selection.main.head, { y: "nearest" }) });
      }
    }
    view.focus();
    const info = selectionInfo(view.state);
    cb.current.onCaretChange(info.line, info.col);
    cb.current.onSelectionInfo?.(info);

    // Rewrapping, zoom and reading mode all move the text - and the drawings
    // hanging from it.
    const resize = new ResizeObserver(() => measureRef.current());
    resize.observe(parent);
    if (rowRef.current) resize.observe(rowRef.current);
    // The note's typeface can finish loading after the first layout and
    // shift every line a little.
    document.fonts?.ready.then(() => {
      if (viewRef.current === view) {
        view.requestMeasure();
        measureRef.current();
      }
    });

    return () => {
      sc?.removeEventListener("scroll", onScroll);
      resize.disconnect();
      if (hoverFrame.current) cancelAnimationFrame(hoverFrame.current);
      // The find bar belongs to one visit; the rest of the state is kept.
      if (searchPanelOpen(view.state)) closeSearchPanel(view);
      rememberNote(noteId, { state: view.state, scrollTop: sc ? sc.scrollTop : lastScroll });
      clearActiveView(view);
      viewRef.current = null;
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typing keeps `body` equal to the editor's text, so a mismatch means the
  // note changed from outside (sync pulled in a newer version): show it as the
  // smallest edit that gets there, so the cursor stays where it was and the
  // undo history stays intact.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || body === lastBodyRef.current) return;
    lastBodyRef.current = body;
    const change = minimalChange(view.state.doc.toString(), normalizeBreaks(body));
    if (change) view.dispatch({ changes: change, annotations: [External.of(true), Transaction.addToHistory.of(false)] });
  }, [body]);

  // Settings that can change while the note is open. The editor was built with
  // the current ones, so the first run has nothing to apply.
  const appliedConfig = useRef(config);
  useEffect(() => {
    const view = viewRef.current;
    const comps = compsRef.current;
    const prev = appliedConfig.current;
    if (!view || !comps) return;
    if (prev.lineNumbers === lineNumbers && prev.wordWrap === wordWrap && prev.spellCheck === spellCheck && prev.darkMode === darkMode) return;
    appliedConfig.current = { lineNumbers, wordWrap, spellCheck, darkMode };
    view.dispatch({ effects: configEffects(comps, appliedConfig.current) });
  }, [lineNumbers, wordWrap, spellCheck, darkMode]);

  // Ctrl+F, Ctrl+H, Ctrl+G and F3 are heard on the window because the header's
  // menu sends the same key events there. Anything the editor already
  // handled has had its default prevented, and is left alone.
  const windowKeyDown = useRef((_e: KeyboardEvent) => {});
  windowKeyDown.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const view = viewRef.current;
    const ctrl = e.ctrlKey || e.metaKey;
    const lower = e.key.toLowerCase();
    const current = findRef.current;
    if (ctrl && !e.altKey && !e.shiftKey && (lower === "f" || lower === "h" || lower === "g")) {
      e.preventDefault();
      if (lower === "h" && current?.mode === "replace") setFind({ ...current, focusToken: current.focusToken + 1 });
      else openFind(lower === "f" ? "find" : lower === "h" ? "replace" : "goto");
    } else if (e.key === "F3" && current && current.mode !== "goto") {
      e.preventDefault();
      stepMatch(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape" && current && view?.hasFocus) {
      e.preventDefault();
      closeFind();
    }
  };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => windowKeyDown.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const changeFind = (patch: Partial<FindState>, opts: { select?: boolean; refocus?: boolean } = {}) => {
    const current = findRef.current;
    if (!current) return;
    const next = { ...current, ...patch, focusToken: opts.refocus ? current.focusToken + 1 : current.focusToken };
    setFind(next);
    applyQuery(next, opts.select ?? false);
  };

  return (
    <>
      <div
        className={"note-body-row" + (overInk ? " over-ink" : "") + (sketchPreview ? " " + sketchPreview.kind + "-sketch" : "")}
        ref={rowRef}
        onPointerDownCapture={onRowPointerDown}
        onPointerMove={onRowPointerMove}
        onPointerUp={onRowPointerUp}
        onPointerCancel={onRowPointerUp}
        onPointerLeave={onRowPointerLeave}
      >
        <div className="cy-editor-host" ref={hostRef} />
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
      {panelHost &&
        find &&
        createPortal(
          <FindBar
            mode={find.mode}
            query={find.query}
            replacement={find.replacement}
            caseSensitive={find.caseSensitive}
            matchCount={findInfo.count}
            currentIndex={findInfo.index}
            lineCount={findInfo.lines}
            focusToken={find.focusToken}
            onQueryChange={(query) => changeFind({ query }, { select: true })}
            onReplacementChange={(replacement) => changeFind({ replacement })}
            onToggleCase={() => changeFind({ caseSensitive: !find.caseSensitive }, { select: true, refocus: true })}
            onToggleReplace={() => changeFind({ mode: find.mode === "replace" ? "find" : "replace" }, { refocus: true })}
            onNext={() => stepMatch(1)}
            onPrev={() => stepMatch(-1)}
            onReplaceOne={() => viewRef.current && cmReplaceNext(viewRef.current)}
            onReplaceAll={() => viewRef.current && cmReplaceAll(viewRef.current)}
            onGoToLine={goToLine}
            onClose={closeFind}
          />,
          panelHost
        )}
    </>
  );
}
