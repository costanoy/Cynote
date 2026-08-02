import { describe, expect, it } from "vitest";
import { mergeFromPeer, type Bookkeeping } from "./merge";
import type { TabData } from "./types";

const DEVICE_A = "device-a";
const DEVICE_B = "device-b";

function note(id: string, title: string, body: string, originDeviceId = DEVICE_A): TabData {
  return { id, title, body, favorite: false, sketches: [], updatedAt: 0, originDeviceId };
}

describe("mergeFromPeer", () => {
  it("imports a note that only exists on the peer", () => {
    const mine: TabData[] = [];
    const peer = [note("n1", "Peer note", "body")];
    const result = mergeFromPeer(mine, peer, DEVICE_B, "Notebook", DEVICE_A, {});
    expect(result.changed).toBe(true);
    expect(result.tabs.map((t) => t.id)).toContain("n1");
  });

  it("does not import a note that is a fork of our own content echoed back", () => {
    const mine: TabData[] = [note("n1", "Original", "body")];
    const echoedFork: TabData = {
      ...note("n2", "Original (do Computador)", "body"),
      forkedFrom: { deviceId: DEVICE_A, noteId: "n1" },
    };
    const result = mergeFromPeer(mine, [echoedFork], DEVICE_B, "Notebook", DEVICE_A, {});
    expect(result.changed).toBe(false);
    expect(result.tabs).toHaveLength(1);
  });

  it("does nothing when the same id has identical content on both sides", () => {
    const mine = [note("n1", "Same", "content")];
    const peer = [note("n1", "Same", "content")];
    const result = mergeFromPeer(mine, peer, DEVICE_B, "Notebook", DEVICE_A, {});
    expect(result.changed).toBe(false);
    expect(result.tabs).toHaveLength(1);
  });

  it("forks a note that diverged on both sides, labeling it with the peer's name", () => {
    const mine = [note("n1", "Local title", "local body")];
    const peer = [note("n1", "Remote title", "remote body")];
    const result = mergeFromPeer(mine, peer, DEVICE_B, "Notebook", DEVICE_A, {});
    expect(result.changed).toBe(true);
    expect(result.tabs).toHaveLength(2);
    const fork = result.tabs.find((t) => t.id !== "n1")!;
    expect(fork.title).toBe("Remote title (do Notebook)");
    expect(fork.body).toBe("remote body");
    expect(fork.forkedFrom).toEqual({ deviceId: DEVICE_B, noteId: "n1" });
  });

  it("does not re-fork the same acknowledged divergence on a repeat sync cycle", () => {
    const mine = [note("n1", "Local title", "local body")];
    const peer = [note("n1", "Remote title", "remote body")];
    const first = mergeFromPeer(mine, peer, DEVICE_B, "Notebook", DEVICE_A, {});
    expect(first.tabs).toHaveLength(2);

    // Same inputs, same bookkeeping carried forward: should be a no-op.
    const second = mergeFromPeer(mine, peer, DEVICE_B, "Notebook", DEVICE_A, first.bookkeeping);
    expect(second.changed).toBe(false);
    expect(second.tabs).toHaveLength(1); // unchanged from `mine`, no new fork added
  });

  it("forks again if the local side changes again after a previously acknowledged divergence", () => {
    const mine = [note("n1", "Local title", "local body")];
    const peer = [note("n1", "Remote title", "remote body")];
    const first = mergeFromPeer(mine, peer, DEVICE_B, "Notebook", DEVICE_A, {});

    const mineEditedAgain = [note("n1", "Local title v2", "local body v2")];
    const second = mergeFromPeer(mineEditedAgain, peer, DEVICE_B, "Notebook", DEVICE_A, first.bookkeeping);
    expect(second.changed).toBe(true);
    expect(second.tabs).toHaveLength(2);
  });

  it("carries bookkeeping forward per-peer without clobbering other peers", () => {
    const mine = [note("n1", "Local", "body")];
    const peerB = [note("n1", "Remote B", "body B")];
    const afterB = mergeFromPeer(mine, peerB, DEVICE_B, "Notebook", DEVICE_A, {});

    const bookkeeping: Bookkeeping = afterB.bookkeeping;
    expect(Object.keys(bookkeeping)).toEqual([DEVICE_B]);

    const peerC = [note("n1", "Remote C", "body C")];
    const afterC = mergeFromPeer(afterB.tabs, peerC, "device-c", "Celular", DEVICE_A, bookkeeping);
    expect(Object.keys(afterC.bookkeeping).sort()).toEqual([DEVICE_B, "device-c"].sort());
  });
});
