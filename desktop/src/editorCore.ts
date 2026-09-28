/**
 * Pure text-editing model behind the note editor's VS Code-style features
 * (multiple cursors, line operations, search, undo). Everything works on the
 * note's plain text and flat character offsets, so it's testable without a DOM.
 *
 * A state holds one or more selections; the LAST one is the primary (the one
 * the real browser caret shows - the others are painted separately).
 */

export interface Sel {
  anchor: number;
  head: number;
}

export interface EditorState {
  body: string;
  sels: Sel[];
}

export const lo = (s: Sel) => Math.min(s.anchor, s.head);
export const hi = (s: Sel) => Math.max(s.anchor, s.head);
export const isEmpty = (s: Sel) => s.anchor === s.head;
export const caret = (pos: number): Sel => ({ anchor: pos, head: pos });
export const primary = (st: EditorState) => st.sels[st.sels.length - 1];

// ---------------------------------------------------------------- helpers

export function lineStart(body: string, pos: number): number {
  return body.lastIndexOf("\n", pos - 1) + 1;
}

export function lineEnd(body: string, pos: number): number {
  const i = body.indexOf("\n", pos);
  return i === -1 ? body.length : i;
}

/** Offset where 0-based line `line` starts, clamped to the document. */
export function lineStartOffset(body: string, line: number): number {
  let pos = 0;
  for (let i = 0; i < line; i++) {
    const nl = body.indexOf("\n", pos);
    if (nl === -1) return pos;
    pos = nl + 1;
  }
  return pos;
}

export function lineCount(body: string): number {
  let n = 1;
  for (let i = 0; i < body.length; i++) if (body[i] === "\n") n++;
  return n;
}

function isWordChar(c: string): boolean {
  return /[\p{L}\p{N}_]/u.test(c);
}

type CharClass = "space" | "word" | "punct";
function charClass(c: string): CharClass {
  if (/\s/.test(c)) return "space";
  return isWordChar(c) ? "word" : "punct";
}

function wordLeft(body: string, pos: number): number {
  if (pos > 0 && body[pos - 1] === "\n") return pos - 1;
  let p = pos;
  while (p > 0 && body[p - 1] !== "\n" && charClass(body[p - 1]) === "space") p--;
  if (p > 0 && body[p - 1] !== "\n") {
    const cls = charClass(body[p - 1]);
    while (p > 0 && body[p - 1] !== "\n" && charClass(body[p - 1]) === cls) p--;
  }
  return p;
}

function wordRight(body: string, pos: number): number {
  if (pos < body.length && body[pos] === "\n") return pos + 1;
  let p = pos;
  while (p < body.length && body[p] !== "\n" && charClass(body[p]) === "space") p++;
  if (p < body.length && body[p] !== "\n") {
    const cls = charClass(body[p]);
    while (p < body.length && body[p] !== "\n" && charClass(body[p]) === cls) p++;
  }
  return p;
}

export function wordRangeAt(body: string, pos: number): Sel | null {
  let start = pos;
  let end = pos;
  while (start > 0 && isWordChar(body[start - 1])) start--;
  while (end < body.length && isWordChar(body[end])) end++;
  return start < end ? { anchor: start, head: end } : null;
}

/** Sorts, merges overlapping/coincident selections, and keeps the primary last. */
export function normalize(sels: Sel[]): Sel[] {
  const items = sels
    .map((s, i) => ({ s: { ...s }, isPrimary: i === sels.length - 1 }))
    .sort((a, b) => lo(a.s) - lo(b.s) || hi(a.s) - hi(b.s));
  const out: typeof items = [];
  for (const it of items) {
    const last = out[out.length - 1];
    const touches =
      last && (lo(it.s) < hi(last.s) || (lo(it.s) === hi(last.s) && (isEmpty(it.s) || isEmpty(last.s))));
    if (last && touches) {
      const start = Math.min(lo(last.s), lo(it.s));
      const end = Math.max(hi(last.s), hi(it.s));
      const forward = last.s.head >= last.s.anchor;
      last.s = forward ? { anchor: start, head: end } : { anchor: end, head: start };
      last.isPrimary = last.isPrimary || it.isPrimary;
    } else {
      out.push(it);
    }
  }
  const primaryIdx = out.findIndex((o) => o.isPrimary);
  const result = out.map((o) => o.s);
  if (primaryIdx !== -1) result.push(result.splice(primaryIdx, 1)[0]);
  return result;
}

export function clampState(st: EditorState): EditorState {
  const c = (n: number) => Math.max(0, Math.min(n, st.body.length));
  return { body: st.body, sels: normalize(st.sels.map((s) => ({ anchor: c(s.anchor), head: c(s.head) }))) };
}

// ------------------------------------------------------------------ edits

interface Change {
  from: number;
  to: number;
  text: string;
}

/**
 * Applies one change per selection (in document order), leaving each cursor
 * collapsed just after the text it inserted.
 */
function applyChanges(st: EditorState, make: (s: Sel, orderIndex: number) => Change): EditorState {
  const order = st.sels.map((s, i) => ({ s, i })).sort((a, b) => lo(a.s) - lo(b.s));
  let out = "";
  let cursor = 0;
  let delta = 0;
  const next: Sel[] = new Array(st.sels.length);
  order.forEach(({ s, i }, k) => {
    const ch = make(s, k);
    const from = Math.max(ch.from, cursor);
    const to = Math.max(ch.to, from);
    out += st.body.slice(cursor, from) + ch.text;
    const pos = from + delta + ch.text.length;
    delta += ch.text.length - (to - from);
    cursor = to;
    next[i] = caret(pos);
  });
  out += st.body.slice(cursor);
  return { body: out, sels: normalize(next) };
}

/** Types `text` at every cursor; an array gives each cursor (in document order) its own text. */
export function insertText(st: EditorState, text: string | string[]): EditorState {
  return applyChanges(st, (s, k) => ({
    from: lo(s),
    to: hi(s),
    text: Array.isArray(text) ? text[k] ?? "" : text,
  }));
}

export function deleteBackward(st: EditorState, word = false): EditorState {
  return applyChanges(st, (s) => {
    if (!isEmpty(s)) return { from: lo(s), to: hi(s), text: "" };
    const from = word ? wordLeft(st.body, s.head) : Math.max(0, s.head - 1);
    return { from, to: s.head, text: "" };
  });
}

export function deleteForward(st: EditorState, word = false): EditorState {
  return applyChanges(st, (s) => {
    if (!isEmpty(s)) return { from: lo(s), to: hi(s), text: "" };
    const to = word ? wordRight(st.body, s.head) : Math.min(st.body.length, s.head + 1);
    return { from: s.head, to, text: "" };
  });
}

export function deleteSelections(st: EditorState): EditorState {
  return applyChanges(st, (s) => ({ from: lo(s), to: hi(s), text: "" }));
}

/** Replaces the given (non-overlapping) ranges; the cursor lands after the last one. */
export function replaceRanges(st: EditorState, ranges: Sel[], text: string): EditorState {
  if (ranges.length === 0) return st;
  const res = insertText({ body: st.body, sels: ranges }, text);
  return { body: res.body, sels: [res.sels[res.sels.length - 1]] };
}

// ------------------------------------------------------------------ moves

export type Motion = "left" | "right" | "up" | "down" | "home" | "end" | "wordLeft" | "wordRight" | "docStart" | "docEnd";

function moveHead(body: string, s: Sel, motion: Motion, extend: boolean): number {
  const h = s.head;
  switch (motion) {
    case "left":
      return !extend && !isEmpty(s) ? lo(s) : Math.max(0, h - 1);
    case "right":
      return !extend && !isEmpty(s) ? hi(s) : Math.min(body.length, h + 1);
    case "wordLeft":
      return wordLeft(body, h);
    case "wordRight":
      return wordRight(body, h);
    case "home":
      return lineStart(body, h);
    case "end":
      return lineEnd(body, h);
    case "docStart":
      return 0;
    case "docEnd":
      return body.length;
    case "up": {
      const ls = lineStart(body, h);
      if (ls === 0) return 0;
      const col = h - ls;
      const prevStart = lineStart(body, ls - 1);
      return Math.min(prevStart + col, ls - 1);
    }
    case "down": {
      const le = lineEnd(body, h);
      if (le === body.length) return body.length;
      const col = h - lineStart(body, h);
      return Math.min(le + 1 + col, lineEnd(body, le + 1));
    }
  }
}

export function move(st: EditorState, motion: Motion, extend: boolean): EditorState {
  return {
    body: st.body,
    sels: normalize(
      st.sels.map((s) => {
        const head = moveHead(st.body, s, motion, extend);
        return extend ? { anchor: s.anchor, head } : caret(head);
      })
    ),
  };
}

// --------------------------------------------------------- multi-cursor

export function addCursor(st: EditorState, pos: number): EditorState {
  return { body: st.body, sels: normalize([...st.sels, caret(pos)]) };
}

/** Ctrl+D: select the word under the cursor, then add the next occurrence on each press after. */
export function addNextOccurrence(st: EditorState): EditorState {
  const p = primary(st);
  if (isEmpty(p)) {
    const expanded = st.sels.map((s) => (isEmpty(s) ? wordRangeAt(st.body, s.head) ?? s : s));
    return { body: st.body, sels: normalize(expanded) };
  }
  const query = st.body.slice(lo(p), hi(p));
  const taken = new Set(st.sels.map(lo));
  const search = (from: number, until: number) => {
    let i = st.body.indexOf(query, from);
    while (i !== -1 && i < until) {
      if (!taken.has(i)) return i;
      i = st.body.indexOf(query, i + 1);
    }
    return -1;
  };
  let found = search(hi(p), st.body.length);
  if (found === -1) found = search(0, hi(p));
  if (found === -1) return st;
  return { body: st.body, sels: normalize([...st.sels, { anchor: found, head: found + query.length }]) };
}

/** Ctrl+Shift+L: every occurrence of the primary selection (or the word under it). */
export function selectAllOccurrences(st: EditorState): EditorState {
  let p = primary(st);
  if (isEmpty(p)) p = wordRangeAt(st.body, p.head) ?? p;
  if (isEmpty(p)) return st;
  const query = st.body.slice(lo(p), hi(p));
  const sels: Sel[] = [];
  let i = st.body.indexOf(query);
  while (i !== -1) {
    sels.push({ anchor: i, head: i + query.length });
    i = st.body.indexOf(query, i + query.length);
  }
  const primaryIdx = sels.findIndex((s) => s.anchor === lo(p));
  if (primaryIdx !== -1) sels.push(sels.splice(primaryIdx, 1)[0]);
  return { body: st.body, sels };
}

/** Ctrl+Alt+Up/Down: a new cursor on the line above the topmost / below the bottommost. */
export function addCursorVertical(st: EditorState, dir: "up" | "down"): EditorState {
  const heads = st.sels.map((s) => s.head);
  const from = dir === "up" ? Math.min(...heads) : Math.max(...heads);
  const target = moveHead(st.body, caret(from), dir, false);
  if (lineStart(st.body, target) === lineStart(st.body, from)) return st;
  return addCursor(st, target);
}

// ---------------------------------------------------------- line editing

interface LinePos {
  line: number;
  col: number;
}

function toLinePos(body: string, pos: number): LinePos {
  const before = body.slice(0, pos);
  const line = (before.match(/\n/g) ?? []).length;
  return { line, col: pos - (before.lastIndexOf("\n") + 1) };
}

function fromLinePos(lines: string[], p: LinePos): number {
  let pos = 0;
  for (let i = 0; i < p.line; i++) pos += lines[i].length + 1;
  return pos + Math.min(p.col, lines[p.line]?.length ?? 0);
}

interface Block {
  start: number;
  end: number;
}

/** The whole lines each selection touches, merged where they meet. */
function lineBlocks(body: string, sels: Sel[]): Block[] {
  const blocks = sels
    .map((s) => {
      const a = toLinePos(body, lo(s));
      const b = toLinePos(body, hi(s));
      const end = !isEmpty(s) && b.col === 0 && b.line > a.line ? b.line - 1 : b.line;
      return { start: a.line, end };
    })
    .sort((x, y) => x.start - y.start);
  const merged: Block[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end + 1) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }
  return merged;
}

type Cursor = { a: LinePos; h: LinePos };

function withLines(
  st: EditorState,
  op: (lines: string[], cursors: Cursor[], blocks: Block[]) => boolean | void
): EditorState {
  const lines = st.body.split("\n");
  const cursors: Cursor[] = st.sels.map((s) => ({ a: toLinePos(st.body, s.anchor), h: toLinePos(st.body, s.head) }));
  const blocks = lineBlocks(st.body, st.sels);
  if (op(lines, cursors, blocks) === false) return st;
  if (lines.length === 0) lines.push("");
  return {
    body: lines.join("\n"),
    sels: normalize(cursors.map((c) => ({ anchor: fromLinePos(lines, c.a), head: fromLinePos(lines, c.h) }))),
  };
}

const eachPos = (cursors: Cursor[], fn: (p: LinePos) => void) =>
  cursors.forEach((c) => {
    fn(c.a);
    fn(c.h);
  });

/** Alt+Up/Down. */
export function moveLines(st: EditorState, dir: "up" | "down"): EditorState {
  return withLines(st, (lines, cursors, blocks) => {
    if (dir === "up" ? blocks[0].start === 0 : blocks[blocks.length - 1].end === lines.length - 1) return false;
    const ordered = dir === "up" ? blocks : [...blocks].reverse();
    for (const b of ordered) {
      if (dir === "up") {
        const [moved] = lines.splice(b.start - 1, 1);
        lines.splice(b.end, 0, moved);
        eachPos(cursors, (p) => {
          if (p.line >= b.start && p.line <= b.end) p.line--;
        });
      } else {
        const [moved] = lines.splice(b.end + 1, 1);
        lines.splice(b.start, 0, moved);
        eachPos(cursors, (p) => {
          if (p.line >= b.start && p.line <= b.end) p.line++;
        });
      }
    }
  });
}

/** Shift+Alt+Up/Down: the cursors end up on the copy in the direction pressed. */
export function duplicateLines(st: EditorState, dir: "up" | "down"): EditorState {
  return withLines(st, (lines, cursors, blocks) => {
    for (const b of [...blocks].reverse()) {
      const len = b.end - b.start + 1;
      lines.splice(b.end + 1, 0, ...lines.slice(b.start, b.end + 1));
      eachPos(cursors, (p) => {
        if (p.line > b.end || (dir === "down" && p.line >= b.start)) p.line += len;
      });
    }
  });
}

/** Ctrl+Shift+K (also what Ctrl+X does with nothing selected). */
export function deleteLines(st: EditorState): EditorState {
  return withLines(st, (lines, cursors, blocks) => {
    for (const b of [...blocks].reverse()) {
      const len = b.end - b.start + 1;
      lines.splice(b.start, len);
      const remaining = Math.max(lines.length, 1);
      cursors.forEach((c) => {
        const inBlock = c.h.line >= b.start && c.h.line <= b.end;
        if (inBlock) {
          const line = Math.min(b.start, remaining - 1);
          c.a = { line, col: c.h.col };
          c.h = { line, col: c.h.col };
        } else if (c.h.line > b.end) {
          c.a.line -= len;
          c.h.line -= len;
        }
      });
    }
  });
}

/** Ctrl+Enter / Ctrl+Shift+Enter: open an empty line below/above each cursor's line. */
export function insertLine(st: EditorState, where: "below" | "above"): EditorState {
  return withLines(st, (lines, cursors) => {
    const targetLines = [...new Set(cursors.map((c) => c.h.line))].sort((x, y) => y - x);
    for (const line of targetLines) {
      const at = where === "below" ? line + 1 : line;
      lines.splice(at, 0, "");
      cursors.forEach((c) => {
        if (c.h.line === line) {
          c.a = { line: at, col: 0 };
          c.h = { line: at, col: 0 };
        } else if (c.h.line >= at) {
          c.a.line++;
          c.h.line++;
        }
      });
    }
  });
}

/** Ctrl+L: select whole lines; pressing again extends by one more line. */
export function selectLine(st: EditorState): EditorState {
  const { body } = st;
  return {
    body,
    sels: normalize(
      st.sels.map((s) => {
        const start = lineStart(body, lo(s));
        const alreadyWhole = !isEmpty(s) && lo(s) === start && lineStart(body, hi(s)) === hi(s);
        const endFrom = alreadyWhole ? hi(s) : lineEnd(body, hi(s));
        const end = alreadyWhole ? lineEnd(body, endFrom) : endFrom;
        return { anchor: start, head: Math.min(body.length, end + 1) };
      })
    ),
  };
}

/** What Ctrl+C/Ctrl+X take: every selection joined by newlines, or the whole
 * current line (with its line break) when nothing is selected. */
export function copyText(st: EditorState): string {
  const sels = [...st.sels].sort((a, b) => lo(a) - lo(b));
  if (sels.every(isEmpty)) {
    return lineBlocks(st.body, sels)
      .map((b) => st.body.split("\n").slice(b.start, b.end + 1).join("\n") + "\n")
      .join("");
  }
  return sels
    .filter((s) => !isEmpty(s))
    .map((s) => st.body.slice(lo(s), hi(s)))
    .join("\n");
}

// ----------------------------------------------------------------- search

export function findAll(body: string, query: string, caseSensitive: boolean): Sel[] {
  if (!query) return [];
  const hay = caseSensitive ? body : body.toLocaleLowerCase();
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  const out: Sel[] = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push({ anchor: i, head: i + needle.length });
    i = hay.indexOf(needle, i + needle.length);
  }
  return out;
}

// ------------------------------------------------------------------- undo

type EditKind = "type" | "space" | "delete" | "edit" | "external";

const GROUP_MS = 1000;
const MAX_STEPS = 500;

/** Undo/redo stack of whole states. Consecutive typing (or deleting) within
 * a second collapses into one step, like VS Code's word-sized undo. */
export class History {
  private undoStack: EditorState[] = [];
  private redoStack: EditorState[] = [];
  private lastKind: EditKind | null = null;
  private lastAt = 0;

  /** Call with the state as it was *before* an edit. */
  record(before: EditorState, kind: EditKind, now = Date.now()) {
    const coalesce =
      (kind === "type" || kind === "delete") && kind === this.lastKind && now - this.lastAt < GROUP_MS;
    if (!coalesce) {
      this.undoStack.push(before);
      if (this.undoStack.length > MAX_STEPS) this.undoStack.shift();
    }
    this.redoStack = [];
    this.lastKind = kind;
    this.lastAt = now;
  }

  /** Moving the caret or clicking ends the current typing group. */
  breakGroup() {
    this.lastKind = null;
  }

  undo(current: EditorState): EditorState | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(current);
    this.lastKind = null;
    return prev;
  }

  redo(current: EditorState): EditorState | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(current);
    this.lastKind = null;
    return next;
  }
}
