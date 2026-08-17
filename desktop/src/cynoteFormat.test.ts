import { describe, expect, it } from "vitest";
import { parseNoteFile, serializeCynoteNote } from "./cynoteFormat";
import type { TabData } from "./types";

function tab(overrides: Partial<TabData> = {}): TabData {
  return {
    id: "n1",
    title: "My note",
    body: "Line one\nLine two",
    favorite: false,
    sketches: [],
    updatedAt: 12345,
    originDeviceId: "device-a",
    titleIsCustom: true,
    ...overrides,
  };
}

describe("cynoteFormat", () => {
  it("round-trips title, body and metadata", () => {
    const original = tab();
    const raw = serializeCynoteNote(original);
    const parsed = parseNoteFile(raw, "fallback");

    expect(parsed.title).toBe(original.title);
    expect(parsed.body).toBe(original.body);
    expect(parsed.meta?.id).toBe(original.id);
    expect(parsed.meta?.updatedAt).toBe(original.updatedAt);
    expect(parsed.meta?.originDeviceId).toBe(original.originDeviceId);
    expect(parsed.meta?.titleIsCustom).toBe(true);
  });

  it("round-trips sketches", () => {
    const original = tab({
      sketches: [{ id: "sk1", dataUrl: "data:image/png;base64,abc", x: 10, y: 20, width: 100, height: 50 }],
    });
    const raw = serializeCynoteNote(original);
    const parsed = parseNoteFile(raw, "fallback");

    expect(parsed.meta?.sketches).toHaveLength(1);
    expect(parsed.meta?.sketches[0]).toEqual(original.sketches[0]);
  });

  it("treats a plain text file with no footer as opaque legacy content", () => {
    const raw = "Just some notes\nwritten in Notepad, no title convention at all.";
    const parsed = parseNoteFile(raw, "My File");

    expect(parsed.title).toBe("My File");
    expect(parsed.body).toBe(raw);
    expect(parsed.meta).toBeNull();
  });

  it("falls back to legacy parsing if the footer JSON is corrupt", () => {
    const raw = "Title\n\nBody text\n\n<!--CYNOTE:{not valid json-->\n";
    const parsed = parseNoteFile(raw, "Fallback");

    expect(parsed.meta).toBeNull();
    expect(parsed.body).toBe(raw);
  });

  it("recognizes the footer even without the .cyte extension (renamed file)", () => {
    const raw = serializeCynoteNote(tab({ title: "Renamed" }));
    const parsed = parseNoteFile(raw, "whatever-the-filename-is");

    expect(parsed.title).toBe("Renamed");
    expect(parsed.meta).not.toBeNull();
  });
});
