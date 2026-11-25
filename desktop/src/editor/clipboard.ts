import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { copyLineText, cutLineChanges, cursorLines } from "./helpers";

/*
 * Ctrl+C / Ctrl+X with nothing selected take the whole line, break included,
 * and pasting that text again puts it on a line of its own above the caret's
 * line - VS Code's way. Everything else (selected text, rich clipboards,
 * N cursors with N lines) is left to CodeMirror, which only ever reads the
 * plain text of the clipboard.
 */

/** The last text a line copy put on the clipboard, so a paste of exactly that
 * text knows it is a whole line and not text to split the caret's line with. */
let lastLineCopy: string | null = null;

export function pasteLinesPlan(text: string, cursorCount: number): string[] | null {
  if (lastLineCopy === null || text !== lastLineCopy) return null;
  const lines = text.replace(/\n$/, "").split("\n");
  return cursorCount > 1 && lines.length === cursorCount ? lines.map((l) => l + "\n") : null;
}

export const lineClipboard: Extension = EditorView.domEventHandlers({
  copy(event, view) {
    const text = copyLineText(view.state);
    if (text === null || !event.clipboardData) return false;
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
    lastLineCopy = text;
    return true;
  },
  cut(event, view) {
    const text = copyLineText(view.state);
    if (text === null || !event.clipboardData || view.state.readOnly) return false;
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
    lastLineCopy = text;
    view.dispatch({ changes: cutLineChanges(view.state), scrollIntoView: true, userEvent: "delete.cut" });
    return true;
  },
  paste(event, view) {
    const raw = event.clipboardData?.getData("text/plain");
    if (!raw || view.state.readOnly) return false;
    const text = raw.replace(/\r\n?/g, "\n");
    if (lastLineCopy === null || text !== lastLineCopy) return false;
    if (!view.state.selection.ranges.every((r) => r.empty)) return false;
    // A whole copied line goes at the start of the caret's line, caret stays put in its text.
    event.preventDefault();
    const lines = cursorLines(view.state);
    const perCursor = pasteLinesPlan(text, lines.length);
    const changes = lines.map((line, i) => ({ from: line.from, insert: perCursor ? perCursor[i] : text }));
    const cs = view.state.changes(changes);
    const sel = EditorSelection.create(
      view.state.selection.ranges.map((r) => EditorSelection.cursor(cs.mapPos(r.head, 1))),
      view.state.selection.mainIndex
    );
    view.dispatch({ changes: cs, selection: sel, scrollIntoView: true, userEvent: "input.paste" });
    return true;
  },
});
