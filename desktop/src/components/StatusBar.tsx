import { ReadingIcon, SyncGlyph, WrapIcon } from "../icons";

export type SyncPhase = "off" | "syncing" | "synced" | "offline" | "denied" | "error";
export type SyncView = { phase: SyncPhase; lastSyncAt?: number; message?: string };

type Props = {
  line: number;
  col: number;
  /** Extra cursors and selected characters, VS Code style. */
  selections?: number;
  selectedChars?: number;
  charCount: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset?: () => void;
  readingMode: boolean;
  onToggleReadingMode: () => void;
  wordWrap?: boolean;
  onToggleWordWrap?: () => void;
  /** v2 sync state; the old three-word status still works. */
  syncStatus: SyncView | "synced" | "syncing" | "error";
  onSyncClick?: () => void;
  /** Older name for onSyncClick. */
  onSaveNow?: () => void;
};

const SYNC_LABEL: Record<SyncPhase, string> = {
  off: "Sincronização desligada",
  syncing: "Sincronizando…",
  synced: "Sincronizado",
  offline: "Sem conexão",
  denied: "Acesso recusado",
  error: "Erro ao sincronizar",
};

function toView(s: Props["syncStatus"]): SyncView {
  return typeof s === "string" ? { phase: s } : s;
}

function syncTitle(v: SyncView): string {
  const time =
    v.lastSyncAt !== undefined
      ? new Date(v.lastSyncAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : null;
  switch (v.phase) {
    case "off":
      return "Sincronização com o celular desligada. Clique para ligar.";
    case "synced":
      return (time ? `Sincronizado às ${time}.` : "Sincronizado.") + " Clique para sincronizar agora.";
    case "syncing":
      return "Sincronizando as notas…";
    case "offline":
      return "Sem conexão com a internet. Tento de novo sozinho. Clique para tentar agora.";
    case "denied":
      return "O servidor recusou o acesso. Clique para ver os detalhes.";
    case "error":
      return (v.message ? `Não deu para sincronizar: ${v.message}.` : "Não deu para sincronizar.") + " Clique para tentar de novo.";
  }
}

export function StatusBar({
  line,
  col,
  selections = 1,
  selectedChars = 0,
  charCount,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  readingMode,
  onToggleReadingMode,
  wordWrap,
  onToggleWordWrap,
  syncStatus,
  onSyncClick,
  onSaveNow,
}: Props) {
  const sync = toView(syncStatus);
  const onSync = onSyncClick ?? onSaveNow;
  const position =
    selections > 1
      ? `${selections} cursores`
      : `Ln ${line}, Col ${col}` + (selectedChars > 0 ? ` (${selectedChars} selecionado${selectedChars === 1 ? "" : "s"})` : "");

  return (
    <footer className="status-bar">
      <button className="status-item sync" data-phase={sync.phase} onClick={onSync} title={syncTitle(sync)}>
        <SyncGlyph phase={sync.phase} />
        <span>{SYNC_LABEL[sync.phase]}</span>
      </button>

      <div className="cy-spacer" />

      <span className="status-item static" aria-live="polite">
        {position}
      </span>
      <span className="status-item static">
        {charCount} {charCount === 1 ? "caractere" : "caracteres"}
      </span>
      {onToggleWordWrap && (
        <button
          className={"status-item icon" + (wordWrap ? " on" : "")}
          onClick={onToggleWordWrap}
          title={wordWrap ? "Quebra de linha ligada (Alt+Z)" : "Quebra de linha desligada (Alt+Z)"}
          aria-pressed={!!wordWrap}
        >
          <WrapIcon size={14} />
        </button>
      )}
      <div className="status-zoom" role="group" aria-label="Zoom">
        <button className="status-item icon" onClick={onZoomOut} title="Diminuir (Ctrl+-)">
          −
        </button>
        <button
          className="status-item zoom-value"
          onClick={onZoomReset}
          title="Voltar para 100% (Ctrl+0)"
          disabled={!onZoomReset}
        >
          {zoom}%
        </button>
        <button className="status-item icon" onClick={onZoomIn} title="Aumentar (Ctrl+=)">
          +
        </button>
      </div>
      <button
        className={"status-item icon" + (readingMode ? " on" : "")}
        onClick={onToggleReadingMode}
        title="Modo leitura"
        aria-pressed={readingMode}
      >
        <ReadingIcon size={14} />
      </button>
    </footer>
  );
}
