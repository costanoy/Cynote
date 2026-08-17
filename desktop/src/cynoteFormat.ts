import type { NoteSketch, TabData } from "./types";

/**
 * The .cynote file format: a plain-text file that reads just like a .txt
 * (title on the first line, blank line, then the body) with one addition -
 * a trailing HTML-comment-style block carrying the note's id and everything
 * a .txt can't hold (sketches, favorite, titleIsCustom, origin device...).
 * A viewer without Cynote just sees an extra comment at the end; Cynote
 * strips it back out. The `id` inside is what lets the Dashboard - and the
 * sync engine that reads its picks - recognize "this file IS note X" across
 * renames, reopens, and devices, instead of guessing from a path or title.
 */

const FORMAT_VERSION = 1;
const FOOTER_RE = /\n<!--CYNOTE:([\s\S]*)-->\s*$/;

export interface CynoteMeta {
  v: number;
  id: string;
  titleIsCustom: boolean;
  favorite: boolean;
  updatedAt: number;
  originDeviceId: string;
  sketches: NoteSketch[];
}

export interface ParsedNoteFile {
  title: string;
  body: string;
  /** Present only for files that carry a valid Cynote metadata footer. */
  meta: CynoteMeta | null;
}

export function serializeCynoteNote(tab: TabData): string {
  const meta: CynoteMeta = {
    v: FORMAT_VERSION,
    id: tab.id,
    titleIsCustom: !!tab.titleIsCustom,
    favorite: tab.favorite,
    updatedAt: tab.updatedAt,
    originDeviceId: tab.originDeviceId,
    sketches: tab.sketches,
  };
  const header = tab.title.trim() ? `${tab.title}\n\n${tab.body}` : tab.body;
  return `${header}\n\n<!--CYNOTE:${JSON.stringify(meta)}-->\n`;
}

/**
 * Reads any text file Cynote can open. Files with a Cynote footer (any
 * extension - a .cynote file renamed to .txt still round-trips correctly)
 * get the full title/body/metadata split. Anything else is treated as
 * opaque plain text, exactly like before: the whole file becomes the body
 * and `fallbackTitle` (normally the filename) is used as-is, so a random
 * imported .txt/.md never has its first line silently eaten as a "title".
 */
export function parseNoteFile(raw: string, fallbackTitle: string): ParsedNoteFile {
  const footerMatch = raw.match(FOOTER_RE);
  if (!footerMatch) {
    return { title: fallbackTitle, body: raw, meta: null };
  }

  let meta: CynoteMeta | null = null;
  try {
    const parsed = JSON.parse(footerMatch[1]);
    if (parsed && typeof parsed.id === "string") meta = parsed;
  } catch {
    meta = null;
  }
  if (!meta) {
    return { title: fallbackTitle, body: raw, meta: null };
  }

  const content = raw.slice(0, footerMatch.index).replace(/\n+$/, "");
  const newlineIdx = content.indexOf("\n");
  if (newlineIdx === -1) {
    return { title: content.trim() || fallbackTitle, body: "", meta };
  }
  const title = content.slice(0, newlineIdx).trim() || fallbackTitle;
  const body = content.slice(newlineIdx + 1).replace(/^\n/, "");
  return { title, body, meta };
}
