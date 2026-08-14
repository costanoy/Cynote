import { useEffect, useRef, useState } from "react";
import "./theme.css";
import "./styles.css";
import type { TabData } from "./types";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { SettingsView } from "./components/SettingsView";
import { ContentArea } from "./components/ContentArea";
import { DrawingOverlay } from "./components/DrawingOverlay";
import { StatusBar } from "./components/StatusBar";
import { hideAppWindow, minimizeAppWindow, setAppAlwaysOnTop, toggleMaximizeAppWindow } from "./tauriWindow";
import { isAutoStartEnabled, setAutoStartEnabled } from "./autostart";
import { exportNoteAsTxt } from "./export";
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
  };
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

  const saveNow = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSyncStatus("syncing");
    saveNotes(tabsRef.current).then(() => {
      setSyncStatus("synced");
      if (deviceId) runSyncCycle(deviceId);
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
        saveNow();
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

  const closeTab = (i: number) => {
    if (tabs.length <= 1) return;
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

  const renameTab = (i: number, title: string) => {
    setTabs((prev) => {
      const next = prev.slice();
      next[i] = { ...next[i], title, updatedAt: Date.now() };
      return next;
    });
  };

  const onBodyInput = (value: string) => {
    setTabs((prev) => {
      const next = prev.slice();
      next[activeTab] = { ...next[activeTab], body: value, updatedAt: Date.now() };
      return next;
    });
  };

  const exportActiveNoteTxt = () => {
    const tab = tabs[activeTab];
    exportNoteAsTxt(tab.title, tab.body);
  };

  const insertSketch = (_canvas: HTMLCanvasElement) => {
    setTabs((prev) => {
      const next = prev.slice();
      next[activeTab] = {
        ...next[activeTab],
        sketches: [...next[activeTab].sketches, Date.now()],
        updatedAt: Date.now(),
      };
      return next;
    });
    setDrawingOpen(false);
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
              fontSize: (readingMode ? 15 : 13.5) * (zoom / 100) + "px",
              lineHeight: readingMode ? 1.85 : 1.55,
              letterSpacing: readingMode ? "0.01em" : "normal",
            }}
          >
            <ContentArea
              key={tabs[activeTab].id}
              body={tabs[activeTab].body}
              sketches={tabs[activeTab].sketches}
              spellCheck={spellCheckEnabled}
              onBodyInput={onBodyInput}
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
