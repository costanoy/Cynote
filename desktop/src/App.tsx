import { useEffect, useReducer, useRef, useState } from "react";
import "./theme.css";
import "./styles.css";
import type { NoteSketch, TabData } from "./types";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { SettingsView } from "./components/SettingsView";
import { ContentArea } from "./components/ContentArea";
import { DrawingOverlay } from "./components/DrawingOverlay";
import { StatusBar } from "./components/StatusBar";
import {
  hideAppWindow,
  minimizeAppWindow,
  onQuitRequested,
  quitApp,
  setAppAlwaysOnTop,
  toggleMaximizeAppWindow,
} from "./tauriWindow";
import { isAutoStartEnabled, setAutoStartEnabled } from "./autostart";
import { saveNoteAsCynote, writeCynoteFile } from "./export";
import { onOpenNoteFile, readNoteFileRaw, takeStartupFile } from "./dashboardApi";
import { parseNoteFile } from "./cynoteFormat";
import { loadNotes, saveNotes } from "./notesStore";
import { getDeviceIdentity } from "./deviceIdentity";
import { onPairingRequest, respondToPairing, listReachableTrustedDevices, fetchPeerNotes } from "./sync";
import { mergeFromPeer } from "./merge";
import { loadBookkeeping, saveBookkeeping } from "./bookkeeping";
import { isDirty as isTabDirtyAgainst, snapshotOf, tabHasContent, type SavedSnapshot } from "./dirtyTracking";
import { checkForUpdate, installUpdate, type Update } from "./updater";
import type { PeerInfo } from "./types";

const UPDATE_CHECK_DELAY_MS = 4000;

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
  const [editingSketchId, setEditingSketchId] = useState<string | null>(null);
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

  // Tracks, per tab, the title/body/sketches as they were the last time this
  // device actually wrote them to a real file (or as loaded at launch, which
  // counts as "saved" since it's already durably on disk in notes.json).
  // Deliberately not React state - it's an internal bookkeeping detail that
  // doesn't need to trigger a render on its own; isTabDirty is called during
  // render and reads it directly.
  const savedSnapshots = useRef<Map<string, SavedSnapshot>>(new Map());

  const isTabDirty = (tab: TabData): boolean => isTabDirtyAgainst(tab, savedSnapshots.current.get(tab.id));

  // Bumping this forces a re-render so the dirty dot actually disappears the
  // moment a save lands, even when markSaved fires alone (e.g. after an
  // awaited writeCynoteFile) with no other state change to piggyback on.
  const [, forceRerender] = useReducer((c: number) => c + 1, 0);

  const markSaved = (tab: TabData) => {
    savedSnapshots.current.set(tab.id, snapshotOf(tab));
    forceRerender();
  };

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
      const initial = saved && saved.length > 0 ? saved : [makeBlankTab(identity.deviceId)];
      // Whatever was loaded from notes.json is durably on disk already -
      // start every tab clean, not flagged as having unsaved changes.
      initial.forEach((t) => savedSnapshots.current.set(t.id, snapshotOf(t)));
      setTabs(initial);
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
  // Also marks the tab clean: this IS the save that made the file match it.
  const setTabSavedPath = (index: number, path: string) => {
    setTabs((prev) => {
      const next = prev.slice();
      const updated = { ...next[index], filePath: path, title: basenameNoExt(path), titleIsCustom: true };
      next[index] = updated;
      markSaved(updated);
      return next;
    });
  };

  // Notepad-style save: an internal save always happens, and once a note is
  // linked to a .cyte file (via a prior Save/Save As), Ctrl+S keeps that
  // file in sync too - silently if already linked, prompting once if not.
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
      if (tab.filePath) {
        await writeCynoteFile(tab.filePath, tab);
        markSaved(tab);
      } else {
        const path = await saveNoteAsCynote(tab);
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
        toggleDrawing();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "t")
      ) {
        e.preventDefault();
        addTab();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        closeTab(activeTabRef.current);
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
    // tabsRef (not the closure's `tabs`) so this stays correct even called
    // from a long-lived handler like the Ctrl+N shortcut below.
    setActiveTab(tabsRef.current.length);
    setTabs((prev) => [...prev, makeBlankTab(deviceId)]);
  };

  // Reached from the Dashboard window: focus the tab if this file is already
  // open, otherwise read it fresh and open it linked (Ctrl+S keeps saving here).
  const openNoteFile = async (path: string) => {
    const existingIndex = tabsRef.current.findIndex((t) => t.filePath === path);
    if (existingIndex !== -1) {
      setActiveTab(existingIndex);
      return;
    }
    if (!deviceId) return;
    const raw = await readNoteFileRaw(path);
    const { title, body, meta } = parseNoteFile(raw, basenameNoExt(path));
    // A .cyte file carries its own stable id - reusing it (instead of
    // minting a fresh one) is what lets the Dashboard and sync recognize
    // "this file IS that note" across reopens and devices. If it's already
    // open under a different path (e.g. moved on disk), just focus that tab.
    if (meta) {
      const byId = tabsRef.current.findIndex((t) => t.id === meta.id);
      if (byId !== -1) {
        setActiveTab(byId);
        return;
      }
    }
    const note: TabData = {
      id: meta?.id ?? "n" + Date.now(),
      title,
      body,
      favorite: meta?.favorite ?? false,
      sketches: meta?.sketches ?? [],
      updatedAt: meta?.updatedAt ?? Date.now(),
      originDeviceId: meta?.originDeviceId ?? deviceId,
      filePath: path,
      titleIsCustom: meta?.titleIsCustom ?? true,
    };
    markSaved(note);
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

  // Explorer's "Open with" / double-click on a .cyte file launches Cynote
  // with that path on the command line - the Rust side holds onto it until
  // we're ready (an event fired at launch could race the app not having a
  // listener attached yet), so pull it once as soon as we can actually open it.
  useEffect(() => {
    if (!deviceId) return;
    takeStartupFile().then((path) => {
      if (path) openNoteFile(path);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const dirtyTabsWithContent = () => tabsRef.current.filter((t) => isTabDirty(t) && tabHasContent(t));

  // Saves every dirty tab (prompting Save As for ones never linked to a
  // file), used before either exit path below actually proceeds.
  const saveAllDirtyTabs = async () => {
    for (const dirty of dirtyTabsWithContent()) {
      const i = tabsRef.current.findIndex((t) => t.id === dirty.id);
      if (i === -1) continue;
      const current = tabsRef.current[i];
      if (current.filePath) {
        await writeCynoteFile(current.filePath, current);
        markSaved(current);
      } else {
        const path = await saveNoteAsCynote(current);
        if (path) setTabSavedPath(i, path);
      }
    }
  };

  // Quitting (tray "Sair") and installing an update both end the process the
  // same way an unsaved tab close would - so they share the same "you have
  // unsaved changes" confirm dialog, just finishing with a different action.
  const [pendingExitAction, setPendingExitAction] = useState<"quit" | "update" | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);

  const runExitAction = (action: "quit" | "update") => {
    if (action === "quit") {
      quitApp();
    } else if (availableUpdate) {
      setInstallingUpdate(true);
      installUpdate(availableUpdate).catch(() => setInstallingUpdate(false));
    }
  };

  useEffect(() => {
    return onQuitRequested(() => {
      if (dirtyTabsWithContent().length === 0) {
        quitApp();
      } else {
        setPendingExitAction("quit");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Checked once, a few seconds after launch (no need to race the note
  // list loading in). A silent miss (offline, no release yet) is fine -
  // this only ever surfaces something when there's actually a new version.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      checkForUpdate().then((update) => {
        if (update) {
          setAvailableUpdate(update);
          setUpdatePromptOpen(true);
        }
      });
    }, UPDATE_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  const cancelUpdatePrompt = () => setUpdatePromptOpen(false);

  const startUpdate = () => {
    setUpdatePromptOpen(false);
    if (dirtyTabsWithContent().length === 0) {
      runExitAction("update");
    } else {
      setPendingExitAction("update");
    }
  };

  const cancelPendingExit = () => setPendingExitAction(null);

  const discardAndProceed = () => {
    const action = pendingExitAction;
    setPendingExitAction(null);
    if (action) runExitAction(action);
  };

  const saveAllAndProceed = async () => {
    await saveAllDirtyTabs();
    const action = pendingExitAction;
    setPendingExitAction(null);
    if (action) runExitAction(action);
  };

  // The actual removal, once we're sure it's safe (nothing to lose, or the
  // user already decided to save or discard via the confirm dialog below).
  const performCloseTab = (i: number) => {
    if (tabsRef.current.length <= 1) return;

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

  // A tab whose only home is Cynote's internal store (never saved to a real
  // file, or edited since the last time it was) would just vanish with no
  // way back if closed outright - so instead of closing immediately, ask.
  const [closeConfirmId, setCloseConfirmId] = useState<string | null>(null);
  const closeConfirmTab = closeConfirmId ? tabs.find((t) => t.id === closeConfirmId) ?? null : null;

  const closeTab = (i: number) => {
    // tabsRef (not the closure's `tabs`) so this stays correct even called
    // from a long-lived handler like the Ctrl+W shortcut below.
    if (tabsRef.current.length <= 1) return;
    const tab = tabsRef.current[i];
    if (!tab) return;
    if (isTabDirty(tab) && tabHasContent(tab)) {
      setCloseConfirmId(tab.id);
      return;
    }
    performCloseTab(i);
  };

  const cancelCloseConfirm = () => setCloseConfirmId(null);

  const discardAndCloseConfirmed = () => {
    if (!closeConfirmId) return;
    const i = tabsRef.current.findIndex((t) => t.id === closeConfirmId);
    setCloseConfirmId(null);
    if (i !== -1) performCloseTab(i);
  };

  const saveAndCloseConfirmed = async () => {
    if (!closeConfirmId) return;
    const i = tabsRef.current.findIndex((t) => t.id === closeConfirmId);
    if (i === -1) {
      setCloseConfirmId(null);
      return;
    }
    const tab = tabsRef.current[i];
    if (tab.filePath) {
      await writeCynoteFile(tab.filePath, tab);
      markSaved(tab);
    } else {
      const path = await saveNoteAsCynote(tab);
      if (!path) return; // dialog cancelled - leave the confirm prompt open
      setTabSavedPath(i, path);
    }
    setCloseConfirmId(null);
    performCloseTab(i);
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
    const path = await saveNoteAsCynote(tab);
    if (path) setTabSavedPath(i, path);
  };

  const SKETCH_MAX_WIDTH = 220;

  // Opens a blank canvas for a brand-new sketch - any in-progress edit of an
  // existing one is dropped so re-opening never lands back in edit mode.
  const toggleDrawing = () => {
    setEditingSketchId(null);
    setDrawingOpen((v) => !v);
  };

  const closeDrawing = () => {
    setDrawingOpen(false);
    setEditingSketchId(null);
  };

  const editSketch = (sketchId: string) => {
    setEditingSketchId(sketchId);
    setDrawingOpen(true);
  };

  const deleteSketch = (sketchId: string) => {
    setTabs((prev) => {
      const next = prev.slice();
      const tab = next[activeTab];
      next[activeTab] = {
        ...tab,
        sketches: tab.sketches.filter((s) => s.id !== sketchId),
        updatedAt: Date.now(),
      };
      return next;
    });
  };

  const insertSketch = (canvas: HTMLCanvasElement) => {
    // Capture the image now, synchronously - the setTabs updater below may
    // run after the caller clears the canvas, which would otherwise insert
    // a blank image.
    const dataUrl = canvas.toDataURL("image/png");

    if (editingSketchId) {
      const id = editingSketchId;
      setTabs((prev) => {
        const next = prev.slice();
        const tab = next[activeTab];
        next[activeTab] = {
          ...tab,
          sketches: tab.sketches.map((s) => (s.id === id ? { ...s, dataUrl } : s)),
          updatedAt: Date.now(),
        };
        return next;
      });
    } else {
      const aspect = canvas.height / canvas.width;
      const width = Math.min(SKETCH_MAX_WIDTH, canvas.width);
      const height = Math.round(width * aspect);
      setTabs((prev) => {
        const next = prev.slice();
        const tab = next[activeTab];
        const cascade = (tab.sketches.length % 6) * 22;
        const sketch: NoteSketch = {
          id: "sk" + Date.now(),
          dataUrl,
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
    }
    closeDrawing();
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

  const resizeSketch = (sketchId: string, width: number, height: number) => {
    setTabs((prev) => {
      const next = prev.slice();
      const tab = next[activeTab];
      next[activeTab] = {
        ...tab,
        sketches: tab.sketches.map((s) => (s.id === sketchId ? { ...s, width, height } : s)),
        updatedAt: Date.now(),
      };
      return next;
    });
  };

  if (!loaded || tabs.length === 0) {
    return <div className="cy-panel" />;
  }

  const charCount = tabs[activeTab].body.length;
  const dirtyCount = tabs.filter((t) => isTabDirty(t) && tabHasContent(t)).length;

  return (
    <div className="cy-panel">
      <Header
        formatMenuOpen={formatMenuOpen}
        onToggleFormatMenu={() => setFormatMenuOpen((v) => !v)}
        onCloseFormatMenu={() => setFormatMenuOpen(false)}
        drawingOpen={drawingOpen}
        onToggleDrawing={toggleDrawing}
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
        isDirty={isTabDirty}
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
              onResizeSketch={resizeSketch}
              onEditSketch={editSketch}
              onDeleteSketch={deleteSketch}
            />
          </div>

          <DrawingOverlay
            open={drawingOpen}
            darkMode={darkMode}
            drawColor={drawColor}
            onSetColor={setDrawColor}
            onCancel={closeDrawing}
            onInsert={insertSketch}
            initialImage={
              editingSketchId ? tabs[activeTab].sketches.find((s) => s.id === editingSketchId)?.dataUrl : undefined
            }
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

      {closeConfirmTab && (
        <div className="pairing-modal-backdrop">
          <div className="pairing-modal" style={{ width: 300 }}>
            <div className="pairing-modal-title heading-font">Alterações não salvas</div>
            <div className="pairing-modal-text">
              "{closeConfirmTab.title}" tem alterações não salvas. Deseja salvar antes de fechar?
            </div>
            <div className="pairing-modal-actions">
              <button className="cancel-btn" onClick={cancelCloseConfirm}>
                Cancelar
              </button>
              <button className="danger-btn" onClick={discardAndCloseConfirmed}>
                Não salvar
              </button>
              <button className="insert-btn" onClick={saveAndCloseConfirmed}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingExitAction && (
        <div className="pairing-modal-backdrop">
          <div className="pairing-modal" style={{ width: 300 }}>
            <div className="pairing-modal-title heading-font">Alterações não salvas</div>
            <div className="pairing-modal-text">
              Você tem {dirtyCount} nota{dirtyCount === 1 ? "" : "s"} com alterações não salvas.{" "}
              {pendingExitAction === "quit" ? "Sair mesmo assim?" : "Atualizar mesmo assim?"}
            </div>
            <div className="pairing-modal-actions">
              <button className="cancel-btn" onClick={cancelPendingExit}>
                Cancelar
              </button>
              <button className="danger-btn" onClick={discardAndProceed}>
                {pendingExitAction === "quit" ? "Sair sem salvar" : "Atualizar sem salvar"}
              </button>
              <button className="insert-btn" onClick={saveAllAndProceed}>
                {pendingExitAction === "quit" ? "Salvar e sair" : "Salvar e atualizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {updatePromptOpen && availableUpdate && (
        <div className="pairing-modal-backdrop">
          <div className="pairing-modal" style={{ width: 300 }}>
            <div className="pairing-modal-title heading-font">Atualização disponível</div>
            <div className="pairing-modal-text">
              O Cynote {availableUpdate.version} está disponível (você tem a {availableUpdate.currentVersion}).
              Atualizar agora? O app vai reiniciar sozinho.
            </div>
            <div className="pairing-modal-actions">
              <button className="cancel-btn" onClick={cancelUpdatePrompt}>
                Agora não
              </button>
              <button className="insert-btn" onClick={startUpdate}>
                Atualizar
              </button>
            </div>
          </div>
        </div>
      )}

      {installingUpdate && (
        <div className="pairing-modal-backdrop">
          <div className="pairing-modal" style={{ width: 260 }}>
            <div className="pairing-modal-title heading-font">Atualizando…</div>
            <div className="pairing-modal-text">Baixando a nova versão. O Cynote vai reiniciar em instantes.</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
