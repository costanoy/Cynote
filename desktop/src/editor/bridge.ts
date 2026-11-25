import type { EditorView } from "@codemirror/view";

/*
 * The live editor, for the code that has to lay things over it (drawings, the
 * Note Styling overlay) without reaching into its DOM: ContentArea registers
 * the open EditorView here, noteLayout reads it.
 */

let active: EditorView | null = null;
const listeners = new Set<() => void>();

export function setActiveView(view: EditorView | null) {
  if (active === view) return;
  active = view;
  listeners.forEach((fn) => fn());
}

/** Unregisters `view` only if it is still the registered one (a remounted
 * editor may already have replaced it). */
export function clearActiveView(view: EditorView) {
  if (active === view) setActiveView(null);
}

export function getActiveView(): EditorView | null {
  return active;
}

export function onActiveViewChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
