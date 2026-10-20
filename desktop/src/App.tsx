import { useEffect, useReducer, useRef, useState } from "react";
import "./theme.css";
import "./styles.css";
import type { NoteSketch, TabData } from "./types";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { SettingsView } from "./components/SettingsView";
import { ContentArea } from "./components/ContentArea";
import { DrawingOverlay, type DrawingOverlayHandle, type DrawingResult } from "./components/DrawingOverlay";
import { StatusBar } from "./components/StatusBar";
import { Dialog } from "./components/Dialog";
import { CornerVignette, Sprout } from "./icons";
import {
  hideAppWindow,
  minimizeAppWindow,
  onQuitRequested,
  quitApp,
  setAppAlwaysOnTop,
  toggleMaximizeAppWindow,
} from "./tauriWindow";
import { isAutoStartEnabled, setAutoStartEnabled } from "./autostart";
import { exportNoteAsTxt, saveNoteAsCynote, writeCynoteFile } from "./export";
import { fileExists, onOpenNoteFile, readNoteFileRaw, takeStartupFile } from "./dashboardApi";
import { planOpen, samePath } from "./noteFiles";
import { parseNoteFile } from "./cynoteFormat";
import { loadNotes, saveNotes } from "./notesStore";
import { getDeviceIdentity } from "./deviceIdentity";
import { onPairingRequest, respondToPairing, listReachableTrustedDevices, fetchPeerNotes } from "./sync";
import { mergeFromPeer, dropDuplicateCopies } from "./merge";
import { loadBookkeeping, saveBookkeeping } from "./bookkeeping";
import { loadDeletedNoteIds, markNotesDeleted, forgetDeletedNote } from "./deletedNotes";
import { getCloudSyncId, pushCloudNotes, fetchCloudChanges } from "./cloudSync";
import { shiftSketchAnchors, tabsForSync } from "./sketches";
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
const TOAST_MS = 1800;
// Long enough to reach the "Desfazer" button.
const UNDO_TOAST_MS = 8000;
const SPELLCHECK_KEY = "cynote-spellcheck-enabled";
// Shared with the Dashnotes window, which follows the main window's theme.
const THEME_KEY = "cynote-theme";

function loadDarkModePref(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) !== "light";
  } catch {
    return true;
  }
}

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
  const [deviceName, setDeviceName] = useState<string>("Computador");
  const [activeTab, setActiveTab] = useState(0);
  const [drawingOpen, setDrawingOpen] = useState(false);
  // Read by the long-lived key and wheel handlers below.
  const drawingOpenRef = useRef(false);
  drawingOpenRef.current = drawingOpen;
  const drawingRef = useRef<DrawingOverlayHandle>(null);
  const [editingSketchId, setEditingSketchId] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState(false);
  const [darkMode, setDarkMode] = useState(loadDarkModePref);
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  // Caret position for the status bar's Ln/Col readout - reported by
  // ContentArea, which is the only place that can see the live selection.
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error">("synced");
  const [zoom, setZoom] = useState(100);
  const zoomBy = (delta: number) => setZoom((z) => Math.min(200, Math.max(60, z + delta)));

  // Ctrl+wheel zooms the note, like Notepad and VS Code (passive: false, or
  // preventDefault is ignored and the page itself would try to zoom).
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // A drawing in progress is laid out against the text as it is now.
      if (drawingOpenRef.current) return;
      zoomBy(e.deltaY < 0 ? 10 : -10);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
  type ToastAction = { label: string; run: () => void };
  const [toast, setToast] = useState<{ message: string; action?: ToastAction; key: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string, action?: ToastAction) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, action, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), action ? UNDO_TOAST_MS : TOAST_MS);
  };
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
    try {
      localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
    } catch {
      // best-effort
    }
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

  // Assigned during render (not in an effect) so it's never a step behind the
  // committed state - sync compares against it to detect edits made while a
  // cycle was in flight.
  const tabsRef = useRef<TabData[]>(tabs);
  tabsRef.current = tabs;

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

  // Everything network-bound happens before this: the merge itself runs in one
  // synchronous step against the latest tabs, and is only applied if nothing
  // changed them in the meantime (an edit, or another sync cycle) - otherwise
  // it's simply redone next cycle, instead of overwriting newer state with a
  // result computed from stale state.
  const mergeAndApply = (peers: { deviceId: string; notes: TabData[] }[], myDeviceId: string) => {
    const base = tabsRef.current;
    const deleted = loadDeletedNoteIds();
    let book = loadBookkeeping();
    let merged = base;
    let anyChange = false;
    for (const peer of peers) {
      const result = mergeFromPeer(merged, peer.notes, peer.deviceId, myDeviceId, book, deleted);
      merged = result.tabs;
      book = result.bookkeeping;
      if (result.changed) anyChange = true;
    }
    if (!anyChange) {
      saveBookkeeping(book);
      return;
    }
    setTabs((prev) => {
      if (prev !== base) return prev;
      saveBookkeeping(book);
      tabsRef.current = merged;
      return merged;
    });
  };

  const lanSyncBusy = useRef(false);
  const runSyncCycle = async (myDeviceId: string) => {
    if (lanSyncBusy.current) return;
    lanSyncBusy.current = true;
    try {
      const peers = await listReachableTrustedDevices();
      const fetched: { deviceId: string; notes: TabData[] }[] = [];
      for (const peer of peers) {
        const resp = await fetchPeerNotes(peer);
        if (resp) fetched.push({ deviceId: peer.deviceId, notes: resp.notes as TabData[] });
      }
      if (fetched.length > 0) mergeAndApply(fetched, myDeviceId);
    } finally {
      lanSyncBusy.current = false;
    }
  };

  // Same merge as the LAN cycle above, just fetched over the internet instead
  // of the local network - this is what still works when both devices are on
  // a network that blocks device-to-device discovery (a work/guest Wi-Fi with
  // client isolation, for instance), once a pairing code is set up between
  // them (see SettingsView).
  //
  // Only what changed crosses the network: our notes are uploaded when they
  // differ from the last upload, and another device's notes are downloaded
  // when its timestamp moves (kept here so every cycle can still merge them).
  const cloudSyncBusy = useRef(false);
  const cloudState = useRef({
    syncId: "",
    lastPushed: "",
    peers: new Map<string, { updatedAt: number; notes: TabData[] }>(),
  });
  const runCloudSyncCycle = async (myDeviceId: string, myDeviceName: string) => {
    if (cloudSyncBusy.current) return;
    cloudSyncBusy.current = true;
    try {
      const syncId = await getCloudSyncId();
      if (!syncId) return;
      const cloud = cloudState.current;
      if (cloud.syncId !== syncId) {
        cloudState.current = { syncId, lastPushed: "", peers: new Map() };
      }
      const { peers } = cloudState.current;

      const payload = JSON.stringify(tabsForSync(tabsRef.current));
      if (payload !== cloudState.current.lastPushed && (await pushCloudNotes(syncId, myDeviceId, myDeviceName, payload))) {
        cloudState.current.lastPushed = payload;
      }

      const known = Object.fromEntries([...peers].map(([id, p]) => [id, p.updatedAt]));
      const changes = await fetchCloudChanges(syncId, myDeviceId, known);
      if (!changes) return;
      for (const id of [...peers.keys()]) if (!changes.devices.includes(id)) peers.delete(id);
      for (const p of changes.changed) {
        peers.set(p.deviceId, { updatedAt: p.updatedAt, notes: Array.isArray(p.notes) ? (p.notes as TabData[]) : [] });
      }
      if (peers.size > 0) {
        mergeAndApply(
          [...peers].map(([deviceId, p]) => ({ deviceId, notes: p.notes })),
          myDeviceId
        );
      }
    } finally {
      cloudSyncBusy.current = false;
    }
  };

  useEffect(() => {
    getDeviceIdentity().then(async (identity) => {
      setDeviceId(identity.deviceId);
      setDeviceName(identity.deviceName);
      const saved = await loadNotes(identity.deviceId);
      const deduped = saved ? dropDuplicateCopies(saved) : null;
      if (deduped) markNotesDeleted(deduped.removedIds);
      const initial = deduped && deduped.tabs.length > 0 ? deduped.tabs : [makeBlankTab(identity.deviceId)];
      // Whatever was loaded from notes.json is durably on disk already -
      // start every tab clean, not flagged as having unsaved changes.
      initial.forEach((t) => savedSnapshots.current.set(t.id, snapshotOf(t)));
      setTabs(initial);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded || !deviceId) return;
    const runBoth = () => {
      runSyncCycle(deviceId);
      runCloudSyncCycle(deviceId, deviceName);
    };
    runBoth();
    const interval = setInterval(runBoth, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, deviceId]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // What Esc should close next, for the long-lived keydown handler below.
  const openLayersRef = useRef({ menus: false, drawing: false });
  openLayersRef.current = { menus: formatMenuOpen || tabsMenuOpen, drawing: drawingOpen };

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
      if (deviceId) {
        runSyncCycle(deviceId);
        runCloudSyncCycle(deviceId, deviceName);
      }

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
        if (deviceId) {
        runSyncCycle(deviceId);
        runCloudSyncCycle(deviceId, deviceName);
      }
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
        drawingOpenRef.current &&
        (e.ctrlKey || e.metaKey) &&
        ["n", "t", "w", "tab", "=", "+", "-", "0"].includes(e.key.toLowerCase())
      ) {
        // While drawing, the note under the canvas stays as it is: same tab,
        // same zoom.
        e.preventDefault();
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
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Tab") {
        e.preventDefault();
        const count = tabsRef.current.length;
        if (count <= 1) return;
        setTabsMenuOpen(false);
        setActiveTab((prev) => (e.shiftKey ? (prev - 1 + count) % count : (prev + 1) % count));
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        reopenClosedTab();
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomBy(10);
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === "-") {
        e.preventDefault();
        zoomBy(-10);
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === "0") {
        e.preventDefault();
        setZoom(100);
      } else if (e.key === "Escape" && !e.defaultPrevented) {
        // Menus first, then the drawing canvas; the editor handles its own
        // find bar and extra cursors.
        if (openLayersRef.current.menus) {
          e.preventDefault();
          setFormatMenuOpen(false);
          setTabsMenuOpen(false);
        } else if (openLayersRef.current.drawing) {
          e.preventDefault();
          drawingRef.current?.requestClose();
        }
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

  // Ctrl+Shift+T brings back the most recently closed tab, like a browser or VS Code.
  const closedTabsRef = useRef<TabData[]>([]);
  const reopenClosedTab = () => {
    const tab = closedTabsRef.current.pop();
    if (!tab) return;
    forgetDeletedNote(tab.id);
    if (tabsRef.current.some((t) => t.id === tab.id)) return;
    markSaved(tab);
    setActiveTab(tabsRef.current.length);
    setTabs((prev) => [...prev, tab]);
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
    const alreadyOpen = tabsRef.current.findIndex((t) => samePath(t.filePath, path));
    if (alreadyOpen !== -1) {
      setActiveTab(alreadyOpen);
      return;
    }
    if (!deviceId) return;
    const raw = await readNoteFileRaw(path);
    const { title, body, meta } = parseNoteFile(raw, basenameNoExt(path));
    // A .cyte file carries its own stable id - reusing it is what lets sync
    // recognize "this file IS that note" across reopens and devices. When
    // that id is already in use, planOpen tells a renamed/moved file apart
    // from a second file that merely shares the id (see noteFiles.ts).
    const snapshot = tabsRef.current;
    const plan = await planOpen(snapshot, path, meta?.id ?? null, fileExists, () => "n" + Date.now());
    const indexNow = (index: number) => tabsRef.current.findIndex((t) => t.id === snapshot[index].id);

    if (plan.action === "focus") {
      setActiveTab(indexNow(plan.index));
      return;
    }
    if (plan.action === "relink") {
      const id = snapshot[plan.index].id;
      setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, filePath: path } : t)));
      setActiveTab(indexNow(plan.index));
      return;
    }
    if (plan.action === "link" && meta) {
      // A copy of this note that arrived through sync, which never carries
      // the file link - just focusing it would show whatever that copy
      // holds (possibly far older than the file) as if it were the file.
      // Link it, and keep whichever version was edited last; the dirty
      // marker then shows whether the tab differs from the file on disk.
      const existing = snapshot[plan.index];
      const fromFile: TabData = {
        ...existing,
        title,
        body,
        favorite: meta.favorite ?? existing.favorite,
        sketches: meta.sketches ?? existing.sketches,
        updatedAt: meta.updatedAt ?? existing.updatedAt,
        filePath: path,
        titleIsCustom: meta.titleIsCustom ?? true,
      };
      const fileIsNewer = (meta.updatedAt ?? 0) >= existing.updatedAt;
      const linked = fileIsNewer ? fromFile : { ...existing, filePath: path, titleIsCustom: true };
      savedSnapshots.current.set(linked.id, snapshotOf(fromFile));
      setTabs((prev) => prev.map((t) => (t.id === linked.id ? linked : t)));
      setActiveTab(indexNow(plan.index));
      return;
    }

    const id = plan.action === "open" ? plan.id : "n" + Date.now();
    forgetDeletedNote(id);
    const note: TabData = {
      id,
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
      const closing = tabsRef.current[i];
      if (closing) {
        markNotesDeleted([closing.id]);
        closedTabsRef.current.push(closing);
      }
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
        if (deviceId) {
        runSyncCycle(deviceId);
        runCloudSyncCycle(deviceId, deviceName);
      }
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
        sketches: shiftSketchAnchors(tab.sketches, tab.body, value),
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

  // ------------------------------------------------------------ Note Styling

  /** Changes one note's drawings, found by id rather than by tab position.
   * `quiet` leaves the note's edit time alone (bookkeeping, not an edit). */
  const changeSketches = (noteId: string, change: (sketches: NoteSketch[]) => NoteSketch[], quiet = false) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== noteId) return t;
        const sketches = change(t.sketches ?? []);
        return sketches === t.sketches ? t : { ...t, sketches, updatedAt: quiet ? t.updatedAt : Date.now() };
      })
    );
  };

  const activeNoteId = () => tabsRef.current[activeTabRef.current]?.id;

  // The header button and Ctrl+Shift+D: opens a blank sheet over the note,
  // or closes it - asking first if a drawing would be lost.
  const toggleDrawing = () => {
    if (drawingOpenRef.current) {
      drawingRef.current?.requestClose();
      return;
    }
    setEditingSketchId(null);
    setShowSettings(false);
    setFormatMenuOpen(false);
    setTabsMenuOpen(false);
    setDrawingOpen(true);
  };

  const closeDrawing = () => {
    setDrawingOpen(false);
    setEditingSketchId(null);
  };

  const editSketch = (sketchId: string) => {
    if (drawingOpenRef.current) return;
    setShowSettings(false);
    setEditingSketchId(sketchId);
    setDrawingOpen(true);
  };

  const deleteSketch = (sketchId: string) => {
    const noteId = activeNoteId();
    const tab = tabsRef.current.find((t) => t.id === noteId);
    const index = tab?.sketches?.findIndex((s) => s.id === sketchId) ?? -1;
    if (!noteId || !tab || index < 0) return;
    const removed = tab.sketches[index];
    changeSketches(noteId, (list) => list.filter((s) => s.id !== sketchId));
    showToast("Desenho excluído", {
      label: "Desfazer",
      run: () =>
        changeSketches(noteId, (list) =>
          list.some((s) => s.id === sketchId) ? list : [...list.slice(0, index), removed, ...list.slice(index)]
        ),
    });
  };

  const insertSketch = (results: DrawingResult[]) => {
    const noteId = activeNoteId();
    const editing = editingSketchId;
    closeDrawing();
    if (!noteId) return;
    // Everything in a reopened drawing was erased: that's deleting it (and can be undone).
    if (editing && results.length === 0) {
      deleteSketch(editing);
      return;
    }
    const stamp = "sk" + Date.now();
    const made = results.map((r, i) => ({ id: i === 0 && editing ? editing : `${stamp}-${i}`, ...r }));
    changeSketches(noteId, (list) => {
      if (!editing) return [...list, ...made];
      // The reopened drawing keeps its place in the list; anything drawn
      // apart from it while it was open is added after.
      const at = list.findIndex((s) => s.id === editing);
      return at < 0 ? [...list, ...made] : [...list.slice(0, at), ...made, ...list.slice(at + 1)];
    });
  };

  const updateSketches = (noteId: string, patches: Record<string, Partial<NoteSketch>>, quiet = false) =>
    changeSketches(
      noteId,
      (list) => {
        let hit = false;
        const next = list.map((s) => {
          const patch = patches[s.id];
          if (!patch) return s;
          hit = true;
          return { ...s, ...patch };
        });
        return hit ? next : list;
      },
      quiet
    );

  // The tabs can't be switched while drawing, but a note opened from outside
  // (Explorer, Dashnotes) still can - the sheet was laid over the other one.
  const shownNoteId = tabs[activeTab]?.id;
  useEffect(() => {
    if (drawingOpenRef.current) closeDrawing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownNoteId]);

  if (!loaded || tabs.length === 0) {
    return <div className="cy-window" />;
  }

  const charCount = tabs[activeTab].body.length;
  const activeNote = tabs[activeTab];
  const activeSketches = activeNote.sketches ?? [];
  const editingSketch = editingSketchId ? activeSketches.find((s) => s.id === editingSketchId) ?? null : null;
  const isBlankPage = charCount === 0 && activeSketches.length === 0 && !drawingOpen;
  const dirtyCount = tabs.filter((t) => isTabDirty(t) && tabHasContent(t)).length;

  return (
    <div className={"cy-window" + (drawingOpen ? " drawing" : "")}>
      <Header
        formatMenuOpen={formatMenuOpen}
        onToggleFormatMenu={() => setFormatMenuOpen((v) => !v)}
        onCloseFormatMenu={() => setFormatMenuOpen(false)}
        drawingOpen={drawingOpen}
        onToggleDrawing={toggleDrawing}
        settingsOpen={showSettings}
        onToggleSettings={() => {
          if (drawingOpenRef.current) drawingRef.current?.requestClose(() => setShowSettings(true));
          else setShowSettings((v) => !v);
        }}
        onSaveAs={exportActiveNoteTxt}
        onExportTxt={() => exportNoteAsTxt(tabsRef.current[activeTabRef.current])}
        pinned={pinned}
        onTogglePin={() => {
          showToast(pinned ? "Janela solta" : "Fixada por cima das outras janelas");
          setPinned((v) => !v);
        }}
        onMinimize={minimizeAppWindow}
        onToggleMaximize={toggleMaximizeAppWindow}
        onClose={hideAppWindow}
      />

      <div className="cy-body">
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

      <div className="cy-page">
      <div className="cy-page-rule" />
      <CornerVignette corner="tl" />
      <CornerVignette corner="tr" />
      <CornerVignette corner="bl" />
      <CornerVignette corner="br" />
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
              fontSize: Math.round((readingMode ? 18 : 15) * zoom) / 100 + "px",
              lineHeight: readingMode ? 1.95 : 1.65,
            }}
          >
            <ContentArea
              key={activeNote.id}
              noteId={activeNote.id}
              body={activeNote.body}
              sketches={activeSketches}
              spellCheck={spellCheckEnabled}
              darkMode={darkMode}
              textStyleKey={zoom + (readingMode ? "r" : "")}
              hiddenSketchId={drawingOpen ? editingSketchId : null}
              onBodyInput={onBodyInput}
              onCaretChange={(line, col) =>
                setCaret((prev) => (prev.line === line && prev.col === col ? prev : { line, col }))
              }
              onUpdateSketches={(patches, quiet) => updateSketches(activeNote.id, patches, quiet)}
              onEditSketch={editSketch}
              onDeleteSketch={deleteSketch}
            />
          </div>

          {isBlankPage && (
            <div className="cy-empty blank-page">
              <Sprout />
              <div className="cy-empty-title">Página em branco</div>
              <div className="cy-empty-hint">Plante a primeira linha e o resto cresce.</div>
            </div>
          )}

          <DrawingOverlay
            ref={drawingRef}
            open={drawingOpen}
            editing={editingSketch}
            darkMode={darkMode}
            onClose={closeDrawing}
            onInsert={insertSketch}
          />
        </div>
      )}
      {toast && (
        <div className={"cy-toast" + (toast.action ? " with-action" : "")} key={toast.key}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="cy-toast-action"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
      </div>

      <StatusBar
        line={caret.line}
        col={caret.col}
        charCount={charCount}
        zoom={zoom}
        onZoomIn={() => zoomBy(10)}
        onZoomOut={() => zoomBy(-10)}
        readingMode={readingMode}
        onToggleReadingMode={() => setReadingMode((v) => !v)}
        syncStatus={syncStatus}
        onSaveNow={saveNow}
      />
      </div>

      {pairingRequests.length > 0 && (
        <Dialog
          icon="pair"
          title="Sincronizar dispositivo"
          buttons={[
            { label: "Recusar", onClick: () => respondPairing(pairingRequests[0].deviceId, false) },
            { label: "Aceitar", kind: "primary", onClick: () => respondPairing(pairingRequests[0].deviceId, true) },
          ]}
        >
          Sincronizar com “{pairingRequests[0].deviceName}”?
        </Dialog>
      )}

      {closeConfirmTab && (
        <Dialog
          icon="unsaved"
          title="Alterações não salvas"
          buttons={[
            { label: "Cancelar", onClick: cancelCloseConfirm },
            { label: "Não salvar", kind: "danger", onClick: discardAndCloseConfirmed },
            { label: "Salvar", kind: "primary", onClick: saveAndCloseConfirmed },
          ]}
        >
          “{closeConfirmTab.title}” tem alterações que ainda não foram salvas. Deseja salvar antes de fechar?
        </Dialog>
      )}

      {pendingExitAction && (
        <Dialog
          icon="unsaved"
          title="Alterações não salvas"
          buttons={[
            { label: "Cancelar", onClick: cancelPendingExit },
            {
              label: pendingExitAction === "quit" ? "Sair sem salvar" : "Atualizar sem salvar",
              kind: "danger",
              onClick: discardAndProceed,
            },
            {
              label: pendingExitAction === "quit" ? "Salvar e sair" : "Salvar e atualizar",
              kind: "primary",
              onClick: saveAllAndProceed,
            },
          ]}
        >
          Você tem {dirtyCount} nota{dirtyCount === 1 ? "" : "s"} com alterações não salvas.{" "}
          {pendingExitAction === "quit" ? "Sair mesmo assim?" : "Atualizar mesmo assim?"}
        </Dialog>
      )}

      {updatePromptOpen && availableUpdate && (
        <Dialog
          icon="update"
          title="Atualização disponível"
          buttons={[
            { label: "Agora não", onClick: cancelUpdatePrompt },
            { label: "Atualizar", kind: "primary", onClick: startUpdate },
          ]}
        >
          O Cynote {availableUpdate.version} está disponível (você tem a {availableUpdate.currentVersion}). Atualizar
          agora? O app vai reiniciar sozinho.
        </Dialog>
      )}

      {installingUpdate && (
        <Dialog icon="update" title="Atualização disponível" progress>
          Instalando o Cynote {availableUpdate?.version ?? ""}… O app vai reiniciar em instantes.
        </Dialog>
      )}
    </div>
  );
}

export default App;
