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
