import { getCurrentWindow } from "@tauri-apps/api/window";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function hideAppWindow() {
  if (!isTauri()) return;
  getCurrentWindow()
    .hide()
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
