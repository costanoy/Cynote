import { describe, expect, it } from "vitest";
import { safeSketches, shiftSketchAnchors, tabsForSync } from "./sketches";
import type { NoteSketch, TabData } from "./types";

const PNG = "data:image/png;base64,AAAA";

function sketch(id: string, line?: number): NoteSketch {
  return { id, dataUrl: PNG, x: 40, y: 20, width: 100, height: 20, ...(line === undefined ? {} : { anchor: { line, dy: 2 } }) };
}

const lineOf = (list: NoteSketch[], id: string) => list.find((s) => s.id === id)?.anchor?.line;

describe("safeSketches", () => {
  it("keeps strokes, anchor and the size the strokes were drawn at", () => {
    const [s] = safeSketches([
      { ...sketch("a", 3), naturalWidth: 120, strokes: [{ tool: "marker", color: "amber", size: 16, points: [0, 0, 0.5, 9, 9, 0.5] }] },
    ]);
    expect(s.anchor).toEqual({ line: 3, dy: 2 });
    expect(s.naturalWidth).toBe(120);
    expect(s.strokes).toEqual([{ tool: "marker", color: "amber", size: 16, points: [0, 0, 0.5, 9, 9, 0.5] }]);
  });

  it("drops strokes that aren't well-formed, and pictures that aren't embedded", () => {
    const [s] = safeSketches([
      {
        ...sketch("a"),
        strokes: [
          { tool: "laser", color: "ink", size: 2, points: [0, 0, 1] },
          { tool: "pen", color: "#ff0000", size: 2, points: [0, 0, 1] },
          { tool: "pen", color: "ink", size: 2, points: [0, 0] },
          { tool: "pen", color: "ink", size: 2, points: [0, "x", 1] },
          { tool: "pen", color: "ink", size: -1, points: [0, 0, 1] },
          { tool: "image", src: "https://example.com/spy.png", x: 0, y: 0, w: 5, h: 5 },
          { tool: "image", src: PNG, x: 0, y: 0, w: 5, h: 5 },
          { tool: "eraser", color: "ink", size: 10, points: [1, 1, 1] },
        ],
        anchor: { line: -2, dy: 0 },
      },
    ]);
    expect(s.strokes?.map((o) => o.tool)).toEqual(["image", "eraser"]);
    expect(s.naturalWidth).toBe(100);
    expect(s.anchor).toBeUndefined();
  });

  it("refuses drawings too big to be anything but an attack", () => {
    const huge = Array.from({ length: 3 * 20001 }, () => 1);
    const [s] = safeSketches([{ ...sketch("a"), strokes: [{ tool: "pen", color: "ink", size: 2, points: huge }] }]);
    expect(s.strokes).toBeUndefined();
  });

  it("leaves drawings from older versions as they were", () => {
    expect(safeSketches([sketch("a")])).toEqual([sketch("a")]);
  });
});

describe("shiftSketchAnchors", () => {
  const body = ["Lista", "Comprar", "Regar", "Ligar"].join("\n");
  const list = [sketch("top", 0), sketch("regar", 2), sketch("old")];

  it("moves a drawing down when lines are added above it", () => {
    const next = shiftSketchAnchors(list, body, ["Lista", "Nova", "", "Comprar", "Regar", "Ligar"].join("\n"));
    expect(lineOf(next, "top")).toBe(0);
    expect(lineOf(next, "regar")).toBe(4);
  });

  it("moves it up when lines above it are removed", () => {
    expect(lineOf(shiftSketchAnchors(list, body, ["Lista", "Regar", "Ligar"].join("\n")), "regar")).toBe(1);
  });

  it("settles a drawing whose own line was removed where the removal happened", () => {
    expect(lineOf(shiftSketchAnchors(list, body, ["Lista", "Comprar", "Ligar"].join("\n")), "regar")).toBe(2);
    expect(lineOf(shiftSketchAnchors(list, body, ["Lista"].join("\n")), "regar")).toBe(0);
  });

  it("leaves everything alone for edits within a line or below the drawing", () => {
    expect(shiftSketchAnchors(list, body, body.replace("Regar", "Regar a horta"))).toBe(list);
    expect(shiftSketchAnchors(list, body, body + "\nNova linha")).toBe(list);
  });

  it("splitting the drawing's own line keeps it on the first half", () => {
    expect(lineOf(shiftSketchAnchors(list, body, body.replace("Regar", "Reg\nar")), "regar")).toBe(2);
  });

  it("passes notes without drawings straight through", () => {
    expect(shiftSketchAnchors(undefined, body, "x")).toBeUndefined();
  });
});

describe("tabsForSync", () => {
  const tab = (sketches: NoteSketch[]): TabData => ({
    id: "n",
    title: "T",
    body: "b",
    favorite: false,
    sketches,
    updatedAt: 1,
    originDeviceId: "d",
  });

  it("uploads the picture and placement but keeps the strokes on this computer", () => {
    const withStrokes = { ...sketch("a", 1), naturalWidth: 100, strokes: [{ tool: "pen" as const, color: "ink" as const, size: 2, points: [0, 0, 1] }] };
    const [uploaded] = tabsForSync([tab([withStrokes])]);
    expect(uploaded.sketches[0]).toEqual(sketch("a", 1));
  });

  it("leaves notes whose drawings have no strokes untouched", () => {
    const plain = tab([sketch("a")]);
    expect(tabsForSync([plain])[0]).toBe(plain);
  });
});
