import { EditorSelection, type ChangeSpec, type EditorState, type Line, type SelectionRange, type TransactionSpec } from "@codemirror/state";

/*
 * Pure editing helpers on top of CodeMirror's state: they take an
 * EditorState and return text, changes or selections, and never touch the DOM,
 * so they can be tested without a browser. The commands in commands.ts wire
 * them to keys.
 */

/** The text Ctrl+C puts on the clipboard when nothing is selected: each line
 * the cursors sit on (once), with its line break - or null when any
 * selection has text, which then copies as usual. */
export function copyLineText(state: EditorState): string | null {
  if (!state.selection.ranges.every((r) => r.empty)) return null;
  return cursorLines(state)
    .map((l) => l.text + "\n")
    .join("");
}

/** The lines that hold a cursor, each once, top to bottom. */
export function cursorLines(state: EditorState): Line[] {
  const lines: Line[] = [];
  let last = -1;
  for (const r of state.selection.ranges) {
    const line = state.doc.lineAt(r.head);
    if (line.number > last) {
      lines.push(line);
      last = line.number;
    }
  }
  return lines;
}

/** What Ctrl+X removes when nothing is selected: the whole line, break
 * included (the last line takes the break before it instead). */
export function cutLineChanges(state: EditorState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const line of cursorLines(state)) {
    if (line.to < state.doc.length) out.push({ from: line.from, to: line.to + 1 });
    else out.push({ from: Math.max(0, line.from - 1), to: line.to });
  }
  return out;
}

/** The lines a set of selections touches, top to bottom. A selection that
 * ends right at the start of a line does not touch that line. */
export function touchedLines(state: EditorState): Line[] {
  const lines: Line[] = [];
  let upto = -1;
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from);
    let last = state.doc.lineAt(r.to);
    if (!r.empty && r.to === last.from && last.number > first.number) last = state.doc.line(last.number - 1);
    for (let n = Math.max(first.number, upto + 1); n <= last.number; n++) lines.push(state.doc.line(n));
    upto = Math.max(upto, last.number);
  }
  return lines;
}

/** Whether a selection reaches over a line break (Tab then indents). */
export function spansLines(state: EditorState, r: SelectionRange): boolean {
  return !r.empty && state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number;
}

/** A tab at the start of every touched line (blank ones too only when they
 * are the single line touched). */
export function indentSpecs(state: EditorState): ChangeSpec[] {
  const lines = touchedLines(state);
  return lines.filter((l) => l.length > 0 || lines.length === 1).map((l) => ({ from: l.from, insert: "\t" }));
}

/** One level of indentation off every touched line: a tab, or up to four spaces. */
export function outdentSpecs(state: EditorState): ChangeSpec[] {
  const specs: ChangeSpec[] = [];
  for (const l of touchedLines(state)) {
    const n = l.text.startsWith("\t") ? 1 : (/^ {1,4}/.exec(l.text)?.[0].length ?? 0);
    if (n > 0) specs.push({ from: l.from, to: l.from + n });
  }
  return specs;
}

/** An indent transaction that keeps whole-line selections whole: a selection
 * starting at column 0 keeps starting there. */
export function indentTransaction(state: EditorState): TransactionSpec | null {
  const specs = indentSpecs(state);
  if (specs.length === 0) return null;
  const changes = state.changes(specs);
  const startOfLine = (pos: number) => state.doc.lineAt(pos).from === pos;
  const ranges = state.selection.ranges.map((r) => {
    if (r.empty) return EditorSelection.cursor(changes.mapPos(r.head, 1));
    const anchorFirst = r.anchor < r.head;
    const fromPos = changes.mapPos(r.from, startOfLine(r.from) ? -1 : 1);
    const toPos = changes.mapPos(r.to, -1);
    return anchorFirst ? EditorSelection.range(fromPos, toPos) : EditorSelection.range(toPos, fromPos);
  });
  return { changes, selection: EditorSelection.create(ranges, state.selection.mainIndex), scrollIntoView: true, userEvent: "input.indent" };
}

export function outdentTransaction(state: EditorState): TransactionSpec | null {
  const specs = outdentSpecs(state);
  if (specs.length === 0) return null;
  return { changes: state.changes(specs), scrollIntoView: true, userEvent: "delete.dedent" };
}

/** Home's target in a line: the first non-blank character, or column 1 when
 * the caret is already on it. */
export function smartHomeTarget(lineText: string, lineFrom: number, pos: number): number {
  const indentEnd = lineFrom + (/^[ \t]*/.exec(lineText)?.[0].length ?? 0);
  if (indentEnd === lineFrom) return lineFrom;
  return pos === indentEnd ? lineFrom : indentEnd;
}

/** Ctrl+L: select whole lines, break included. Pressing it again extends by
 * one more line, because a selection of whole lines ends at the start of the
 * next one - and that line is the one that gets added. */
export function selectLineSelection(state: EditorState): EditorSelection {
  const len = state.doc.length;
  const ranges = state.selection.ranges.map((r) =>
    EditorSelection.range(state.doc.lineAt(r.from).from, Math.min(len, state.doc.lineAt(r.to).to + 1))
  );
  return EditorSelection.create(ranges, state.selection.mainIndex);
}

/** The whitespace a new line below `line` starts with, as VS Code keeps it:
 * the indentation of the line it was opened from (up to the caret, if given). */
export function indentOf(text: string, upTo = Infinity): string {
  return (/^[ \t]*/.exec(text)?.[0] ?? "").slice(0, upTo);
}

/** Enter: a line break plus the current line's indentation, at every cursor. */
export function newlineTransaction(state: EditorState): TransactionSpec {
  const spec = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const insert = "\n" + indentOf(line.text, range.from - line.from);
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    };
  });
  return { ...spec, scrollIntoView: true, userEvent: "input" };
}

/** Ctrl+Enter / Ctrl+Shift+Enter: an empty line below / above each cursor's
 * line (once per line), with the cursor on it. */
export function insertLineTransaction(state: EditorState, where: "below" | "above"): TransactionSpec {
  const specs: ChangeSpec[] = [];
  const marks: { pos: number; indent: string }[] = [];
  for (const line of cursorLines(state)) {
    const indent = indentOf(line.text);
    if (where === "below") specs.push({ from: line.to, insert: "\n" + indent });
    else specs.push({ from: line.from, insert: indent + "\n" });
    marks.push({ pos: where === "below" ? line.to : line.from, indent });
  }
  const changes = state.changes(specs);
  const cursors = marks.map((m) =>
    EditorSelection.cursor(where === "below" ? changes.mapPos(m.pos, 1) : changes.mapPos(m.pos, -1) + m.indent.length)
  );
  return { changes, selection: EditorSelection.create(cursors, cursors.length - 1), scrollIntoView: true, userEvent: "input" };
}

/** The smallest single replacement that turns `before` into `after`: what an
 * outside edit (sync) applies, so the cursor and undo history stay put. */
export function minimalChange(before: string, after: string): { from: number; to: number; insert: string } | null {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {
    endBefore--;
    endAfter--;
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}
