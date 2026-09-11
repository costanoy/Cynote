import { useEffect, useRef, useState } from "react";
import type { TabData } from "../types";
import { ChevronDownIcon, GripIcon, TabCloseIcon } from "../icons";

type Props = {
  tabs: TabData[];
  activeTab: number;
  tabsMenuOpen: boolean;
  onSelect: (i: number) => void;
  onClose: (i: number) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRename: (i: number, title: string) => void;
  isDirty: (tab: TabData) => boolean;
};

export function TabBar({
  tabs,
  activeTab,
  tabsMenuOpen,
  onSelect,
  onClose,
  onReorder,
  onAdd,
  onToggleMenu,
  onCloseMenu,
  onRename,
  isDirty,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panMoved = useRef(false);
  const panStartX = useRef(0);
  const lastPanX = useRef(0);
  const dragFromIndex = useRef<number | null>(null);
  const prevCount = useRef(tabs.length);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tabs.length > prevCount.current && rowRef.current) {
      rowRef.current.scrollLeft = rowRef.current.scrollWidth;
    }
    prevCount.current = tabs.length;
  }, [tabs.length]);

  useEffect(() => {
    if (renamingIndex !== null) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingIndex]);

  const onRowDown = (e: React.MouseEvent) => {
    isPanning.current = true;
    panMoved.current = false;
    panStartX.current = e.clientX;
    lastPanX.current = e.clientX;
  };
  // Scrolls by the *incremental* mouse delta each move, against whatever
  // scrollLeft actually is right now - not a fixed "scrollLeft at mousedown
  // minus total delta" baseline. That baseline goes stale the instant the
  // browser clamps scrollLeft at either end, so dragging further in the same
  // direction keeps computing a target past the clamp; reversing direction
  // then has to "use up" that whole overshoot before the row visibly moves
  // again, which is the sticking/dead-zone feeling at the ends.
  const onRowMove = (e: React.MouseEvent) => {
    if (!isPanning.current || !rowRef.current) return;
    if (Math.abs(e.clientX - panStartX.current) > 4) panMoved.current = true;
    rowRef.current.scrollLeft -= e.clientX - lastPanX.current;
    lastPanX.current = e.clientX;
  };
  const onRowUp = () => {
    isPanning.current = false;
  };

  const select = (i: number) => {
    if (panMoved.current) {
      panMoved.current = false;
      return;
    }
    onSelect(i);
  };

  const commitRename = (i: number, value: string) => {
    setRenamingIndex(null);
    const title = value.trim();
    if (title) onRename(i, title);
  };

  return (
    <div className="tab-bar">
      <div
        className="tab-row"
        ref={rowRef}
        onMouseDown={onRowDown}
        onMouseMove={onRowMove}
        onMouseUp={onRowUp}
        onMouseLeave={onRowUp}
      >
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            className={"tab" + (i === activeTab ? " active" : "")}
            onClick={() => select(i)}
            onDoubleClick={() => setRenamingIndex(i)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(i);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFromIndex.current !== null) onReorder(dragFromIndex.current, i);
              dragFromIndex.current = null;
            }}
          >
            {renamingIndex === i ? (
              <input
                ref={renameInputRef}
                className="tab-rename-input"
                defaultValue={tab.title}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => commitRename(i, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(i, e.currentTarget.value);
                  else if (e.key === "Escape") setRenamingIndex(null);
                }}
              />
            ) : (
              <span className="tab-label">{tab.title}</span>
            )}
            {renamingIndex !== i && isDirty(tab) && (
              <span className="tab-dirty-dot" title="Alterações não salvas" />
            )}
            <span
              className="tab-close"
              title="Fechar (Ctrl+W)"
              onClick={(e) => {
                e.stopPropagation();
                onClose(i);
              }}
            >
              <TabCloseIcon />
            </span>
            <span
              className="tab-move"
              draggable
              // Without this, the mousedown that starts a native drag also
              // bubbles up to the row's own pan handler below, which starts
              // scrolling the row out from under the drag at the same time -
              // fighting the browser's native drag-and-drop and making the
              // handle feel unresponsive.
              onMouseDown={(e) => e.stopPropagation()}
              onDragStart={(e) => {
                dragFromIndex.current = i;
                e.dataTransfer.effectAllowed = "move";
              }}
              title="Arraste para reordenar ou mover"
            >
              <GripIcon />
            </span>
          </div>
        ))}
      </div>
      <div style={{ position: "relative", flex: "none" }}>
        <button className="chevron-btn" onClick={onToggleMenu} title="Todas as guias">
          <ChevronDownIcon />
        </button>
        {tabsMenuOpen && (
          <>
            <div className="tabs-menu-backdrop" onClick={onCloseMenu} />
            <div className="tabs-menu">
              {tabs.map((tab, i) => (
                <div
                  key={tab.id}
                  className={"tabs-menu-row" + (i === activeTab ? " active" : "")}
                  onClick={() => {
                    onSelect(i);
                    onCloseMenu();
                  }}
                >
                  <span className={"tabs-menu-dot" + (tab.favorite ? " favorite" : "")} />
                  <span
                    style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {tab.title}
                  </span>
                  {isDirty(tab) && <span className="tab-dirty-dot" title="Alterações não salvas" />}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <button className="plus-btn" onClick={onAdd} title="Nova guia (Ctrl+N ou Ctrl+T)">
        +
      </button>
    </div>
  );
}
