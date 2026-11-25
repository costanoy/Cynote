import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  copyLineText,
  cutLineChanges,
  indentTransaction,
  insertLineTransaction,
  minimalChange,
  newlineTransaction,
  outdentTransaction,
  selectLineSelection,
  smartHomeTarget,
  touchedLines,
} from "./helpers";

const make = (doc: string, ...ranges: [number, number?][]) =>
  EditorState.create({
    doc,
    selection: EditorSelection.create(ranges.map(([a, h]) => EditorSelection.range(a, h ?? a))),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  });

const run = (state: EditorState, spec: TransactionSpec | null) => (spec ? state.update(spec).state : state);
const sel = (s: EditorState) => s.selection.ranges.map((r) => [r.anchor, r.head]);

describe("copyLineText", () => {
  it("is null while anything is selected, so that copies as usual", () => {
    expect(copyLineText(make("ab\ncd", [0, 1]))).toBeNull();
    expect(copyLineText(make("ab\ncd", [0, 1], [4]))).toBeNull();
  });
  it("is the whole line with its break when nothing is selected", () => {
    expect(copyLineText(make("ab\ncd\nef", [1]))).toBe("ab\n");
    expect(copyLineText(make("ab\ncd\nef", [7]))).toBe("ef\n");
  });
  it("takes each line once, even with several cursors on it", () => {
    expect(copyLineText(make("ab\ncd\nef", [0], [1], [4]))).toBe("ab\ncd\n");
  });
});

describe("cutLineChanges", () => {
  const cut = (s: EditorState) => s.update({ changes: cutLineChanges(s) }).state.doc.toString();
  it("removes the line and its break", () => {
    expect(cut(make("ab\ncd\nef", [4]))).toBe("ab\nef");
    expect(cut(make("ab\ncd\nef", [0]))).toBe("cd\nef");
  });
  it("takes the break before it when it is the last line", () => {
    expect(cut(make("ab\ncd\nef", [7]))).toBe("ab\ncd");
    expect(cut(make("only", [2]))).toBe("");
  });
  it("handles cursors on several lines", () => {
    expect(cut(make("a\nb\nc\nd", [0], [4]))).toBe("b\nd");
  });
});

describe("touchedLines", () => {
  it("leaves out a line the selection only reaches the start of", () => {
    const s = make("a\nb\nc", [0, 2]);
    expect(touchedLines(s).map((l) => l.text)).toEqual(["a"]);
  });
  it("counts a line once for overlapping selections", () => {
    const s = make("a\nb\nc", [0, 3], [2, 4]);
    expect(touchedLines(s).map((l) => l.text)).toEqual(["a", "b"]);
  });
});

describe("indent and outdent", () => {
  it("indents every selected line with a tab and keeps whole lines whole", () => {
    const s = make("a\nb\nc", [0, 4]);
    const next = run(s, indentTransaction(s));
    expect(next.doc.toString()).toBe("\ta\n\tb\nc");
    expect(sel(next)).toEqual([[0, 6]]);
  });
  it("moves a plain cursor after the tab it inserted", () => {
    const s = make("ab", [1]);
    const next = run(s, indentTransaction(s));
    expect(next.doc.toString()).toBe("\tab");
    expect(sel(next)).toEqual([[2, 2]]);
  });
  it("does not indent blank lines inside a block", () => {
    const s = make("a\n\nb", [0, 4]);
    expect(run(s, indentTransaction(s)).doc.toString()).toBe("\ta\n\n\tb");
  });
  it("outdents a tab or up to four spaces", () => {
    const s = make("\ta\n      b\n  c\nd", [0, 14]);
    expect(run(s, outdentTransaction(s)).doc.toString()).toBe("a\n  b\nc\nd");
  });
  it("has nothing to do on lines without indentation", () => {
    const s = make("a\nb", [0, 3]);
    expect(outdentTransaction(s)).toBeNull();
  });
});

describe("smartHomeTarget", () => {
  it("goes to the first non-blank character, then to column 1", () => {
    const text = "    word";
    expect(smartHomeTarget(text, 10, 16)).toBe(14);
    expect(smartHomeTarget(text, 10, 14)).toBe(10);
    expect(smartHomeTarget(text, 10, 10)).toBe(14);
    expect(smartHomeTarget(text, 10, 12)).toBe(14);
  });
  it("goes straight to column 1 when the line is not indented", () => {
    expect(smartHomeTarget("word", 5, 8)).toBe(5);
  });
  it("treats a blank line as indentation up to its end", () => {
    expect(smartHomeTarget("   ", 0, 1)).toBe(3);
    expect(smartHomeTarget("   ", 0, 3)).toBe(0);
  });
});

describe("selectLineSelection", () => {
  it("selects the line with its break, and one more line each repeat", () => {
    let s = make("aa\nbb\ncc", [4]);
    s = run(s, { selection: selectLineSelection(s) });
    expect(sel(s)).toEqual([[3, 6]]);
    s = run(s, { selection: selectLineSelection(s) });
    expect(sel(s)).toEqual([[3, 8]]);
  });
  it("merges cursors on the same line", () => {
    const s = make("aa\nbb", [0], [1]);
    expect(sel(run(s, { selection: selectLineSelection(s) }))).toEqual([[0, 3]]);
  });
});

describe("newline and insert line", () => {
  it("Enter keeps the indentation up to the caret", () => {
    const s = make("\t  ab", [5]);
    const next = run(s, newlineTransaction(s));
    expect(next.doc.toString()).toBe("\t  ab\n\t  ");
    expect(sel(next)).toEqual([[9, 9]]);
    const early = make("\t  ab", [1]);
    expect(run(early, newlineTransaction(early)).doc.toString()).toBe("\t\n\t  ab");
  });
  it("opens an empty line below, indented like the current one", () => {
    const s = make("  ab\ncd", [3]);
    const next = run(s, insertLineTransaction(s, "below"));
    expect(next.doc.toString()).toBe("  ab\n  \ncd");
    expect(sel(next)).toEqual([[7, 7]]);
  });
  it("opens an empty line above", () => {
    const s = make("ab\ncd", [4]);
    const next = run(s, insertLineTransaction(s, "above"));
    expect(next.doc.toString()).toBe("ab\n\ncd");
    expect(sel(next)).toEqual([[3, 3]]);
  });
  it("opens one line per cursor line", () => {
    const s = make("a\nb", [0], [1], [2]);
    const next = run(s, insertLineTransaction(s, "below"));
    expect(next.doc.toString()).toBe("a\n\nb\n");
    expect(sel(next)).toEqual([[2, 2], [5, 5]]);
  });
});

describe("minimalChange", () => {
  it("is null for equal texts", () => {
    expect(minimalChange("abc", "abc")).toBeNull();
  });
  it("finds the smallest replacement", () => {
    expect(minimalChange("hello world", "hello there world")).toEqual({ from: 6, to: 6, insert: "there " });
    expect(minimalChange("hello world", "hello")).toEqual({ from: 5, to: 11, insert: "" });
    expect(minimalChange("abcdef", "abXYef")).toEqual({ from: 2, to: 4, insert: "XY" });
    expect(minimalChange("", "new")).toEqual({ from: 0, to: 0, insert: "new" });
  });
  it("round-trips", () => {
    const a = "line one\nline two\nline three";
    const b = "line one\nline 2\nline three!";
    const c = minimalChange(a, b)!;
    expect(a.slice(0, c.from) + c.insert + a.slice(c.to)).toBe(b);
  });
  it("keeps a cursor outside the edit where it was", () => {
    let s = make("one two three", [0]);
    const c = minimalChange("one two three", "one 2 three")!;
    s = s.update({ changes: c }).state;
    expect(sel(s)).toEqual([[0, 0]]);
  });
});
