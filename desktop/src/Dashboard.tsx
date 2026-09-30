import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./theme.css";
import "./dashboard.css";
import { scanTxtNotes, openNoteInMain, type ScannedNote } from "./dashboardApi";
import {
  ArchShape,
  BackIcon,
  Bud,
  CloseIcon,
  CornerVignette,
  Leaf,
  LogoMedallion,
  MaximizeIcon,
  MinimizeIcon,
  RefreshIcon,
  Sprout,
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

const LEAF_BY_EXT: Record<string, string> = {
  ".cyte": "var(--accent)",
  ".md": "var(--petrol)",
  ".txt": "var(--gold)",
};

// Each folder is a stained-glass window in one of four colors, picked from
// its name so it stays the same between visits.
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 4;
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

const GHOSTS = [0, 1, 2, 3, 4];

export default function Dashboard() {
  const [notes, setNotes] = useState<ScannedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<string[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const scanId = useRef(0);

  const scan = () => {
    const id = ++scanId.current;
    setLoading(true);
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
      <div className="cy-arch" data-tauri-drag-region>
        <ArchShape />
        <div className="cy-lamp" />
        <div className="cy-arch-strip" data-tauri-drag-region>
          <div className="cy-brand">
            <LogoMedallion />
            <span className="cy-brand-name">Dashnotes</span>
          </div>
          <div className="cy-spacer" data-tauri-drag-region />
          <button className="medallion win" title="Minimizar" onClick={() => getCurrentWindow().minimize()}>
            <MinimizeIcon />
          </button>
          <button className="medallion win" title="Maximizar" onClick={() => getCurrentWindow().toggleMaximize()}>
            <MaximizeIcon />
          </button>
          <button className="medallion win close" title="Fechar" onClick={() => getCurrentWindow().close()}>
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="cy-body">
        <div className="dash-nav">
          <button
            className="medallion dash-back"
            title="Voltar"
            disabled={path.length === 0}
            onClick={() => setPath((p) => p.slice(0, -1))}
          >
            <BackIcon size={14} width={1.7} />
          </button>
          <nav className="dash-crumbs">
            {crumbs.map((name, i) => {
              const last = i === crumbs.length - 1;
              return (
                <div key={i} className="dash-crumb-group">
                  {i > 0 && (
                    <svg className="dash-crumb-sep" width="14" height="10" viewBox="0 0 14 10">
                      <path d="M3 5 L7 1.8 L11 5 L7 8.2 Z" />
                    </svg>
                  )}
                  <button
                    className={"dash-crumb" + (last ? " current" : "")}
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
          <button className="dash-rescan" onClick={scan}>
            <RefreshIcon />
            Procurar de novo
          </button>
        </div>

        <div className="cy-page">
          <div className="cy-page-rule" />
          <CornerVignette corner="tl" />
          <CornerVignette corner="tr" />

          {loading ? (
            <div className="dash-loading">
              <div className="dash-loading-label">
                <span className="dash-loading-bud">
                  <Bud size={18} />
                </span>
                Procurando notas…
              </div>
              <div className="dash-folder-grid">
                {GHOSTS.map((i) => (
                  <div key={i} className="dash-ghost" style={{ animationDelay: i * 160 + "ms" }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="dash-scroll">
              {folders.length > 0 && (
                <>
                  <div className="dash-section">
                    <span>Pastas</span>
                    <div />
                  </div>
                  <div className="dash-folder-grid">
                    {folders.map((folder, i) => {
                      const hue = hueOf(folder.name);
                      return (
                        <button
                          key={folder.name}
                          className="dash-folder"
                          title={folder.name}
                          style={
                            {
                              "--glass": `var(--glass-${hue})`,
                              "--bead": `var(--glass-${(hue + 1) % 4})`,
                              animationDelay: i * 50 + "ms",
                            } as React.CSSProperties
                          }
                          onClick={() => setPath([...path, folder.name])}
                        >
                          <span className="dash-folder-shine" />
                          <span className="dash-folder-mullion v" />
                          <span className="dash-folder-mullion h" />
                          <span className="dash-folder-bead" />
                          <span className="dash-folder-plate">
                            <span className="dash-folder-name">{folder.name}</span>
                            <span className="dash-folder-meta">{folder.meta}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {files.length > 0 && (
                <>
                  <div className="dash-section">
                    <span>Notas</span>
                    <div />
                  </div>
                  <div className="dash-note-grid">
                    {files.map((note, i) => {
                      const ext = extOf(note);
                      return (
                        <button
                          key={note.fullPath}
                          className="dash-note"
                          style={{ animationDelay: folders.length * 50 + i * 45 + "ms" }}
                          onClick={() => openNote(note)}
                          disabled={opening === note.fullPath}
                          title={isNativeFormat(note) ? "Nota Cynote" : "Arquivo de texto importado"}
                        >
                          <span className="dash-note-rule" />
                          <span className="dash-note-top">
                            <Leaf size={14} color={LEAF_BY_EXT[ext] ?? "var(--gold)"} rotate={40} />
                            <span className="dash-note-ext">{ext}</span>
                            <span className="cy-spacer" />
                            <span className="dash-note-date">{formatDate(note.modifiedMs)}</span>
                          </span>
                          <span className="dash-note-title">{note.fileName.replace(NOTE_EXT_RE, "")}</span>
                          {note.preview && <span className="dash-note-preview">{note.preview}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {total === 0 && (
                <div className="cy-empty dash-empty">
                  <Sprout />
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

        <div className="dash-footer">
          <span className="dash-footer-path">{diskPath}</span>
          <span>{loading ? "Procurando…" : plural(total, "item", "itens")}</span>
        </div>
      </div>
    </div>
  );
}
