export type SyncStatus = "synced" | "syncing" | "error";

export interface ForkedFrom {
  deviceId: string;
  noteId: string;
}

export interface TabData {
  id: string;
  title: string;
  body: string;
  favorite: boolean;
  sketches: number[];
  updatedAt: number;
  originDeviceId: string;
  forkedFrom?: ForkedFrom;
  /** Path of the .txt file this note is linked to, once saved there (Notepad-style: set on first Save/Save As, reused by later Ctrl+S). */
  txtPath?: string;
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
