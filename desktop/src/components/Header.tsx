import {
  ArchShape,
  ArchVines,
  CloseIcon,
  DrawIcon,
  LogoMedallion,
  MaximizeIcon,
  MenuIcon,
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
  const menuItems: { label: string; key?: string; run: () => void }[] = [
    { label: "Salvar como…", key: "Ctrl+Shift+S", run: onSaveAs },
    { label: "Exportar como .txt", run: onExportTxt },
    { label: "Localizar", key: "Ctrl+F", run: () => sendShortcut("f") },
    { label: "Substituir", key: "Ctrl+H", run: () => sendShortcut("h") },
    { label: "Ir para a linha", key: "Ctrl+G", run: () => sendShortcut("g") },
  ];

  return (
    <div className="cy-arch" data-tauri-drag-region>
      <ArchShape />
      <ArchVines />
      <div className="cy-lamp" />

      <div className="cy-arch-strip" data-tauri-drag-region>
        <div className="cy-brand">
          <LogoMedallion />
          <span className="cy-brand-name">Cynote</span>
        </div>
        <button
          className={"medallion" + (formatMenuOpen ? " active" : "")}
          onClick={onToggleFormatMenu}
          title="Menu"
        >
          <MenuIcon />
        </button>
        <div className="cy-spacer" data-tauri-drag-region />
        <button
          className={"medallion" + (drawingOpen ? " active" : "")}
          onClick={onToggleDrawing}
          title="Note Styling (Ctrl+Shift+D)"
        >
          <DrawIcon />
        </button>
        <button
          className={"medallion" + (settingsOpen ? " active" : "")}
          onClick={onToggleSettings}
          title={settingsOpen ? "Fechar configurações" : "Configurações"}
          aria-pressed={settingsOpen}
        >
          <SettingsIcon />
        </button>
        <button className={"medallion" + (pinned ? " active" : "")} onClick={onTogglePin} title="Fixar janela">
          <PinIcon />
        </button>
        <div className="cy-arch-divider" />
        <button className="medallion win" onClick={onMinimize} title="Minimizar">
          <MinimizeIcon />
        </button>
        <button className="medallion win" onClick={onToggleMaximize} title="Maximizar">
          <MaximizeIcon />
        </button>
        <button className="medallion win close" onClick={onClose} title="Fechar (vai para a bandeja)">
          <CloseIcon />
        </button>
      </div>

      {formatMenuOpen && (
        <>
          <div className="menu-backdrop" onClick={onCloseFormatMenu} />
          <div className="main-menu">
            <svg className="main-menu-vine" width="12" viewBox="0 0 12 200" preserveAspectRatio="none">
              <path
                d="M6 0 C1 25 11 50 6 75 C1 100 11 125 6 150 C1 175 11 190 6 200"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {menuItems.map((item, i) => (
              <button
                key={item.label}
                className="menu-item"
                style={{ animationDelay: 60 + i * 40 + "ms" }}
                onClick={() => {
                  onCloseFormatMenu();
                  item.run();
                }}
              >
                <span className="menu-item-label">{item.label}</span>
                {item.key && <span className="menu-item-key">{item.key}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
