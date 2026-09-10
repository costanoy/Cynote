import type { SyncStatus } from "../types";
import { ReadingIcon } from "../icons";

type Props = {
  line: number;
  col: number;
  charCount: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  readingMode: boolean;
  onToggleReadingMode: () => void;
  syncStatus: SyncStatus;
  onSaveNow: () => void;
};

const SYNC_COLOR: Record<SyncStatus, string> = {
  synced: "var(--sync-synced)",
  syncing: "var(--sync-syncing)",
  error: "var(--sync-error)",
};

const SYNC_LABEL: Record<SyncStatus, string> = {
  synced: "Sincronizado",
  syncing: "Sincronizando…",
  error: "Erro de sincronização",
};

export function StatusBar({
  line,
  col,
  charCount,
  zoom,
  onZoomIn,
  onZoomOut,
  readingMode,
  onToggleReadingMode,
  syncStatus,
  onSaveNow,
}: Props) {
  return (
    <div className="status-bar">
      <span>
        Ln {line}, Col {col}
      </span>
      <span className="status-dot" />
      <span>{charCount} caracteres</span>
      <span className="status-dot" />
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button className="zoom-btn" onClick={onZoomOut}>
          −
        </button>
        <span style={{ minWidth: 34, textAlign: "center" }}>{zoom}%</span>
        <button className="zoom-btn" onClick={onZoomIn}>
          +
        </button>
      </div>
      <div style={{ flex: 1 }} />
      <button
        className={"reading-btn" + (readingMode ? " active" : "")}
        onClick={onToggleReadingMode}
        title="Modo leitura"
      >
        <ReadingIcon />
      </button>
      <button
        className="sync-dot-btn"
        onClick={onSaveNow}
        title={`${SYNC_LABEL[syncStatus]} — clique para salvar agora (Ctrl+S)`}
      >
        <span className="sync-dot" style={{ background: SYNC_COLOR[syncStatus] }} />
      </button>
    </div>
  );
}
