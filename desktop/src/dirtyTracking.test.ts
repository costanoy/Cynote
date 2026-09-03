import { describe, expect, it } from "vitest";
import { EMPTY_SNAPSHOT, isDirty, snapshotOf, tabHasContent } from "./dirtyTracking";
import type { TabData } from "./types";

function tab(overrides: Partial<TabData> = {}): TabData {
  return {
    id: "n1",
    title: "Nova nota",
    body: "",
    favorite: false,
    sketches: [],
    updatedAt: 0,
    originDeviceId: "device-a",
    ...overrides,
  };
}

describe("dirtyTracking", () => {
  it("a fresh blank tab (no snapshot) is not dirty", () => {
    expect(isDirty(tab(), undefined)).toBe(false);
  });

  it("typing into a never-saved tab makes it dirty", () => {
    expect(isDirty(tab({ body: "hello" }), undefined)).toBe(true);
  });

  it("matches EMPTY_SNAPSHOT exactly for a truly blank tab", () => {
    expect(snapshotOf(tab())).toEqual(EMPTY_SNAPSHOT);
  });

  it("is clean right after markSaved (comparing against its own snapshot)", () => {
    const t = tab({ body: "saved content", title: "My note" });
    const snap = snapshotOf(t);
    expect(isDirty(t, snap)).toBe(false);
  });

  it("becomes dirty again after editing past the saved snapshot", () => {
    const t = tab({ body: "saved content" });
    const snap = snapshotOf(t);
    const edited = { ...t, body: "saved content, plus more" };
    expect(isDirty(edited, snap)).toBe(true);
  });

  it("detects a title-only change as dirty", () => {
    const t = tab({ body: "same body" });
    const snap = snapshotOf(t);
    const renamed = { ...t, title: "New title" };
    expect(isDirty(renamed, snap)).toBe(true);
  });

  it("detects a sketch change as dirty", () => {
    const t = tab({
      sketches: [{ id: "sk1", dataUrl: "data:image/png;base64,a", x: 0, y: 0, width: 10, height: 10 }],
    });
    const snap = snapshotOf(t);
    const moved = { ...t, sketches: [{ ...t.sketches[0], x: 5 }] };
    expect(isDirty(moved, snap)).toBe(true);
  });

  describe("tabHasContent", () => {
    it("is false for a blank tab", () => {
      expect(tabHasContent(tab())).toBe(false);
    });
    it("is false for whitespace-only body", () => {
      expect(tabHasContent(tab({ body: "   \n  " }))).toBe(false);
    });
    it("is true with body text", () => {
      expect(tabHasContent(tab({ body: "hi" }))).toBe(true);
    });
    it("is true with a sketch even if body is empty", () => {
      expect(
        tabHasContent(
          tab({ sketches: [{ id: "sk1", dataUrl: "x", x: 0, y: 0, width: 1, height: 1 }] })
        )
      ).toBe(true);
    });
  });
});
