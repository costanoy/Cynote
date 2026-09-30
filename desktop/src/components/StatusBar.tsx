import type { SyncStatus } from "../types";
import { ReadingIcon, SyncFlower } from "../icons";

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
      <span className="status-chars">{charCount} caracteres</span>
      <div className="cy-spacer" />
      <div className="status-zoom">
        <button className="zoom-btn" onClick={onZoomOut} title="Diminuir zoom">
          −
        </button>
        <span className="zoom-value">{zoom}%</span>
        <button className="zoom-btn" onClick={onZoomIn} title="Aumentar zoom">
          +
        </button>
      </div>
      <button
        className={"reading-btn" + (readingMode ? " active" : "")}
        onClick={onToggleReadingMode}
        title="Modo leitura"
      >
        <ReadingIcon />
      </button>
      <button
        className={"sync-btn" + (syncStatus === "error" ? " error" : "")}
        onClick={onSaveNow}
        title={
          syncStatus === "error"
            ? "Erro de sincronização — clique para tentar de novo"
            : `${SYNC_LABEL[syncStatus]} — clique para salvar agora (Ctrl+S)`
        }
      >
        <SyncFlower status={syncStatus} />
        <span className="sync-label">{SYNC_LABEL[syncStatus]}</span>
      </button>
    </div>
  );
}
