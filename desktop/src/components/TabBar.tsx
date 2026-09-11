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
  const prevCount = useRef(tabs.length);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Which tab the grip is currently dragging, if any - used only to dim it a
  // little for feedback while the drag is in progress.
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

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

  // Reordering by hand instead of native HTML5 drag-and-drop, which turned
  // out unreliable inside WebView2 (kept fighting the row's own pan-to-scroll
  // handler no matter how the two were kept from triggering together). This
  // mirrors the plain mousedown/mousemove/mouseup approach DraggableSketch
  // already uses elsewhere in the app - full control, no browser DnD quirks.
  // Reorders live as the pointer crosses into a neighboring tab's slot,
  // rather than only on drop.
  const onGripMouseDown = (e: React.MouseEvent, startIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    let from = startIndex;
    setDraggingIndex(from);

    const onMove = (ev: MouseEvent) => {
      const row = rowRef.current;
      if (!row) return;
      const tabEls = Array.from(row.querySelectorAll<HTMLElement>(".tab"));
      let over = from;
      for (let idx = 0; idx < tabEls.length; idx++) {
        const r = tabEls[idx].getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX < r.right) {
          over = idx;
          break;
        }
      }
      if (over !== from) {
        onReorder(from, over);
        from = over;
        setDraggingIndex(over);
      }
    };
    const onUp = () => {
      setDraggingIndex(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
            className={"tab" + (i === activeTab ? " active" : "") + (i === draggingIndex ? " dragging" : "")}
            onClick={() => select(i)}
            onDoubleClick={() => setRenamingIndex(i)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(i);
              }
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
              onMouseDown={(e) => onGripMouseDown(e, i)}
              title="Arraste para reordenar"
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
