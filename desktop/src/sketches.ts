import type { NoteSketch } from "./types";

const EMBEDDED_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,/i;

/**
 * Drawings made in Cynote are always embedded images. Anything else - a web
 * address arriving through sync, or inside a .cyte file someone sent - is
 * dropped: showing it would make the app fetch it, telling whoever picked
 * that address your IP and when you opened the note.
 */
export function safeSketches(list: unknown): NoteSketch[] {
  if (!Array.isArray(list)) return [];
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const out: NoteSketch[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const s = raw as Record<string, unknown>;
    if (typeof s.dataUrl !== "string" || !EMBEDDED_IMAGE.test(s.dataUrl)) continue;
    out.push({
      id: typeof s.id === "string" ? s.id : "s" + out.length + "-" + Date.now(),
      dataUrl: s.dataUrl,
      x: num(s.x, 0),
      y: num(s.y, 0),
      width: num(s.width, 160),
      height: num(s.height, 120),
    });
  }
  return out;
}
