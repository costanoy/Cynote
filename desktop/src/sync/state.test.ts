import { describe, expect, it } from "vitest";
import { dropDuplicateCopies } from "./legacy";
import { addIgnored, emptyState, parseState, resetForNewCode } from "./state";
import { generateSyncCode, normalizeSyncCode } from "./reconcile";
import type { TabData } from "../types";

describe("parseState", () => {
  it("falls back to an empty state for anything unusable", () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState("x")).toEqual(emptyState());
    expect(parseState([])).toEqual(emptyState());
  });

  it("keeps good entries and drops malformed ones", () => {
    const s = parseState({
      version: 2,
      base: { a: { h: "abcd1234", m: true }, b: { h: 5 }, c: null },
      deleted: { a: 10, b: "x" },
      ignored: ["x", 3, "y"],
      lastStamp: 77,
      v1Imported: true,
    });
    expect(s.base).toEqual({ a: { h: "abcd1234", m: true } });
    expect(s.deleted).toEqual({ a: 10 });
    expect(s.ignored).toEqual(["x", "y"]);
    expect(s.lastStamp).toBe(77);
    expect(s.v1Imported).toBe(true);
  });
});

describe("state changes", () => {
  it("a new code resets base, stamp and the v1 import but keeps deleted and ignored", () => {
    const s = { ...emptyState(), base: { a: { h: "1", m: true } }, deleted: { a: 1 }, ignored: ["z"], lastStamp: 5, v1Imported: true };
    expect(resetForNewCode(s)).toEqual({ version: 2, base: {}, deleted: { a: 1 }, ignored: ["z"], lastStamp: null, v1Imported: false });
  });

  it("addIgnored skips duplicates and ids the cloud cannot hold", () => {
    const s = emptyState();
    addIgnored(s, ["a", "a", "b c", "d"]);
    expect(s.ignored).toEqual(["a", "d"]);
  });
});

describe("sync codes", () => {
  it("makes 20 hex digits in four groups, and reads them back leniently", () => {
    const code = generateSyncCode((n) => new Uint8Array(n).map((_, i) => i * 17));
    expect(code).toMatch(/^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/);
    expect(normalizeSyncCode(code.toLowerCase().replace(/-/g, " "))).toBe(code);
    expect(normalizeSyncCode("4F2A9-C81D0-77B3E")).toBeNull();
  });
});

describe("dropDuplicateCopies", () => {
  const copy = (id: string, title: string, body: string, extra: Partial<TabData> = {}): TabData => ({
    id,
    title,
    body,
    favorite: false,
    sketches: [],
    updatedAt: 0,
    originDeviceId: "d",
    forkedFrom: { deviceId: "d", noteId: "x" },
    ...extra,
  });

  it("drops identical forked copies but keeps the first, other notes and linked files", () => {
    const tabs = [
      copy("a", "T (do X)", "texto"),
      copy("b", "T (do X)", "texto"),
      copy("c", "T (do X)", "outro"),
      copy("d", "T (do X)", "texto", { filePath: "C:\a.cyte" }),
      { ...copy("e", "T (do X)", "texto"), forkedFrom: undefined },
    ];
    const out = dropDuplicateCopies(tabs);
    expect(out.removedIds).toEqual(["b"]);
    expect(out.tabs.map((t) => t.id)).toEqual(["a", "c", "d", "e"]);
  });
});
