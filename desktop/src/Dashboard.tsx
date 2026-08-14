import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./theme.css";
import "./dashboard.css";
import { scanTxtNotes, openNoteInMain, type ScannedNote } from "./dashboardApi";
import { FolderIcon, NoteFileIcon, BackChevronIcon, LogoIcon } from "./icons";

function noteSegments(note: ScannedNote): string[] {
  return [note.rootLabel, ...note.relativeDirs];
}

export default function Dashboard() {
  const [notes, setNotes] = useState<ScannedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<string[]>([]);
  const [popup, setPopup] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    scanTxtNotes()
      .then(setNotes)
      .finally(() => setLoading(false));
    getCurrentWindow()
      .isDecorated()
      .then((decorated) => setPopup(!decorated))
      .catch(() => {});
  }, []);

  const { folders, files } = useMemo(() => {
    const folderSet = new Map<string, string>();
    const files: ScannedNote[] = [];
    for (const note of notes) {
      const segments = noteSegments(note);
      const matchesPrefix = path.every((p, i) => segments[i] === p);
      if (!matchesPrefix) continue;
      if (segments.length === path.length) {
        files.push(note);
      } else if (segments.length > path.length) {
        const next = segments[path.length];
        folderSet.set(next, next);
      }
    }
    return { folders: [...folderSet.values()].sort(), files };
  }, [notes, path]);

  const openNote = async (note: ScannedNote) => {
    setOpening(note.fullPath);
    await openNoteInMain(note.fullPath);
    setOpening(null);
    if (popup) {
      getCurrentWindow()
        .hide()
        .catch(() => {});
    }
  };

  return (
    <div className="dash-root">
      <div className="dash-header" data-tauri-drag-region>
        <LogoIcon />
        <span className="dash-title heading-font">Cynote Dashboard</span>
      </div>

      <div className="dash-breadcrumb">
        {path.length > 0 && (
          <button className="dash-back" onClick={() => setPath((p) => p.slice(0, -1))} title="Voltar">
            <BackChevronIcon />
          </button>
        )}
        <button className="dash-crumb" onClick={() => setPath([])}>
          Início
        </button>
        {path.map((segment, i) => (
          <span key={i} className="dash-crumb-group">
            <span className="dash-crumb-sep">/</span>
            <button className="dash-crumb" onClick={() => setPath(path.slice(0, i + 1))}>
              {segment}
            </button>
          </span>
        ))}
      </div>

      <div className="dash-grid-wrap">
        {loading ? (
          <div className="dash-empty">Procurando notas…</div>
        ) : folders.length === 0 && files.length === 0 ? (
          <div className="dash-empty">
            {path.length === 0
              ? "Nenhuma nota .txt encontrada na Área de Trabalho ou em Documentos."
              : "Pasta vazia."}
          </div>
        ) : (
          <div className="dash-grid">
            {folders.map((folder) => (
              <button key={folder} className="dash-tile dash-tile-folder" onClick={() => setPath([...path, folder])}>
                <FolderIcon size={26} />
                <span className="dash-tile-label">{folder}</span>
              </button>
            ))}
            {files.map((note) => (
              <button
                key={note.fullPath}
                className="dash-tile dash-tile-note"
                onClick={() => openNote(note)}
                disabled={opening === note.fullPath}
              >
                <NoteFileIcon size={22} />
                <span className="dash-tile-label">{note.fileName.replace(/\.txt$/i, "")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
