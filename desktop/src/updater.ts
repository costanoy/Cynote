import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type { Update };

/** Null if there's no update, offline, or the GitHub Releases check failed. */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isTauri()) return null;
  try {
    return await check();
  } catch {
    return null;
  }
}

/** Downloads, installs, and restarts the app into the new version. */
export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
