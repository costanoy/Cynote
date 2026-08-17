export type SyncStatus = "synced" | "syncing" | "error";

export interface ForkedFrom {
  deviceId: string;
  noteId: string;
}

/** A drawing inserted from Note Styling, positioned freely within the note. */
export interface NoteSketch {
  id: string;
  /** PNG data URL of the drawing. */
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TabData {
  id: string;
  title: string;
  body: string;
  favorite: boolean;
  sketches: NoteSketch[];
  updatedAt: number;
  originDeviceId: string;
  forkedFrom?: ForkedFrom;
  /** Path of the .cynote (or imported .txt/.md) file this note is linked to, once saved there (Notepad-style: set on first Save/Save As, reused by later Ctrl+S). */
  filePath?: string;
  /** True once the title was explicitly set (renamed, or saved to a file) - until then, the title is just a live suggestion derived from the first line typed. */
  titleIsCustom?: boolean;
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
