import { invoke } from "@tauri-apps/api/core";
import type { DeviceIdentity } from "./types";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let cached: DeviceIdentity | null = null;

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (cached) return cached;
  if (!isTauri()) {
    cached = { deviceId: "local", deviceName: "Este dispositivo" };
    return cached;
  }
  cached = await invoke<DeviceIdentity>("get_device_identity");
  return cached;
}
