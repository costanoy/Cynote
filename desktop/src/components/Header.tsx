import type { ReactNode } from "react";
import {
  AppMark,
  CaptionCloseIcon,
  DrawIcon,
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
  /** Extra menu entries (view toggles, commands) supplied by the app. */
  extraMenuItems?: MenuEntry[];
  /** The note tabs, drawn inside the title strip. */
  children?: ReactNode;
};

export type MenuEntry = { label: string; key?: string; checked?: boolean; run: () => void; separatorBefore?: boolean };

// The editor owns find/replace/go-to state; the menu entries just press its shortcut.
const sendShortcut = (key: string) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }));

/** The title strip: the app mark (which opens the menu), the note tabs, the
 * note tools and the Windows caption buttons, all on one 36px band. */
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
  extraMenuItems = [],
  children,
}: Props) {
  const menuItems: MenuEntry[] = [
    { label: "Salvar como…", key: "Ctrl+Shift+S", run: onSaveAs },
    { label: "Exportar como .txt", run: onExportTxt },
    { label: "Localizar", key: "Ctrl+F", run: () => sendShortcut("f"), separatorBefore: true },
    { label: "Substituir", key: "Ctrl+H", run: () => sendShortcut("h") },
    { label: "Ir para a linha", key: "Ctrl+G", run: () => sendShortcut("g") },
    ...extraMenuItems,
  ];

  return (
    <header className="titlebar" data-tauri-drag-region>
      <button
        className={"icon-btn app-mark" + (formatMenuOpen ? " active" : "")}
        onClick={onToggleFormatMenu}
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={formatMenuOpen}
      >
        <AppMark />
      </button>

      {children}

      <div className="titlebar-drag" data-tauri-drag-region />

      <div className="titlebar-group">
        <button
          className="icon-btn"
          onClick={onToggleDrawing}
          title="Desenhar na nota (Ctrl+Shift+D)"
          aria-pressed={drawingOpen}
        >
          <DrawIcon />
        </button>
        <button
          className="icon-btn"
          onClick={onToggleSettings}
          title={settingsOpen ? "Fechar configurações" : "Configurações"}
          aria-pressed={settingsOpen}
        >
          <SettingsIcon />
        </button>
        <button
          className="icon-btn"
          onClick={onTogglePin}
          title={pinned ? "Soltar a janela" : "Fixar por cima das outras janelas"}
          aria-pressed={pinned}
        >
          <PinIcon />
        </button>
      </div>
      <button className="win-btn" onClick={onMinimize} title="Minimizar">
        <MinimizeIcon />
      </button>
      <button className="win-btn" onClick={onToggleMaximize} title="Maximizar">
        <MaximizeIcon />
      </button>
      <button className="win-btn close" onClick={onClose} title="Fechar (o Cynote fica na bandeja)">
        <CaptionCloseIcon />
      </button>

      {formatMenuOpen && (
        <>
          <div className="menu-backdrop" onClick={onCloseFormatMenu} />
          <div className="menu main-menu" role="menu">
            {menuItems.map((item) => (
              <div key={item.label} className="menu-entry">
                {item.separatorBefore && <div className="menu-sep" />}
                <button
                  className={"menu-item" + (item.checked !== undefined ? " checkable" : "")}
                  role={item.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
                  aria-checked={item.checked}
                  onClick={() => {
                    onCloseFormatMenu();
                    item.run();
                  }}
                >
                  {item.checked !== undefined && <span className={"menu-check" + (item.checked ? " on" : "")} />}
                  <span className="menu-item-label">{item.label}</span>
                  {item.key && <span className="menu-item-key">{item.key}</span>}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </header>
  );
}
