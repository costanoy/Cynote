import {
  CloseIcon,
  DrawIcon,
  ExportIcon,
  FormatIcon,
  LogoIcon,
  MaximizeIcon,
  MinimizeIcon,
  PinIcon,
  SettingsIcon,
} from "../icons";

type Props = {
  formatMenuOpen: boolean;
  onToggleFormatMenu: () => void;
  onCloseFormatMenu: () => void;
  drawingOpen: boolean;
  onToggleDrawing: () => void;
  onToggleSettings: () => void;
  onExportTxt: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

export function Header({
  formatMenuOpen,
  onToggleFormatMenu,
  onCloseFormatMenu,
  drawingOpen,
  onToggleDrawing,
  onToggleSettings,
  onExportTxt,
  pinned,
  onTogglePin,
  onMinimize,
  onToggleMaximize,
  onClose,
}: Props) {
  return (
    <div className="header" data-tauri-drag-region>
      <LogoIcon />
      <div className="format-menu-wrap">
        <button className="icon-btn" onClick={onToggleFormatMenu} title="Formatação">
          <FormatIcon />
        </button>
        {formatMenuOpen && (
          <>
            <div className="tabs-menu-backdrop" onClick={onCloseFormatMenu} />
            <div className="format-menu">
              <div className="format-item" onClick={onCloseFormatMenu}>
                <strong>B</strong>
                <span>Negrito</span>
                <span className="format-key">Ctrl+B</span>
              </div>
              <div className="format-item" onClick={onCloseFormatMenu}>
                <em>i</em>
                <span>Itálico</span>
                <span className="format-key">Ctrl+I</span>
              </div>
              <div className="format-divider" />
              <div
                className="format-item"
                onClick={() => {
                  onExportTxt();
                  onCloseFormatMenu();
                }}
              >
                <ExportIcon />
                <span>Salvar como .txt</span>
                <span className="format-key">Ctrl+Shift+S</span>
              </div>
            </div>
          </>
        )}
      </div>
      <button className={"draw-btn" + (drawingOpen ? " active" : "")} onClick={onToggleDrawing} title="Note Styling">
        <DrawIcon />
      </button>
      <div style={{ flex: 1 }} />
      <button className="icon-btn" onClick={onToggleSettings} title="Configurações">
        <SettingsIcon />
      </button>
      <button
        className={"icon-btn" + (pinned ? " active" : "")}
        style={pinned ? { color: "var(--accent-dark)" } : undefined}
        onClick={onTogglePin}
        title="Fixar janela"
      >
        <PinIcon />
      </button>
      <button className="icon-btn" onClick={onMinimize} title="Minimizar">
        <MinimizeIcon />
      </button>
      <button className="icon-btn" onClick={onToggleMaximize} title="Maximizar">
        <MaximizeIcon />
      </button>
      <button className="icon-btn" onClick={onClose} title="Fechar">
        <CloseIcon />
      </button>
    </div>
  );
}
