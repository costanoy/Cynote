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
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onSaveAs: () => void;
  onExportTxt: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

// The editor owns find/replace/go-to state; the menu entries just press its shortcut.
const sendShortcut = (key: string) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }));

export function Header({
  formatMenuOpen,
  onToggleFormatMenu,
  onCloseFormatMenu,
  drawingOpen,
  onToggleDrawing,
  settingsOpen,
  onToggleSettings,
  onSaveAs,
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
              <div
                className="format-item"
                onClick={() => {
                  onSaveAs();
                  onCloseFormatMenu();
                }}
              >
                <ExportIcon />
                <span>Salvar como…</span>
                <span className="format-key">Ctrl+Shift+S</span>
              </div>
              <div
                className="format-item"
                onClick={() => {
                  onExportTxt();
                  onCloseFormatMenu();
                }}
              >
                <ExportIcon />
                <span>Exportar como .txt</span>
              </div>
              <div className="format-divider" />
              <div
                className="format-item"
                onClick={() => {
                  onCloseFormatMenu();
                  sendShortcut("f");
                }}
              >
                <span>Localizar</span>
                <span className="format-key">Ctrl+F</span>
              </div>
              <div
                className="format-item"
                onClick={() => {
                  onCloseFormatMenu();
                  sendShortcut("h");
                }}
              >
                <span>Substituir</span>
                <span className="format-key">Ctrl+H</span>
              </div>
              <div
                className="format-item"
                onClick={() => {
                  onCloseFormatMenu();
                  sendShortcut("g");
                }}
              >
                <span>Ir para a linha</span>
                <span className="format-key">Ctrl+G</span>
              </div>
            </div>
          </>
        )}
      </div>
      <button
        className={"draw-btn" + (drawingOpen ? " active" : "")}
        onClick={onToggleDrawing}
        title="Note Styling (Ctrl+Shift+D)"
      >
        <DrawIcon />
      </button>
      <div style={{ flex: 1 }} />
      <button
        className={"icon-btn" + (settingsOpen ? " active" : "")}
        onClick={onToggleSettings}
        title={settingsOpen ? "Fechar configurações" : "Configurações"}
        aria-pressed={settingsOpen}
      >
        <SettingsIcon />
      </button>
      <button
        className={"icon-btn" + (pinned ? " active" : "")}
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
