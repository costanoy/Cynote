import {
  copyLineDown,
  copyLineUp,
  defaultKeymap,
  deleteLine,
  history,
  historyKeymap,
  moveLineDown,
  moveLineUp,
  redo,
  simplifySelection,
  undo,
} from "@codemirror/commands";
import { selectNextOccurrence, selectSelectionMatches } from "@codemirror/search";
import { EditorSelection, Prec, type Extension, type StateCommand } from "@codemirror/state";
import { EditorView, keymap, type Command, type KeyBinding } from "@codemirror/view";
import {
  indentTransaction,
  insertLineTransaction,
  newlineTransaction,
  outdentTransaction,
  selectLineSelection,
  smartHomeTarget,
  spansLines,
} from "./helpers";

/** Tab: a real tab character at each cursor - or, when a selection covers
 * more than one line, indents every line it touches. */
export const tabCommand: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.some((r) => spansLines(state, r))) {
    const tr = indentTransaction(state);
    if (tr) dispatch(state.update(tr));
    return true;
  }
  dispatch(state.update(state.replaceSelection("\t"), { scrollIntoView: true, userEvent: "input" }));
  return true;
};

export const indentCommand: StateCommand = ({ state, dispatch }) => {
  const tr = indentTransaction(state);
  if (tr) dispatch(state.update(tr));
  return true;
};

export const outdentCommand: StateCommand = ({ state, dispatch }) => {
  const tr = outdentTransaction(state);
  if (tr) dispatch(state.update(tr));
  return true;
};

export const enterCommand: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  dispatch(state.update(newlineTransaction(state)));
  return true;
};

const insertLineBelow: StateCommand = ({ state, dispatch }) => {
  dispatch(state.update(insertLineTransaction(state, "below")));
  return true;
};
const insertLineAbove: StateCommand = ({ state, dispatch }) => {
  dispatch(state.update(insertLineTransaction(state, "above")));
  return true;
};

const selectLineCommand: StateCommand = ({ state, dispatch }) => {
  dispatch(state.update({ selection: selectLineSelection(state), scrollIntoView: true, userEvent: "select" }));
  return true;
};

/** Home: the start of the visual row first when the line is wrapped, then the
 * first non-blank character, then column 1. */
function home(extend: boolean): Command {
  return (view) => {
    const { state } = view;
    const sel = EditorSelection.create(
      state.selection.ranges.map((range) => {
        const line = state.doc.lineAt(range.head);
        const row = view.moveToLineBoundary(EditorSelection.cursor(range.head), false).head;
        const target =
          row > line.from && row < range.head ? row : smartHomeTarget(line.text, line.from, range.head);
        return EditorSelection.range(extend ? range.anchor : target, target);
      }),
      state.selection.mainIndex
    );
    view.dispatch({ selection: sel, scrollIntoView: true, userEvent: "select" });
    return true;
  };
}

/** Ctrl+Alt+Up / Down: another cursor on the row above the top one, or below the bottom one. */
function addCursor(forward: boolean): Command {
  return (view) => {
    const ranges = view.state.selection.ranges;
    const edge = ranges.reduce((a, b) => (forward ? (b.head > a.head ? b : a) : b.head < a.head ? b : a));
    const moved = view.moveVertically(edge, forward);
    if (moved.head === edge.head) return true;
    view.dispatch({
      selection: EditorSelection.create([...ranges, EditorSelection.cursor(moved.head, moved.assoc, undefined, moved.goalColumn)], ranges.length),
      scrollIntoView: true,
      userEvent: "select",
    });
    return true;
  };
}

const swallow: Command = () => true;

export interface KeymapHooks {
  toggleWordWrap: () => void;
}

/** VS Code's keyboard, on CodeMirror's commands. Notes are plain text, so
 * Ctrl+B / I / U are swallowed rather than left to the browser. */
export function editorKeymap(hooks: KeymapHooks): Extension {
  const own: KeyBinding[] = [
    { key: "Mod-b", run: swallow, preventDefault: true },
    { key: "Mod-i", run: swallow, preventDefault: true },
    { key: "Mod-u", run: swallow, preventDefault: true },
    {
      key: "Alt-z",
      run: () => {
        hooks.toggleWordWrap();
        return true;
      },
      preventDefault: true,
    },
    { key: "Enter", run: enterCommand },
    { key: "Tab", run: tabCommand, shift: outdentCommand, preventDefault: true },
    { key: "Mod-]", run: indentCommand, preventDefault: true },
    { key: "Mod-[", run: outdentCommand, preventDefault: true },
    { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
    { key: "Mod-Shift-l", run: selectSelectionMatches, preventDefault: true },
    { key: "Mod-l", run: selectLineCommand, preventDefault: true },
    { key: "Mod-Enter", run: insertLineBelow, preventDefault: true },
    { key: "Mod-Shift-Enter", run: insertLineAbove, preventDefault: true },
    { key: "Shift-Mod-k", run: deleteLine, preventDefault: true },
    { key: "Alt-ArrowUp", run: moveLineUp, preventDefault: true },
    { key: "Alt-ArrowDown", run: moveLineDown, preventDefault: true },
    { key: "Shift-Alt-ArrowUp", run: copyLineUp, preventDefault: true },
    { key: "Shift-Alt-ArrowDown", run: copyLineDown, preventDefault: true },
    { key: "Mod-Alt-ArrowUp", run: addCursor(false), preventDefault: true },
    { key: "Mod-Alt-ArrowDown", run: addCursor(true), preventDefault: true },
    { key: "Home", run: home(false), shift: home(true), preventDefault: true },
    { key: "Escape", run: simplifySelection },
    { key: "Mod-z", run: undo, preventDefault: true },
    { key: "Mod-y", run: redo, preventDefault: true },
    { key: "Mod-Shift-z", run: redo, preventDefault: true },
  ];
  return [Prec.high(keymap.of(own)), keymap.of([...historyKeymap, ...defaultKeymap])];
}

export const historyExtension = history();

/** Notes are plain text: nothing the browser's own formatting shortcuts or
 * context menu could produce may reach the document. */
export const plainTextOnly: Extension = EditorView.domEventHandlers({
  beforeinput(event) {
    if (event.inputType.startsWith("format")) {
      event.preventDefault();
      return true;
    }
    return false;
  },
});
