import { useEffect, useRef, useState } from "react";
import "./theme.css";
import "./styles.css";
import type { NoteSketch, TabData } from "./types";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { SettingsView } from "./components/SettingsView";
import { ContentArea } from "./components/ContentArea";
import { DrawingOverlay } from "./components/DrawingOverlay";
import { StatusBar } from "./components/StatusBar";
import { hideAppWindow, minimizeAppWindow, setAppAlwaysOnTop, toggleMaximizeAppWindow } from "./tauriWindow";
import { isAutoStartEnabled, setAutoStartEnabled } from "./autostart";
import { saveNoteAsTxt, writeTxtFile } from "./export";
import { onOpenNoteFile, readTxtFile } from "./dashboardApi";
import { loadNotes, saveNotes } from "./notesStore";
import { getDeviceIdentity } from "./deviceIdentity";
import { onPairingRequest, respondToPairing, listReachableTrustedDevices, fetchPeerNotes } from "./sync";
import { mergeFromPeer } from "./merge";
import { loadBookkeeping, saveBookkeeping } from "./bookkeeping";
import type { PeerInfo } from "./types";

const SYNC_INTERVAL_MS = 25000;

function makeBlankTab(deviceId: string): TabData {
  return {
    id: "n" + Date.now(),
    title: "Nova nota",
    body: "",
    favorite: false,
    sketches: [],
    updatedAt: Date.now(),
    originDeviceId: deviceId,
    titleIsCustom: false,
  };
}

const AUTO_TITLE_MAX_LEN = 40;

// Notepad-style: until the tab is explicitly named (rename, or Save/Save As),
// its title is just a live suggestion made of the first words typed.
function deriveTitleFromBody(body: string): string {
  const firstLine = body.split(/\r?\n/, 1)[0].trim();
  if (!firstLine) return "Nova nota";
  return firstLine.length > AUTO_TITLE_MAX_LEN
    ? firstLine.slice(0, AUTO_TITLE_MAX_LEN).trimEnd() + "…"
    : firstLine;
}

function basenameNoExt(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.[^./\\]+$/, "");
}

const AUTOSAVE_DELAY_MS = 1500;
const SPELLCHECK_KEY = "cynote-spellcheck-enabled";

function loadSpellCheckPref(): boolean {
  try {
    const raw = localStorage.getItem(SPELLCHECK_KEY);
    return raw === null ? false : raw === "true";
  } catch {
    return false;
  }
}

function App() {
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error">("synced");
  const [zoom, setZoom] = useState(100);
  const [drawColor, setDrawColor] = useState("#ff8c3a");
  const [pinned, setPinned] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pairingRequests, setPairingRequests] = useState<PeerInfo[]>([]);
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(loadSpellCheckPref);
  const [autoStartEnabled, setAutoStartOn] = useState(false);

  useEffect(() => {
    // The first-run enable itself happens on the Rust side (so it still runs
    // even if the webview fails to load) - this just reflects current state.
    isAutoStartEnabled().then(setAutoStartOn);
  }, []);

  const toggleAutoStart = () => {
    const next = !autoStartEnabled;
    setAutoStartOn(next);
    setAutoStartEnabled(next);
  };

  const toggleSpellCheck = () => {
    setSpellCheckEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem(SPELLCHECK_KEY, String(next));
      } catch {
        // best-effort
      }
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    setAppAlwaysOnTop(pinned);
  }, [pinned]);

  useEffect(() => {
    return onPairingRequest((peer) => {
      setPairingRequests((prev) => (prev.some((p) => p.deviceId === peer.deviceId) ? prev : [...prev, peer]));
    });
  }, []);

  const respondPairing = (deviceId: string, accept: boolean) => {
    respondToPairing(deviceId, accept);
    setPairingRequests((prev) => prev.filter((p) => p.deviceId !== deviceId));
  };

  const tabsRef = useRef<TabData[]>(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const runSyncCycle = async (myDeviceId: string) => {
    const peers = await listReachableTrustedDevices();
    if (peers.length === 0) return;

    let book = loadBookkeeping();
    let currentTabs = tabsRef.current;
    let anyChange = false;

    for (const peer of peers) {
      const resp = await fetchPeerNotes(peer);
      if (!resp) continue;
      const result = mergeFromPeer(
        currentTabs,
        resp.notes as TabData[],
        peer.deviceId,
        peer.deviceName,
        myDeviceId,
        book
      );
      currentTabs = result.tabs;
      book = result.bookkeeping;
      if (result.changed) anyChange = true;
    }

    saveBookkeeping(book);
    if (anyChange) setTabs(currentTabs);
  };

  useEffect(() => {
    getDeviceIdentity().then(async (identity) => {
      setDeviceId(identity.deviceId);
      const saved = await loadNotes(identity.deviceId);
      setTabs(saved && saved.length > 0 ? saved : [makeBlankTab(identity.deviceId)]);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded || !deviceId) return;
    runSyncCycle(deviceId);
    const interval = setInterval(() => runSyncCycle(deviceId), SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, deviceId]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Called after a Save/Save As picks a real file - like Notepad, the tab
  // title locks to that filename from now on (no longer auto-suggested).
  const setTabSavedPath = (index: number, path: string) => {
    setTabs((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], txtPath: path, title: basenameNoExt(path), titleIsCustom: true };
      return next;
    });
  };

  // Notepad-style save: an internal save always happens, and once a note is
  // linked to a .txt file (via a prior Save/Save As), Ctrl+S keeps that file
  // in sync too - silently if already linked, prompting once if not.
  const saveNow = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSyncStatus("syncing");
    saveNotes(tabsRef.current).then(async () => {
      setSyncStatus("synced");
      if (deviceId) runSyncCycle(deviceId);

      const i = activeTabRef.current;
      const tab = tabsRef.current[i];
      if (tab.txtPath) {
        writeTxtFile(tab.txtPath, tab.title, tab.body);
      } else {
        const path = await saveNoteAsTxt(tab.title, tab.body);
        if (path) setTabSavedPath(i, path);
      }
    });
  };

  useEffect(() => {
    if (!loaded) return;
    setSyncStatus("syncing");
    saveTimerRef.current = setTimeout(() => {
      saveNotes(tabs).then(() => {
        setSyncStatus("synced");
        if (deviceId) runSyncCycle(deviceId);
      });
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, loaded]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          exportActiveNoteTxt();
        } else {
          saveNow();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setDrawingOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const selectTab = (i: number) => {
    setActiveTab(i);
    setTabsMenuOpen(false);
  };

  const reorderTabs = (from: number, to: number) => {
    if (from === to || from == null) return;
    setTabs((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setActiveTab((prev) => {
      if (prev === from) return to;
      if (from < prev && to >= prev) return prev - 1;
      if (from > prev && to <= prev) return prev + 1;
      return prev;
    });
  };

  const addTab = () => {
    if (!deviceId) return;
    setTabs((prev) => [...prev, makeBlankTab(deviceId)]);
    setActiveTab(tabs.length);
  };

  // Reached from the Dashboard window: focus the tab if this file is already
  // open, otherwise read it fresh and open it linked (Ctrl+S keeps saving here).
  const openNoteFile = async (path: string) => {
    const existingIndex = tabsRef.current.findIndex((t) => t.txtPath === path);
    if (existingIndex !== -1) {
      setActiveTab(existingIndex);
      return;
    }
    if (!deviceId) return;
    const { title, body } = await readTxtFile(path);
    const note: TabData = {
      id: "n" + Date.now(),
      title,
      body,
      favorite: false,
      sketches: [],
      updatedAt: Date.now(),
      originDeviceId: deviceId,
      txtPath: path,
      titleIsCustom: true,
    };
    const newIndex = tabsRef.current.length;
    setTabs((prev) => [...prev, note]);
    setActiveTab(newIndex);
  };

  useEffect(() => {
    return onOpenNoteFile((path) => {
      openNoteFile(path);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const closeTab = (i: number) => {
    if (tabs.length <= 1) return;

    const removeTab = () => {
      setTabs((prev) => {
        const next = prev.slice();
        next.splice(i, 1);
        return next;
      });
      setActiveTab((prev) => {
        if (i === prev) return Math.max(0, i - 1);
        if (i < prev) return prev - 1;
        return prev;
      });
    };

    // Never let a tab vanish before its latest edits actually reach disk:
    // flush a pending debounced autosave first, then close.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      setSyncStatus("syncing");
      saveNotes(tabsRef.current).then(() => {
        setSyncStatus("synced");
        if (deviceId) runSyncCycle(deviceId);
        removeTab();
      });
    } else {
      removeTab();
    }
  };

  const renameTab = (i: number, title: string) => {
    setTabs((prev) => {
      const next = prev.slice();
      next[i] = { ...next[i], title, titleIsCustom: true, updatedAt: Date.now() };
      return next;
    });
  };

  const onBodyInput = (value: string) => {
    setTabs((prev) => {
      const next = prev.slice();
      const tab = next[activeTab];
      next[activeTab] = {
        ...tab,
        body: value,
        updatedAt: Date.now(),
        title: tab.titleIsCustom ? tab.title : deriveTitleFromBody(value),
      };
      return next;
    });
  };

  // Notepad-style "Save As": always prompts, and links this note to the chosen file for future Ctrl+S.
  const exportActiveNoteTxt = async () => {
    const i = activeTabRef.current;
    const tab = tabsRef.current[i];
    const path = await saveNoteAsTxt(tab.title, tab.body);
    if (path) setTabSavedPath(i, path);
  };

  const SKETCH_MAX_WIDTH = 220;

  const insertSketch = (canvas: HTMLCanvasElement) => {
    const aspect = canvas.height / canvas.width;
    const width = Math.min(SKETCH_MAX_WIDTH, canvas.width);
    const height = Math.round(width * aspect);

    setTabs((prev) => {
      const next = prev.slice();
      const tab = next[activeTab];
      const cascade = (tab.sketches.length % 6) * 22;
      const sketch: NoteSketch = {
        id: "sk" + Date.now(),
        dataUrl: canvas.toDataURL("image/png"),
        x: 16 + cascade,
        y: 16 + cascade,
        width,
        height,
      };
      next[activeTab] = {
        ...tab,
        sketches: [...tab.sketches, sketch],
        updatedAt: Date.now(),
      };
      return next;
    });
    setDrawingOpen(false);
  };

  const moveSketch = (sketchId: string, x: number, y: number) => {
    setTabs((prev) => {
      const next = prev.slice();
      const tab = next[activeTab];
      next[activeTab] = {
        ...tab,
        sketches: tab.sketches.map((s) => (s.id === sketchId ? { ...s, x, y } : s)),
        updatedAt: Date.now(),
      };
      return next;
    });
  };

  if (!loaded || tabs.length === 0) {
    return <div className="cy-panel" />;
  }

  const charCount = tabs[activeTab].body.length;

  return (
    <div className="cy-panel">
      <Header
        formatMenuOpen={formatMenuOpen}
        onToggleFormatMenu={() => setFormatMenuOpen((v) => !v)}
        onCloseFormatMenu={() => setFormatMenuOpen(false)}
        drawingOpen={drawingOpen}
        onToggleDrawing={() => setDrawingOpen((v) => !v)}
        onToggleSettings={() => setShowSettings((v) => !v)}
        onExportTxt={exportActiveNoteTxt}
        pinned={pinned}
        onTogglePin={() => setPinned((v) => !v)}
        onMinimize={minimizeAppWindow}
        onToggleMaximize={toggleMaximizeAppWindow}
        onClose={hideAppWindow}
      />

      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        tabsMenuOpen={tabsMenuOpen}
        onSelect={selectTab}
        onClose={closeTab}
        onReorder={reorderTabs}
        onAdd={addTab}
        onToggleMenu={() => setTabsMenuOpen((v) => !v)}
        onCloseMenu={() => setTabsMenuOpen(false)}
        onRename={renameTab}
      />

      {showSettings ? (
        <SettingsView
          darkMode={darkMode}
          onBack={() => setShowSettings(false)}
          onToggleDarkMode={() => setDarkMode((v) => !v)}
          spellCheckEnabled={spellCheckEnabled}
          onToggleSpellCheck={toggleSpellCheck}
          autoStartEnabled={autoStartEnabled}
          onToggleAutoStart={toggleAutoStart}
        />
      ) : (
        <div className="content-shell">
          <div
            className={"content-wrap" + (readingMode ? " reading" : "")}
            style={{
              fontSize: (readingMode ? 15 : 14.5) * (zoom / 100) + "px",
              lineHeight: readingMode ? 1.85 : 1.65,
              letterSpacing: readingMode ? "0.01em" : "0.02em",
            }}
          >
            <ContentArea
              key={tabs[activeTab].id}
              body={tabs[activeTab].body}
              sketches={tabs[activeTab].sketches}
              spellCheck={spellCheckEnabled}
              onBodyInput={onBodyInput}
              onMoveSketch={moveSketch}
            />
          </div>

          <DrawingOverlay
            open={drawingOpen}
            darkMode={darkMode}
            drawColor={drawColor}
            onSetColor={setDrawColor}
            onCancel={() => setDrawingOpen(false)}
            onInsert={insertSketch}
          />
        </div>
      )}

      <StatusBar
        charCount={charCount}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(200, z + 10))}
        onZoomOut={() => setZoom((z) => Math.max(50, z - 10))}
        readingMode={readingMode}
        onToggleReadingMode={() => setReadingMode((v) => !v)}
        syncStatus={syncStatus}
        onSaveNow={saveNow}
      />

      {pairingRequests.length > 0 && (
        <div className="pairing-modal-backdrop">
          <div className="pairing-modal">
            <div className="pairing-modal-title heading-font">Sincronizar dispositivo</div>
            <div className="pairing-modal-text">
              Sincronizar com "{pairingRequests[0].deviceName}"?
            </div>
            <div className="pairing-modal-actions">
              <button className="cancel-btn" onClick={() => respondPairing(pairingRequests[0].deviceId, false)}>
                Recusar
              </button>
              <button className="insert-btn" onClick={() => respondPairing(pairingRequests[0].deviceId, true)}>
                Aceitar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
