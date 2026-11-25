import { highlightSelectionMatches, search } from "@codemirror/search";
import { indentUnit } from "@codemirror/language";
import { Annotation, Compartment, EditorSelection, EditorState, type Extension, type StateEffect } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLineGutter,
  lineNumbers,
  rectangularSelection,
  type Panel,
} from "@codemirror/view";
import { lineClipboard } from "./clipboard";
import { editorKeymap, historyExtension, plainTextOnly } from "./commands";

/** Marks a transaction that brings in text from outside (sync): it does not
 * count as the user typing, so ContentArea must not report it back. */
export const External = Annotation.define<boolean>();

export interface SelectionInfo {
  line: number;
  col: number;
  selections: number;
  selectedChars: number;
}

/** What the editor calls back into. */
export interface EditorHost {
  /** The user changed the text; always the whole text. */
  textChanged: (text: string) => void;
  selectionChanged: (info: SelectionInfo) => void;
  /** Geometry, height or viewport moved: whatever hangs from the text must re-measure. */
  layoutChanged: () => void;
  toggleWordWrap: () => void;
  createFindPanel: (view: EditorView) => Panel;
}

export interface EditorConfig {
  lineNumbers: boolean;
  wordWrap: boolean;
  spellCheck: boolean;
  darkMode: boolean;
}

export interface EditorCompartments {
  numbers: Compartment;
  wrap: Compartment;
  spell: Compartment;
  dark: Compartment;
}

export function selectionInfo(state: EditorState): SelectionInfo {
  const main = state.selection.main;
  const line = state.doc.lineAt(main.head);
  let chars = 0;
  for (const r of state.selection.ranges) chars += r.to - r.from;
  return { line: line.number, col: main.head - line.from + 1, selections: state.selection.ranges.length, selectedChars: chars };
}

/** The scrolling ancestor, which holds the note's scroll position. */
function scrollerOf(view: EditorView): HTMLElement | null {
  return view.dom.closest<HTMLElement>(".content-wrap");
}

/** Pressing in the margin selects the whole line under the pointer, and
 * dragging up or down extends by whole lines, like Notepad. */
function marginMouseDown(view: EditorView, block: { from: number }, event: Event): boolean {
  const e = event as MouseEvent;
  if (e.button !== 0) return false;
  e.preventDefault();
  const doc = view.state.doc;
  const anchorLine = doc.lineAt(block.from);
  const lineEnd = (n: number) => Math.min(doc.length, doc.line(n).to + 1);

  const selectTo = (clientY: number) => {
    const x = view.contentDOM.getBoundingClientRect().left + 1;
    const pos = view.posAtCoords({ x, y: clientY }, false);
    const hit = doc.lineAt(pos);
    const range =
      hit.number >= anchorLine.number
        ? EditorSelection.range(anchorLine.from, lineEnd(hit.number))
        : EditorSelection.range(lineEnd(anchorLine.number), hit.from);
    view.dispatch({ selection: range, userEvent: "select" });
  };
  selectTo(e.clientY);
  view.focus();

  const onMove = (ev: MouseEvent) => {
    const sc = scrollerOf(view);
    if (sc) {
      const box = sc.getBoundingClientRect();
      if (ev.clientY < box.top) sc.scrollTop -= box.top - ev.clientY;
      else if (ev.clientY > box.bottom) sc.scrollTop += ev.clientY - box.bottom;
    }
    selectTo(ev.clientY);
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return true;
}

function numbersExtension(show: boolean): Extension {
  return [
    lineNumbers({
      formatNumber: show ? undefined : () => "",
      domEventHandlers: { mousedown: marginMouseDown },
    }),
    EditorView.editorAttributes.of({ class: show ? "cy-numbers" : "cy-no-numbers" }),
  ];
}

function wrapExtension(wrap: boolean): Extension {
  return wrap ? EditorView.lineWrapping : EditorView.editorAttributes.of({ class: "cy-nowrap" });
}

function spellExtension(on: boolean): Extension {
  return EditorView.contentAttributes.of({ spellcheck: on ? "true" : "false", autocorrect: "off", autocapitalize: "off" });
}

function darkExtension(dark: boolean): Extension {
  return EditorView.darkTheme.of(dark);
}

/** Texts CodeMirror itself can show or announce (screen readers, the tooltip
 * on a control character), in the app's language. */
const PHRASES: Record<string, string> = {
  "Control character": "Caractere de controle",
  "Selection deleted": "Seleção apagada",
  "current match": "ocorrência atual",
  "on line": "na linha",
  "replaced match on line $": "ocorrência substituída na linha $",
  "replaced $ matches": "$ ocorrências substituídas",
};

export function newCompartments(): EditorCompartments {
  return { numbers: new Compartment(), wrap: new Compartment(), spell: new Compartment(), dark: new Compartment() };
}

/** Effects that bring a live editor in line with new settings. */
export function configEffects(c: EditorCompartments, cfg: EditorConfig): StateEffect<unknown>[] {
  return [
    c.numbers.reconfigure(numbersExtension(cfg.lineNumbers)),
    c.wrap.reconfigure(wrapExtension(cfg.wordWrap)),
    c.spell.reconfigure(spellExtension(cfg.spellCheck)),
    c.dark.reconfigure(darkExtension(cfg.darkMode)),
  ];
}

/** Everything that makes the editor behave like VS Code on a plain-text note.
 * Rebuilt for each mount, so a state restored from memory is reconfigured with it. */
export function buildExtensions(host: EditorHost, cfg: EditorConfig, c: EditorCompartments): Extension {
  return [
    EditorState.allowMultipleSelections.of(true),
    EditorState.phrases.of(PHRASES),
    EditorView.contentAttributes.of({ "aria-label": "Texto da nota" }),
    EditorState.tabSize.of(4),
    indentUnit.of("\t"),
    historyExtension,
    // A steady cursor: 0 turns the blink off.
    drawSelection({ cursorBlinkRate: 0 }),
    dropCursor(),
    highlightActiveLineGutter(),
    highlightSelectionMatches({ highlightWordAroundCursor: false, minSelectionLength: 1 }),
    // Alt+click adds a cursor (not Ctrl+click); Shift+Alt+drag and the middle button make a column selection.
    EditorView.clickAddsSelectionRange.of((e) => e.altKey && !e.shiftKey),
    rectangularSelection({ eventFilter: (e) => e.button === 1 || (e.button === 0 && e.altKey && e.shiftKey) }),
    editorKeymap({ toggleWordWrap: host.toggleWordWrap }),
    lineClipboard,
    plainTextOnly,
    search({ top: true, createPanel: host.createFindPanel }),
    c.numbers.of(numbersExtension(cfg.lineNumbers)),
    c.wrap.of(wrapExtension(cfg.wordWrap)),
    c.spell.of(spellExtension(cfg.spellCheck)),
    c.dark.of(darkExtension(cfg.darkMode)),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) host.textChanged(u.state.doc.toString());
      if (u.docChanged || u.selectionSet) host.selectionChanged(selectionInfo(u.state));
      if (u.docChanged || u.geometryChanged || u.heightChanged || u.viewportChanged) host.layoutChanged();
    }),
  ];
}
