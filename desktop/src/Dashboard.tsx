import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./theme.css";
import "./dashboard.css";
import { scanTxtNotes, notePreviews, openNoteInMain, type ScannedNote } from "./dashboardApi";
import {
  AppMark,
  BackIcon,
  CaptionCloseIcon,
  ChevronRightIcon,
  MaximizeIcon,
  MinimizeIcon,
  RefreshIcon,
} from "./icons";

function noteSegments(note: ScannedNote): string[] {
  return [note.rootLabel, ...note.relativeDirs];
}

const NOTE_EXT_RE = /\.(cyte|txt|md)$/i;

function extOf(note: ScannedNote): string {
  return (note.fileName.match(NOTE_EXT_RE)?.[0] ?? "").toLowerCase();
}

/** Only .cyte files carry the format's id/metadata, so only they're what
 * the sync engine can actually recognize as "this device's copy of note X" -
 * imported .txt/.md are readable here but stay outside that identity. */
function isNativeFormat(note: ScannedNote): boolean {
  return extOf(note) === ".cyte";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "Hoje", "Ontem", the weekday within the last week, then "22 set". */
function formatDate(ms: number): string {
  if (!ms) return "";
  const date = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - new Date(ms).setHours(0, 0, 0, 0)) / DAY_MS);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 7) return WEEKDAYS[date.getDay()];
  const dayMonth = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`;
}

/** The real folder on disk behind the current breadcrumb, read off any note inside it. */
function diskPathOf(sample: ScannedNote | undefined, depth: number): string {
  if (!sample) return "";
  const parts = sample.fullPath.split(/[\\/]/);
  // Drop the file name, then whatever folders sit below the current one.
  const extra = 1 + (1 + sample.relativeDirs.length - depth);
  return parts.slice(0, parts.length - extra).join("\\");
}

const isPopup = new URLSearchParams(window.location.search).has("dashboard-popup");
// Written by the main window, so Dashnotes opens in the same theme.
const THEME_KEY = "cynote-theme";

function applyTheme() {
  let theme = "dark";
  try {
    if (localStorage.getItem(THEME_KEY) === "light") theme = "light";
  } catch {
    // keep the default
  }
  document.documentElement.setAttribute("data-theme", theme);
}

export default function Dashboard() {
  const [notes, setNotes] = useState<ScannedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<string[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  // Note previews by path, read only for the folder on screen.
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  const scanId = useRef(0);

  const scan = () => {
    const id = ++scanId.current;
    setLoading(true);
    setPreviews(new Map());
    scanTxtNotes()
      .then((found) => {
        if (id === scanId.current) setNotes(found);
      })
      .finally(() => {
        if (id === scanId.current) setLoading(false);
      });
  };

  useEffect(() => {
    applyTheme();
    // The main window changing theme reaches here as a storage event.
    window.addEventListener("storage", applyTheme);
    scan();
    return () => window.removeEventListener("storage", applyTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { folders, files, sample } = useMemo(() => {
    const folderMap = new Map<string, { notes: number; folders: Set<string> }>();
    const files: ScannedNote[] = [];
    let sample: ScannedNote | undefined;
    for (const note of notes) {
      const segments = noteSegments(note);
      const matchesPrefix = path.every((p, i) => segments[i] === p);
      if (!matchesPrefix) continue;
      sample ??= note;
      if (segments.length === path.length) {
        files.push(note);
      } else if (segments.length > path.length) {
        const name = segments[path.length];
        const entry = folderMap.get(name) ?? { notes: 0, folders: new Set<string>() };
        if (segments.length === path.length + 1) entry.notes++;
        else entry.folders.add(segments[path.length + 1]);
        folderMap.set(name, entry);
      }
    }
    const folders = [...folderMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, c]) => ({
        name,
        meta:
          [c.notes ? plural(c.notes, "nota", "notas") : "", c.folders.size ? plural(c.folders.size, "pasta", "pastas") : ""]
            .filter(Boolean)
            .join(" · ") || "Vazia",
      }));
    files.sort((a, b) => b.modifiedMs - a.modifiedMs);
    return { folders, files, sample };
  }, [notes, path]);

  useEffect(() => {
    const missing = files.map((f) => f.fullPath).filter((p) => !previews.has(p));
    if (missing.length === 0) return;
    let cancelled = false;
    notePreviews(missing)
      .then((texts) => {
        if (cancelled) return;
        setPreviews((prev) => {
          const next = new Map(prev);
          texts.forEach((text, i) => next.set(missing[i], text));
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // A folder that was there before a rescan may be gone after it.
  useEffect(() => {
    if (!loading && path.length > 0 && folders.length === 0 && files.length === 0) setPath([]);
  }, [loading, path, folders.length, files.length]);

  const openNote = async (note: ScannedNote) => {
    setOpening(note.fullPath);
    await openNoteInMain(note.fullPath);
    setOpening(null);
    if (isPopup) {
      getCurrentWindow()
        .hide()
        .catch(() => {});
    }
  };

  const crumbs = ["Início", ...path];
  const total = folders.length + files.length;
  const diskPath = path.length === 0 ? "Área de Trabalho · Documentos" : diskPathOf(sample, path.length);

  return (
    <div className="cy-window dash-window">
      <header className="titlebar" data-tauri-drag-region>
        <div className="dash-brand" data-tauri-drag-region>
          <AppMark />
          <span data-tauri-drag-region>Dashnotes</span>
        </div>
        <div className="titlebar-drag" data-tauri-drag-region />
        <button className="win-btn" title="Minimizar" onClick={() => getCurrentWindow().minimize()}>
          <MinimizeIcon />
        </button>
        <button className="win-btn" title="Maximizar" onClick={() => getCurrentWindow().toggleMaximize()}>
          <MaximizeIcon />
        </button>
        <button className="win-btn close" title="Fechar" onClick={() => getCurrentWindow().close()}>
          <CaptionCloseIcon />
        </button>
      </header>

      <div className="cy-page dash-page">
        <div className="dash-nav">
          <button
            className="icon-btn"
            title="Voltar"
            disabled={path.length === 0}
            onClick={() => setPath((p) => p.slice(0, -1))}
          >
            <BackIcon />
          </button>
          <nav className="dash-crumbs" aria-label="Pastas">
            {crumbs.map((name, i) => {
              const last = i === crumbs.length - 1;
              return (
                <div key={i} className="dash-crumb-group">
                  {i > 0 && <ChevronRightIcon size={12} />}
                  <button
                    className={"dash-crumb" + (last ? " current" : "")}
                    aria-current={last ? "page" : undefined}
                    onClick={() => {
                      if (!last) setPath(path.slice(0, i));
                    }}
                  >
                    {name}
                  </button>
                </div>
              );
            })}
          </nav>
          <button className="btn small" onClick={scan} disabled={loading}>
            <RefreshIcon size={14} />
            Procurar de novo
          </button>
        </div>

        {loading ? (
          <div className="dash-scroll" aria-busy="true">
            <div className="dash-section">Procurando notas…</div>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="dash-row dash-ghost">
                <span className="dash-ghost-bar" style={{ width: 120 + ((i * 53) % 140) }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="dash-scroll">
            {folders.length > 0 && (
              <>
                <div className="dash-section">Pastas</div>
                {folders.map((folder) => (
                  <button
                    key={folder.name}
                    className="dash-row dash-folder"
                    title={folder.name}
                    onClick={() => setPath([...path, folder.name])}
                  >
                    <FolderIcon />
                    <span className="dash-row-title">{folder.name}</span>
                    <span className="dash-row-meta">{folder.meta}</span>
                  </button>
                ))}
              </>
            )}

            {files.length > 0 && (
              <>
                <div className="dash-section">Notas</div>
                {files.map((note) => {
                  const ext = extOf(note);
                  const preview = previews.get(note.fullPath);
                  return (
                    <button
                      key={note.fullPath}
                      className="dash-row dash-note"
                      onClick={() => openNote(note)}
                      disabled={opening === note.fullPath}
                      title={isNativeFormat(note) ? "Nota do Cynote" : "Arquivo de texto"}
                    >
                      <NoteFileIcon native={isNativeFormat(note)} />
                      <span className="dash-row-main">
                        <span className="dash-row-title">{note.fileName.replace(NOTE_EXT_RE, "")}</span>
                        {preview && <span className="dash-row-preview">{preview}</span>}
                      </span>
                      <span className="dash-row-ext">{ext}</span>
                      <span className="dash-row-date">{formatDate(note.modifiedMs)}</span>
                    </button>
                  );
                })}
              </>
            )}

            {total === 0 && (
              <div className="cy-empty dash-empty">
                <div className="cy-empty-title">{path.length === 0 ? "Nenhuma nota encontrada" : "Pasta vazia"}</div>
                <div className="cy-empty-hint">
                  {path.length === 0
                    ? "Notas salvas na Área de Trabalho ou em Documentos aparecem aqui."
                    : "Notas salvas aqui aparecem sozinhas."}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="status-bar dash-footer">
        <span className="status-item dash-footer-path" title={diskPath}>
          {diskPath}
        </span>
        <div className="cy-spacer" />
        <span className="status-item static">{loading ? "Procurando…" : plural(total, "item", "itens")}</span>
      </footer>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.8l1.5 1.6h4.7A1.5 1.5 0 0 1 14 6.1v5.4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
    </svg>
  );
}

/** A ruled sheet; Cynote's own notes carry the ballpoint line. */
function NoteFileIcon({ native }: { native: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 1.8h5.4L12.5 5v8.2a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z" stroke="currentColor" />
      <path d="M5.5 8.2h5M5.5 11h5" stroke={native ? "var(--accent)" : "currentColor"} />
    </svg>
  );
}
