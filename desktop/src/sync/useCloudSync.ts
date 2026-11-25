// Cynote sync v2 inside the app (SYNC.md): owns the code, the state file, the
// triggers for sync cycles and the application of results to the open tabs.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { TabData } from "../types";
import { applyToTabs, toLocalNotes } from "./applyToTabs";
import { CycleCancelled, runCycle, statusFromError, type CloudSyncStatus } from "./engine";
import { DATABASE_URL, createHttp } from "./http";
import { generateSyncCode, normalizeSyncCode } from "./reconcile";
import { addIgnored, emptyState, resetForNewCode, trimDeleted, type SyncState } from "./state";
import { clearSyncCode, loadSyncCode, loadSyncState, saveSyncState, storeSyncCode } from "./stateStore";

export const INVALID_CODE_TEXT =
  "Esse código não parece certo. Ele tem 20 letras e números, como 4F2A9-C81D0-77B3E-0A1C5.";

const SYNC_INTERVAL_MS = 30_000;
/** Even when the stamp says nothing changed, read everything this often (and once per launch). */
const FULL_READ_EVERY_MS = 10 * 60_000;
/** A cycle shorter than this never flashes "Sincronizando…". */
const SYNCING_LABEL_DELAY_MS = 400;

export type CodeResult = { ok: true; code: string } | { ok: false; error: string };

export type CloudSyncApi = {
  status: CloudSyncStatus;
  /** The sync code, or null when sync is off. */
  code: string | null;
  createCode: () => Promise<CodeResult>;
  joinCode: (input: string) => Promise<CodeResult>;
  leave: () => Promise<void>;
  /** Runs a cycle now (or right after the one in progress). */
  syncNow: () => void;
  /** A note was closed here: delete it everywhere. */
  noteDeleted: (id: string) => void;
  /** A closed note came back (Ctrl+Shift+T, Desfazer, or its .cyte file was reopened). */
  noteRestored: (id: string) => void;
  /** Ids deleted by housekeeping: never imported again, never announced. */
  ignoreNotes: (ids: string[]) => void;
};

type Params = {
  /** Notes are loaded and the device is known. */
  ready: boolean;
  deviceId: string | null;
  tabsRef: MutableRefObject<TabData[]>;
  setTabs: Dispatch<SetStateAction<TabData[]>>;
  activeTabRef: MutableRefObject<number>;
  setActiveTab: Dispatch<SetStateAction<number>>;
  makeBlankTab: (deviceId: string) => TabData;
  /** Tabs closed because the note was deleted on another device. */
  onTabsRemoved?: (tabs: TabData[]) => void;
};

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function useCloudSync(params: Params): CloudSyncApi {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [status, setStatus] = useState<CloudSyncStatus>({ phase: "off" });
  const [code, setCode] = useState<string | null>(null);

  const stateRef = useRef<SyncState>(emptyState());
  const codeRef = useRef<string | null>(null);
  /** Bumped whenever the code changes; a cycle from an older epoch stops. */
  const epochRef = useRef(0);
  const initRef = useRef<Promise<void> | null>(null);
  const persistChain = useRef<Promise<void>>(Promise.resolve());
  const lastSyncAtRef = useRef<number | undefined>(undefined);
  const lastFullReadRef = useRef(0);

  const runningRef = useRef(false);
  const queuedRef = useRef(false);

  const persist = useCallback((state: SyncState) => {
    persistChain.current = persistChain.current
      .then(() => saveSyncState(state))
      .catch(() => {
        // The next change writes it again; nothing useful to tell the user.
      });
  }, []);

  // ---- start-up: the state file and the code

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = (async () => {
      try {
        const [state, savedCode] = await Promise.all([loadSyncState(), loadSyncCode()]);
        stateRef.current = state;
        codeRef.current = savedCode;
        setCode(savedCode);
        if (savedCode) setStatus({ phase: "syncing" });
      } catch {
        // Everything awaits this promise: it must never reject. Sync stays off.
      }
    })();
  }, []);

  // ---- one cycle

  const cycleOnce = useCallback(async () => {
    await initRef.current;
    const deviceId = paramsRef.current.deviceId;
    const syncCode = codeRef.current;
    if (!syncCode || !deviceId || !paramsRef.current.ready) return;

    const epoch = epochRef.current;
    const state = stateRef.current;
    const stale = () => epoch !== epochRef.current;
    const force = Date.now() - lastFullReadRef.current > FULL_READ_EVERY_MS;

    const label = setTimeout(() => {
      if (!stale()) setStatus((s) => (s.phase === "syncing" ? s : { ...s, phase: "syncing" }));
    }, SYNCING_LABEL_DELAY_MS);

    try {
      const result = await runCycle({
        http: createHttp(DATABASE_URL),
        code: syncCode,
        deviceId,
        state,
        force,
        readLocal: () => toLocalNotes(paramsRef.current.tabsRef.current),
        isCancelled: stale,
        saveState: (s) => {
          if (!stale()) persist(s);
        },
        apply: (plan) => {
          const p = paramsRef.current;
          const base = p.tabsRef.current;
          const makeBlank = () => p.makeBlankTab(deviceId);
          const r = applyToTabs(base, plan, makeBlank);
          if (r.tabs !== base) {
            // The tabs may have changed since `base` (an edit still waiting for
            // its render): apply again on whatever is there by then, and give
            // back what has to be skipped because of that.
            p.setTabs((prev) => {
              if (prev === base) return r.tabs;
              const again = applyToTabs(prev, plan, makeBlank);
              for (const id of again.skipped) {
                if (!r.skipped.includes(id)) queueMicrotask(() => plan.lateSkip(id));
              }
              return again.tabs;
            });
            if (r.removed.length > 0) {
              const activeId = base[p.activeTabRef.current]?.id;
              let at = r.tabs.findIndex((t) => t.id === activeId);
              if (at < 0) at = Math.min(p.activeTabRef.current, r.tabs.length - 1);
              p.setActiveTab(at);
              p.onTabsRemoved?.(r.removed);
            }
          }
          return r.skipped;
        },
      });
      clearTimeout(label);
      if (stale()) return;
      if (!result.shortCircuit) lastFullReadRef.current = Date.now();
      lastSyncAtRef.current = Date.now();
      setStatus({ phase: "synced", lastSyncAt: lastSyncAtRef.current });
    } catch (e) {
      clearTimeout(label);
      if (e instanceof CycleCancelled || stale()) return;
      setStatus(statusFromError(e, lastSyncAtRef.current));
    }
  }, [persist]);

  /** One cycle at a time; a request during a cycle queues exactly one more. */
  const syncNow = useCallback(() => {
    if (runningRef.current) {
      queuedRef.current = true;
      return;
    }
    runningRef.current = true;
    void (async () => {
      try {
        do {
          queuedRef.current = false;
          await cycleOnce();
        } while (queuedRef.current);
      } finally {
        runningRef.current = false;
      }
    })();
  }, [cycleOnce]);

  // ---- triggers

  const { ready, deviceId } = params;
  useEffect(() => {
    if (!ready || !deviceId || !code) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const stopInterval = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const startInterval = () => {
      if (!interval) interval = setInterval(syncNow, SYNC_INTERVAL_MS);
    };

    syncNow();
    if (document.visibilityState === "visible") startInterval();

    const onVisibility = () => {
      if (document.visibilityState === "visible") startInterval();
      else stopInterval();
      // Shown: catch up. Hidden: let the last edit leave before the app sleeps.
      syncNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Nothing runs while the window stays hidden (SYNC.md).
    const onOnline = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    window.addEventListener("online", onOnline);
    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [ready, deviceId, code, syncNow]);

  // ---- the code

  const adopt = useCallback(
    (next: string | null) => {
      epochRef.current += 1;
      stateRef.current = resetForNewCode(stateRef.current);
      persist(stateRef.current);
      codeRef.current = next;
      lastSyncAtRef.current = undefined;
      lastFullReadRef.current = 0;
      setCode(next);
      setStatus(next ? { phase: "syncing" } : { phase: "off" });
    },
    [persist],
  );

  const storeAndAdopt = useCallback(
    async (next: string): Promise<CodeResult> => {
      await initRef.current;
      try {
        await storeSyncCode(next);
      } catch {
        return { ok: false, error: "Não deu para guardar o código neste computador." };
      }
      adopt(next);
      syncNow();
      return { ok: true, code: next };
    },
    [adopt, syncNow],
  );

  const createCode = useCallback(() => storeAndAdopt(generateSyncCode(randomBytes)), [storeAndAdopt]);

  const joinCode = useCallback(
    async (input: string): Promise<CodeResult> => {
      const normalized = normalizeSyncCode(input);
      if (!normalized) return { ok: false, error: INVALID_CODE_TEXT };
      return storeAndAdopt(normalized);
    },
    [storeAndAdopt],
  );

  const leave = useCallback(async () => {
    await initRef.current;
    await clearSyncCode();
    adopt(null);
  }, [adopt]);

  // ---- deletions

  const noteDeleted = useCallback(
    (id: string) => {
      void (async () => {
        await initRef.current;
        const state = stateRef.current;
        state.deleted[id] = Date.now();
        trimDeleted(state);
        persist(state);
        syncNow();
      })();
    },
    [persist, syncNow],
  );

  const noteRestored = useCallback(
    (id: string) => {
      void (async () => {
        await initRef.current;
        const state = stateRef.current;
        if (id in state.deleted) {
          delete state.deleted[id];
          persist(state);
          // Uploaded again with a newer edit time than the deletion it undoes.
          // Queued after the caller's own setTabs that put the note back.
          const at = Date.now();
          paramsRef.current.setTabs((prev) =>
            prev.some((t) => t.id === id && t.updatedAt < at)
              ? prev.map((t) => (t.id === id && t.updatedAt < at ? { ...t, updatedAt: at } : t))
              : prev,
          );
        }
        syncNow();
      })();
    },
    [persist, syncNow],
  );

  const ignoreNotes = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      void (async () => {
        await initRef.current;
        addIgnored(stateRef.current, ids);
        persist(stateRef.current);
      })();
    },
    [persist],
  );

  return { status, code, createCode, joinCode, leave, syncNow, noteDeleted, noteRestored, ignoreNotes };
}
