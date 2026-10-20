export type SyncStatus = "synced" | "syncing" | "error";

export interface ForkedFrom {
  deviceId: string;
  noteId: string;
}

/** Which line of the note a drawing hangs from, so it moves along when lines
 * are added or removed above it. */
export interface SketchAnchor {
  /** Index of the line (0-based) its top edge sits on. */
  line: number;
  /** How far below that line's top it starts, at the base text size. */
  dy: number;
}

/** A drawing made in Note Styling, laid over the note.
 *
 * Geometry is at the base text size (zoom 100%, outside reading mode) and is
 * scaled with the text. `x` is measured like older versions did - from the
 * page's left edge, the text starting at 38 - and `y` from the top of the
 * page; with an anchor, the anchor decides the height instead and `y` is
 * only there for older versions. */
export interface NoteSketch {
  id: string;
  /** PNG data URL of the drawing - what older versions show, and the only
   * source for drawings made before strokes were kept. */
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: SketchAnchor;
  /** The drawing itself, so it can be reopened, resized and shown in either
   * theme without losing sharpness. Coordinates are relative to the
   * drawing's top-left corner when it was `naturalWidth` wide. */
  strokes?: SketchOp[];
  naturalWidth?: number;
}

export type InkKey = "ink" | "leaf" | "petrol" | "terracotta" | "amber";
export type InkTool = "pen" | "marker" | "eraser";

export interface InkStroke {
  tool: InkTool;
  /** A palette entry rather than a fixed color, so the ink adapts to the theme. */
  color: InkKey;
  /** Nominal width of the line. */
  size: number;
  /** Flattened [x, y, pressure, x, y, pressure, ...], pressure from 0 to 1. */
  points: number[];
}

/** A drawing made before strokes were kept, carried into a new version of it
 * as a picture that can still be erased and drawn over. */
export interface ImageOp {
  tool: "image";
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SketchOp = InkStroke | ImageOp;

export interface TabData {
  id: string;
  title: string;
  body: string;
  favorite: boolean;
  sketches: NoteSketch[];
  updatedAt: number;
  originDeviceId: string;
  forkedFrom?: ForkedFrom;
  /** Path of the .cyte (or imported .txt/.md) file this note is linked to, once saved there (Notepad-style: set on first Save/Save As, reused by later Ctrl+S). */
  filePath?: string;
  /** True once the title was explicitly set (renamed, or saved to a file) - until then, the title is just a live suggestion derived from the first line typed. */
  titleIsCustom?: boolean;
}

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
}

export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
}

export interface PeerInfo {
  deviceId: string;
  deviceName: string;
  address: string;
  port: number;
}
