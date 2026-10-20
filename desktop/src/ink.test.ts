import { describe, expect, it } from "vitest";
import { compactOps, groupsApart, mapOps, nextPressure, opBounds, opsBounds, strokeShape } from "./ink";
import type { InkStroke, SketchOp } from "./types";

function stroke(points: number[][], tool: InkStroke["tool"] = "pen", size = 4): InkStroke {
  return { tool, color: "ink", size, points: points.flatMap(([x, y, p = 0.7]) => [x, y, p]) };
}

const circlesOf = (s: InkStroke) => {
  const { circles } = strokeShape(s);
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < circles.length; i += 3) out.push({ x: circles[i], y: circles[i + 1], r: circles[i + 2] });
  return out;
};

describe("ink strokes", () => {
  it("cover the whole way from where the pointer went down to where it lifted", () => {
    // Drawing only the curved middle of each segment used to leave the first
    // and last stretch out - a gap at both ends of every stroke.
    const circles = circlesOf(stroke([[10, 50], [60, 52], [120, 50], [200, 55]]));
    expect(circles[0]).toMatchObject({ x: 10, y: 50 });
    expect(circles[circles.length - 1]).toMatchObject({ x: 200, y: 55 });
  });

  it("taper at both ends and never get wider than their size", () => {
    const circles = circlesOf(stroke([[0, 0], [300, 0]], "pen", 6));
    const widest = Math.max(...circles.map((c) => c.r));
    expect(widest).toBeLessThanOrEqual(3);
    expect(circles[0].r).toBeLessThan(widest);
    expect(circles[circles.length - 1].r).toBeLessThan(widest);
  });

  it("keep a marker the same width all along", () => {
    const radii = new Set(circlesOf(stroke([[0, 0], [80, 10], [160, 0]], "marker", 16)).map((c) => c.r));
    expect([...radii]).toEqual([8]);
  });

  it("make a dot from a single click", () => {
    const circles = circlesOf(stroke([[5, 5]]));
    expect(circles).toHaveLength(1);
    expect(circles[0].r).toBeGreaterThan(0);
  });

  it("wind every piece the same way, so filling them together leaves no holes", () => {
    const { quads } = strokeShape(stroke([[0, 0], [40, 30], [10, 60], [80, 20], [0, 0]]));
    for (let q = 0; q < quads.length; q += 8) {
      let area = 0;
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        area += quads[q + i * 2] * quads[q + j * 2 + 1] - quads[q + j * 2] * quads[q + i * 2 + 1];
      }
      expect(area).toBeGreaterThanOrEqual(0);
    }
  });

  it("thin out when the pointer moves fast", () => {
    let slow = 0.7;
    let fast = 0.7;
    for (let i = 0; i < 20; i++) {
      slow = nextPressure(slow, 1, 16);
      fast = nextPressure(fast, 60, 16);
    }
    expect(slow).toBeGreaterThan(0.9);
    expect(fast).toBeLessThan(0.5);
  });
});

describe("drawing operations", () => {
  it("bounds count ink but not eraser passes", () => {
    const pen = stroke([[10, 10], [50, 20]], "pen", 4);
    expect(opBounds(pen)).toEqual({ x0: 7, y0: 7, x1: 53, y1: 23 });
    expect(opBounds({ ...pen, tool: "eraser" })).toBeNull();
    const picture: SketchOp = { tool: "image", src: "data:image/png;base64,AA", x: 0, y: 0, w: 5, h: 5 };
    expect(opsBounds([picture, pen])).toEqual({ x0: 0, y0: 0, x1: 53, y1: 23 });
  });

  it("move and scale together with their line widths", () => {
    const [moved, pic] = mapOps(
      [stroke([[10, 20, 0.5]], "pen", 4), { tool: "image", src: "data:image/png;base64,AA", x: 1, y: 2, w: 3, h: 4 }],
      2,
      100,
      50
    );
    expect(moved).toMatchObject({ size: 8, points: [120, 90, 0.5] });
    expect(pic).toMatchObject({ x: 102, y: 54, w: 6, h: 8 });
  });

  it("are stored rounded, without points that repeat the one before", () => {
    const [s] = compactOps([stroke([[1.234, 5.678, 0.4567], [1.21, 5.66, 0.5], [9.99, 9.99, 1]])]) as InkStroke[];
    expect(s.points).toEqual([1.2, 5.7, 0.46, 10, 10, 1]);
  });
});

describe("groupsApart", () => {
  const underline = (y: number) => stroke([[0, y], [100, y]], "pen", 3);

  it("keeps marks made in different places as separate drawings, top first", () => {
    const groups = groupsApart([underline(200), underline(20)], 16);
    expect(groups).toHaveLength(2);
    expect((groups[0][0] as InkStroke).points[1]).toBe(20);
  });

  it("keeps the strokes of one mark together", () => {
    const groups = groupsApart([underline(20), stroke([[105, 15], [140, 25]]), underline(28)], 16);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("sends an eraser pass only to the drawings it went over", () => {
    const eraser = { ...stroke([[50, 200], [60, 200]], "pen", 10), tool: "eraser" as const };
    const groups = groupsApart([underline(20), underline(200), eraser], 16);
    expect(groups.map((g) => g.length)).toEqual([1, 2]);
    expect(groups[1][1]).toBe(eraser);
  });

  it("finds nothing to keep on a sheet with only erasing", () => {
    expect(groupsApart([{ ...underline(20), tool: "eraser" }], 16)).toEqual([]);
  });
});
