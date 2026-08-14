import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function isAutoStartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await isEnabled();
  } catch {
    return false;
  }
}

export async function setAutoStartEnabled(value: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    if (value) await enable();
    else await disable();
  } catch {
    // best-effort
  }
}
