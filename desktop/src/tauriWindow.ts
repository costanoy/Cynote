import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Hides the window to the tray. Asks to close rather than hiding it here, so
 * the Rust side handles it like any other close (Alt+F4, the tray): that also
 * tells the webview it's out of sight, and the page stops rendering. */
export function hideAppWindow() {
  if (!isTauri()) return;
  getCurrentWindow()
    .close()
    .catch(() => {});
}

export function setAppAlwaysOnTop(value: boolean) {
  if (!isTauri()) return;
  getCurrentWindow()
    .setAlwaysOnTop(value)
    .catch(() => {});
}

export function minimizeAppWindow() {
  if (!isTauri()) return;
  getCurrentWindow()
    .minimize()
    .catch(() => {});
}

export function toggleMaximizeAppWindow() {
  if (!isTauri()) return;
  getCurrentWindow()
    .toggleMaximize()
    .catch(() => {});
}

/** Actually terminates the process - only call this once it's confirmed safe. */
export function quitApp() {
  if (!isTauri()) return;
  invoke("quit_app").catch(() => {});
}

/** Fired by the tray's "Sair" menu item instead of quitting outright, so the
 * frontend gets a chance to check for unsaved changes first. */
export function onQuitRequested(callback: () => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  listen("quit-requested", () => callback()).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
