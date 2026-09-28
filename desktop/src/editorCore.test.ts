import { describe, expect, it } from "vitest";
import * as ed from "./editorCore";
import type { EditorState, Sel } from "./editorCore";

const c = ed.caret;
const sel = (anchor: number, head: number): Sel => ({ anchor, head });
const st = (body: string, ...sels: Sel[]): EditorState => ({ body, sels });

/** Renders a state with | for carets and [ ] around selections, primary marked with *. */
function show(s: EditorState): string {
  const marks: { at: number; text: string }[] = [];
  s.sels.forEach((x, i) => {
    const star = i === s.sels.length - 1 ? "*" : "";
    if (ed.isEmpty(x)) marks.push({ at: x.head, text: "|" + star });
    else {
      marks.push({ at: ed.lo(x), text: "[" });
      marks.push({ at: ed.hi(x), text: "]" + star });
    }
  });
  marks.sort((a, b) => b.at - a.at);
  let out = s.body;
  for (const m of marks) out = out.slice(0, m.at) + m.text + out.slice(m.at);
  return out;
}

describe("multi-cursor editing", () => {
  it("Ctrl+D selects the word under the caret first, then adds the next occurrence each press", () => {
    let s = st("foo bar foo baz foo", c(1));
    s = ed.addNextOccurrence(s);
    expect(show(s)).toBe("[foo]* bar foo baz foo");
    s = ed.addNextOccurrence(s);
    expect(show(s)).toBe("[foo] bar [foo]* baz foo");
    s = ed.addNextOccurrence(s);
    expect(show(s)).toBe("[foo] bar [foo] baz [foo]*");
    expect(ed.addNextOccurrence(s)).toBe(s); // nothing left
  });

  it("Ctrl+D wraps around to occurrences before the first one", () => {
    let s = st("foo bar foo", sel(8, 11));
    s = ed.addNextOccurrence(s);
    expect(show(s)).toBe("[foo]* bar [foo]");
  });

  it("typing replaces every selection", () => {
    const s = ed.insertText(st("foo bar foo", sel(0, 3), sel(8, 11)), "X");
    expect(show(s)).toBe("X| bar X|*");
  });

  it("arrow keys keep every cursor, collapsing selections to the side pressed", () => {
    let s = st("foo bar foo", sel(0, 3), sel(8, 11));
    s = ed.move(s, "right", false);
    expect(show(s)).toBe("foo| bar foo|*");
    s = ed.move(s, "left", false);
    expect(show(s)).toBe("fo|o bar fo|*o");
    s = ed.move(s, "left", true);
    expect(show(s)).toBe("f[o]o bar f[o]*o");
  });

  it("Home/End and word jumps move each cursor on its own line", () => {
    let s = st("abc def\nxy zw", c(5), c(11));
    s = ed.move(s, "home", false);
    expect(show(s)).toBe("|abc def\n|*xy zw");
    s = ed.move(s, "wordRight", false);
    expect(show(s)).toBe("abc| def\nxy|* zw");
    s = ed.move(s, "end", true);
    expect(show(s)).toBe("abc[ def]\nxy[ zw]*");
  });

  it("up/down keep the column, clamped to shorter lines", () => {
    let s = st("abcdef\nab\nabcdef", c(5));
    s = ed.move(s, "down", false);
    expect(show(s)).toBe("abcdef\nab|*\nabcdef");
    s = ed.move(s, "down", false);
    expect(show(s)).toBe("abcdef\nab\nab|*cdef");
    expect(show(ed.move(st("ab", c(1)), "up", false))).toBe("|*ab");
  });

  it("cursors that meet merge into one", () => {
    const s = ed.move(st("abc", c(0), c(1)), "left", false);
    expect(s.sels).toHaveLength(1);
    expect(show(s)).toBe("|*abc");
  });

  it("backspace and delete act at every cursor", () => {
    expect(show(ed.deleteBackward(st("ab ab", c(2), c(5))))).toBe("a| a|*");
    expect(show(ed.deleteForward(st("ab ab", c(0), c(3))))).toBe("|b |*b");
    expect(show(ed.deleteBackward(st("foo bar", c(7)), true))).toBe("foo |*");
  });

  it("paste can give each cursor its own line", () => {
    const s = ed.insertText(st("a\nb\nc", c(1), c(3), c(5)), ["1", "2", "3"]);
    expect(s.body).toBe("a1\nb2\nc3");
  });

  it("Ctrl+Shift+L selects every occurrence", () => {
    const s = ed.selectAllOccurrences(st("x a x b x", c(2)));
    expect(show(s)).toBe("x [a]* x b x");
    const t = ed.selectAllOccurrences(st("x a x b x", sel(0, 1)));
    expect(t.sels).toHaveLength(3);
  });

  it("Ctrl+Alt+Down adds a cursor on the next line at the same column", () => {
    let s = st("abcd\nabcd\nab", c(3));
    s = ed.addCursorVertical(s, "down");
    expect(show(s)).toBe("abc|d\nabc|*d\nab");
    s = ed.addCursorVertical(s, "down");
    expect(show(s)).toBe("abc|d\nabc|d\nab|*");
    expect(ed.addCursorVertical(s, "down")).toBe(s);
  });
});

describe("line operations", () => {
  it("Alt+Up/Down moves the current line and the caret with it", () => {
    let s = st("one\ntwo\nthree", c(5));
    s = ed.moveLines(s, "up");
    expect(show(s)).toBe("t|*wo\none\nthree");
    s = ed.moveLines(s, "down");
    s = ed.moveLines(s, "down");
    expect(show(s)).toBe("one\nthree\nt|*wo");
    expect(ed.moveLines(s, "down")).toBe(s);
  });

  it("moves every selected line together", () => {
    const s = ed.moveLines(st("a\nb\nc\nd", sel(2, 5)), "down");
    expect(s.body).toBe("a\nd\nb\nc");
  });

  it("Shift+Alt+Down duplicates the line and moves onto the copy", () => {
    expect(show(ed.duplicateLines(st("ab\ncd", c(1)), "down"))).toBe("ab\na|*b\ncd");
    expect(show(ed.duplicateLines(st("ab\ncd", c(1)), "up"))).toBe("a|*b\nab\ncd");
  });

  it("Ctrl+Shift+K deletes the line", () => {
    expect(show(ed.deleteLines(st("one\ntwo\nthree", c(5))))).toBe("one\nt|*hree");
    expect(show(ed.deleteLines(st("only", c(2))))).toBe("|*");
    expect(show(ed.deleteLines(st("a\nb", c(2))))).toBe("|*a");
  });

  it("Ctrl+Enter / Ctrl+Shift+Enter open a line below / above", () => {
    expect(show(ed.insertLine(st("ab\ncd", c(1)), "below"))).toBe("ab\n|*\ncd");
    expect(show(ed.insertLine(st("ab\ncd", c(4)), "above"))).toBe("ab\n|*\ncd");
  });

  it("Tab types a tab character at every cursor", () => {
    expect(show(ed.tab(st("ab cd", c(1), c(4))))).toBe("a\t|b c\t|*d");
    expect(show(ed.tab(st("abcd", sel(1, 3))))).toBe("a\t|*d");
  });

  it("Tab with a multi-line selection indents those lines, keeping them selected", () => {
    expect(show(ed.tab(st("ab\ncd\nef", sel(0, 5))))).toBe("[\tab\n\tcd]*\nef");
  });

  it("Shift+Tab removes one level of indentation", () => {
    expect(show(ed.outdent(st("\tab\n    cd\nef", sel(0, 10))))).toBe("[ab\ncd]*\nef");
    expect(show(ed.outdent(st("\t\tab", c(3))))).toBe("\ta|*b");
    const plain = st("ab", c(1));
    expect(ed.outdent(plain)).toBe(plain);
  });

  it("Ctrl+L selects the line, and extends on repeat", () => {
    let s = st("ab\ncd\nef", c(4));
    s = ed.selectLine(s);
    expect(show(s)).toBe("ab\n[cd\n]*ef");
    s = ed.selectLine(s);
    expect(show(s)).toBe("ab\n[cd\nef]*");
  });

  it("copy with nothing selected takes the whole line", () => {
    expect(ed.copyText(st("ab\ncd", c(4)))).toBe("cd\n");
    expect(ed.copyText(st("ab cd", sel(0, 2), sel(3, 5)))).toBe("ab\ncd");
  });
});

describe("search", () => {
  it("finds non-overlapping matches, optionally ignoring case", () => {
    expect(ed.findAll("Aa aa AA", "aa", true)).toEqual([sel(3, 5)]);
    expect(ed.findAll("Aa aa AA", "aa", false)).toHaveLength(3);
    expect(ed.findAll("aaaa", "aa", true)).toHaveLength(2);
  });

  it("replace-all leaves one caret after the last replacement", () => {
    const s = st("a-b-c", c(0));
    const r = ed.replaceRanges(s, ed.findAll(s.body, "-", true), "+");
    expect(show(r)).toBe("a+b+|*c");
  });
});

describe("History", () => {
  it("groups fast typing into one undo step and restores the exact previous state", () => {
    const h = new ed.History();
    const s0 = st("", c(0));
    h.record(s0, "type", 0);
    h.record(st("a", c(1)), "type", 100);
    h.record(st("ab", c(2)), "type", 200);
    expect(h.undo(st("abc", c(3)))).toEqual(s0);
    expect(h.undo(s0)).toBeNull();
    expect(h.redo(s0)).toEqual(st("abc", c(3)));
  });

  it("starts a new step after a pause, a caret move, or a different kind of edit", () => {
    const h = new ed.History();
    h.record(st("", c(0)), "type", 0);
    h.record(st("a", c(1)), "type", 2000);
    h.breakGroup();
    h.record(st("ab", c(2)), "type", 2100);
    h.record(st("abc", c(3)), "delete", 2200);
    expect(h.undo(st("ab", c(2)))!.body).toBe("abc");
    expect(h.undo(st("abc", c(3)))!.body).toBe("ab");
    expect(h.undo(st("ab", c(2)))!.body).toBe("a");
  });

  it("a new edit clears redo", () => {
    const h = new ed.History();
    h.record(st("", c(0)), "edit");
    h.undo(st("x", c(1)));
    h.record(st("", c(0)), "edit");
    expect(h.redo(st("y", c(1)))).toBeNull();
  });
});
