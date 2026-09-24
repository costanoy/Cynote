import { describe, expect, it } from "vitest";
import { mergeFromPeer, dropDuplicateCopies, type Bookkeeping } from "./merge";
import { tabHasContent } from "./dirtyTracking";
import type { TabData } from "./types";

const DEVICE_A = "device-a";
const DEVICE_B = "device-b";

function note(id: string, title: string, body: string, updatedAt = 0, originDeviceId = DEVICE_A): TabData {
  return { id, title, body, favorite: false, sketches: [], updatedAt, originDeviceId };
}

/** One device's view: its notes plus its bookkeeping about the other device. */
interface Device {
  id: string;
  tabs: TabData[];
  book: Bookkeeping;
}

function pull(into: Device, from: Device): boolean {
  const result = mergeFromPeer(into.tabs, from.tabs, from.id, into.id, into.book);
  into.tabs = result.tabs;
  into.book = result.bookkeeping;
  return result.changed;
}

function edit(device: Device, id: string, body: string, at: number) {
  device.tabs = device.tabs.map((t) => (t.id === id ? { ...t, body, updatedAt: at } : t));
}

const copiesOf = (d: Device) => d.tabs.filter((t) => t.id !== "n1");
const n1 = (d: Device) => d.tabs.find((t) => t.id === "n1")!;

describe("mergeFromPeer", () => {
  it("imports a note that only exists on the peer", () => {
    const result = mergeFromPeer([], [note("n1", "Peer note", "body")], DEVICE_B, DEVICE_A, {});
    expect(result.changed).toBe(true);
    expect(result.tabs.map((t) => t.id)).toContain("n1");
  });

  it("does not import a note that is a fork of our own content echoed back", () => {
    const echoedFork: TabData = {
      ...note("n2", "Original (do Computador)", "body"),
      forkedFrom: { deviceId: DEVICE_A, noteId: "n1" },
    };
    const result = mergeFromPeer([note("n1", "Original", "body")], [echoedFork], DEVICE_B, DEVICE_A, {});
    expect(result.changed).toBe(false);
    expect(result.tabs).toHaveLength(1);
  });

  it("does nothing when the same id has identical content on both sides", () => {
    const result = mergeFromPeer([note("n1", "Same", "x")], [note("n1", "Same", "x")], DEVICE_B, DEVICE_A, {});
    expect(result.changed).toBe(false);
    expect(result.tabs).toHaveLength(1);
  });

  it("never re-imports a note that was closed on this device", () => {
    const peer = [note("n1", "Closed here", "body"), note("n2", "Still wanted", "body")];
    const result = mergeFromPeer([], peer, DEVICE_B, DEVICE_A, {}, new Set(["n1"]));
    expect(result.tabs.map((t) => t.id)).toEqual(["n2"]);
  });

  it("never lets a stale peer copy replace a newer local note, and doesn't copy it either", () => {
    // The phone still held a two-week-old version from its last LAN sync.
    const mine = [note("n1", "Projetos", "current text", 2000)];
    const stalePeer = [note("n1", "Projetos", "old text", 1000)];
    const result = mergeFromPeer(mine, stalePeer, DEVICE_B, DEVICE_A, {});
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].body).toBe("current text");
  });

  it("does not create a new copy on every local edit while the peer's copy stays the same", () => {
    const a: Device = { id: DEVICE_A, tabs: [note("n1", "Projetos", "v1", 2000)], book: {} };
    const b: Device = { id: DEVICE_B, tabs: [note("n1", "Projetos", "old", 1000)], book: {} };
    for (let i = 2; i <= 8; i++) {
      edit(a, "n1", "v" + i, 2000 + i);
      pull(a, b);
    }
    expect(a.tabs).toHaveLength(1);
    expect(n1(a).body).toBe("v8");
  });

  it("takes the peer's version when only the peer changed since the two last agreed", () => {
    const a: Device = { id: DEVICE_A, tabs: [note("n1", "T", "P0", 1)], book: {} };
    const b: Device = { id: DEVICE_B, tabs: [note("n1", "T", "P0", 1)], book: {} };
    pull(a, b);
    edit(b, "n1", "P1", 5);
    expect(pull(a, b)).toBe(true);
    expect(n1(a).body).toBe("P1");
    expect(n1(a).updatedAt).toBe(5);
    expect(copiesOf(a)).toHaveLength(0);
  });

  it("resolves a real conflict the same way on both devices, keeping the losing text as one copy", () => {
    for (const bFirst of [false, true]) {
      const a: Device = { id: DEVICE_A, tabs: [note("n1", "T", "P0", 1)], book: {} };
      const b: Device = { id: DEVICE_B, tabs: [note("n1", "T", "P0", 1)], book: {} };
      pull(a, b);
      pull(b, a);
      edit(a, "n1", "edited on A", 10);
      edit(b, "n1", "edited on B", 12);

      if (bFirst) pull(b, a);
      pull(a, b);
      pull(b, a);
      pull(a, b);

      expect(n1(a).body).toBe("edited on B");
      expect(n1(b).body).toBe("edited on B");
      for (const d of [a, b]) {
        expect(copiesOf(d)).toHaveLength(1);
        expect(copiesOf(d)[0].body).toBe("edited on A");
        expect(copiesOf(d)[0].title).toBe("T (conflito)");
      }
    }
  });

  it("goes back to plain fast-forwarding once a conflict has been resolved", () => {
    const a: Device = { id: DEVICE_A, tabs: [note("n1", "T", "P0", 1)], book: {} };
    const b: Device = { id: DEVICE_B, tabs: [note("n1", "T", "P0", 1)], book: {} };
    pull(a, b);
    pull(b, a);
    edit(a, "n1", "A", 10);
    edit(b, "n1", "B", 12);
    pull(a, b);
    pull(b, a);

    edit(b, "n1", "B again", 20);
    pull(a, b);
    expect(n1(a).body).toBe("B again");
    expect(copiesOf(a)).toHaveLength(1);
  });

  it("doesn't make a conflict copy of text that already exists in another note", () => {
    const mine = [note("n1", "T", "same text", 1), note("n9", "T (conflito)", "same text", 1)];
    const result = mergeFromPeer(mine, [note("n1", "T", "newer", 5)], DEVICE_B, DEVICE_A, {});
    expect(result.tabs).toHaveLength(2);
    expect(result.tabs.find((t) => t.id === "n1")!.body).toBe("newer");
  });

  it("keeps this device's own sketches and file link when taking the peer's text", () => {
    const a: Device = {
      id: DEVICE_A,
      tabs: [{ ...note("n1", "T", "P0", 1), filePath: "C:\\notes\\t.cyte", sketches: [{ id: "s", dataUrl: "x" } as never] }],
      book: {},
    };
    const b: Device = { id: DEVICE_B, tabs: [note("n1", "T", "P0", 1)], book: {} };
    pull(a, b);
    edit(b, "n1", "P1", 5);
    pull(a, b);
    expect(n1(a).filePath).toBe("C:\\notes\\t.cyte");
    expect(n1(a).sketches).toHaveLength(1);
  });

  it("never imports a peer's file link, which is a path on the peer's own disk", () => {
    const peer = [{ ...note("n1", "T", "b"), filePath: "D:\\other-machine\\t.cyte" }];
    const result = mergeFromPeer([], peer, DEVICE_B, DEVICE_A, {});
    expect(result.tabs[0].filePath).toBeUndefined();
  });

  it("backfills favorite/sketches when importing a note shaped like the mobile app's (which has neither field)", () => {
    const mobileShapedNote = {
      id: "n1",
      title: "From phone",
      body: "body",
      updatedAt: 0,
      originDeviceId: DEVICE_B,
    } as unknown as TabData;

    const imported = mergeFromPeer([], [mobileShapedNote], DEVICE_B, DEVICE_A, {}).tabs[0];
    expect(imported.sketches).toEqual([]);
    expect(imported.favorite).toBe(false);
    expect(() => tabHasContent(imported)).not.toThrow();
  });

  it("carries bookkeeping forward per-peer without clobbering other peers", () => {
    const afterB = mergeFromPeer([note("n1", "Local", "b")], [note("n1", "B", "b B")], DEVICE_B, DEVICE_A, {});
    expect(Object.keys(afterB.bookkeeping)).toEqual([DEVICE_B]);
    const afterC = mergeFromPeer(afterB.tabs, [note("n1", "C", "b C")], "device-c", DEVICE_A, afterB.bookkeeping);
    expect(Object.keys(afterC.bookkeeping).sort()).toEqual([DEVICE_B, "device-c"].sort());
  });
});

describe("dropDuplicateCopies", () => {
  it("collapses identical sync copies but keeps originals and file-linked notes", () => {
    const fork = (id: string, body: string): TabData => ({
      ...note(id, "Projetos (do localhost)", body),
      forkedFrom: { deviceId: DEVICE_B, noteId: "n1" },
    });
    const tabs = [
      note("n1", "Projetos", "old"),
      fork("f1", "old"),
      fork("f2", "old"),
      fork("f3", "old"),
      fork("f4", "different"),
      { ...fork("f5", "old"), filePath: "C:\\x.cyte" },
    ];
    const { tabs: kept, removedIds } = dropDuplicateCopies(tabs);
    expect(kept.map((t) => t.id)).toEqual(["n1", "f1", "f4", "f5"]);
    expect(removedIds).toEqual(["f2", "f3"]);
  });
});
