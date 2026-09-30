import { useEffect, useRef } from "react";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, CloseIcon } from "../icons";

export type FindMode = "find" | "replace" | "goto";

type Props = {
  mode: FindMode;
  query: string;
  replacement: string;
  caseSensitive: boolean;
  matchCount: number;
  currentIndex: number;
  lineCount: number;
  /** Bumped whenever Ctrl+F/H/G is pressed again, to re-focus and select the input. */
  focusToken: number;
  onQueryChange: (q: string) => void;
  onReplacementChange: (r: string) => void;
  onToggleCase: () => void;
  onToggleReplace: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReplaceOne: () => void;
  onReplaceAll: () => void;
  onGoToLine: (line: number) => void;
  onClose: () => void;
};

export function FindBar(p: Props) {
  const mainRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
    mainRef.current?.select();
  }, [p.focusToken, p.mode]);

  if (p.mode === "goto") {
    return (
      <div className="find-bar" onMouseDown={(e) => e.stopPropagation()}>
        <div className="find-row goto">
          <input
            ref={mainRef}
            className="find-input goto"
            inputMode="numeric"
            placeholder={`Ir para a linha (1–${p.lineCount})`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseInt(e.currentTarget.value, 10);
                if (!Number.isNaN(n)) p.onGoToLine(Math.max(1, Math.min(p.lineCount, n)));
              } else if (e.key === "Escape") {
                e.preventDefault();
                p.onClose();
              }
            }}
          />
          <button className="find-btn" title="Fechar (Esc)" onClick={p.onClose}>
            <CloseIcon width={2} />
          </button>
        </div>
      </div>
    );
  }

  const status =
    p.query === "" ? "" : p.matchCount === 0 ? "Sem resultados" : `${p.currentIndex + 1} de ${p.matchCount}`;

  return (
    <div className="find-bar" onMouseDown={(e) => e.stopPropagation()}>
      <div className="find-row">
        <button
          className={"find-btn find-toggle-replace" + (p.mode === "replace" ? " open" : "")}
          title="Alternar substituição (Ctrl+H)"
          onClick={p.onToggleReplace}
        >
          <ChevronRightIcon />
        </button>
        <input
          ref={mainRef}
          className="find-input"
          placeholder="Localizar"
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) p.onPrev();
              else p.onNext();
            } else if (e.key === "Escape") {
              e.preventDefault();
              p.onClose();
            }
          }}
        />
        <button
          className={"find-case" + (p.caseSensitive ? " active" : "")}
          title="Diferenciar maiúsculas e minúsculas"
          onClick={p.onToggleCase}
        >
          Aa
        </button>
        <span className={"find-status" + (p.query && p.matchCount === 0 ? " none" : "")}>{status}</span>
        <button className="find-btn" title="Anterior (Shift+Enter)" disabled={p.matchCount === 0} onClick={p.onPrev}>
          <ArrowUpIcon />
        </button>
        <button className="find-btn" title="Próximo (Enter)" disabled={p.matchCount === 0} onClick={p.onNext}>
          <ArrowDownIcon />
        </button>
        <button className="find-btn" title="Fechar (Esc)" onClick={p.onClose}>
          <CloseIcon width={2} />
        </button>
      </div>
      {p.mode === "replace" && (
        <div className="find-row replace">
          <input
            className="find-input"
            placeholder="Substituir por"
            value={p.replacement}
            onChange={(e) => p.onReplacementChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.ctrlKey && e.altKey) p.onReplaceAll();
                else p.onReplaceOne();
              } else if (e.key === "Escape") {
                e.preventDefault();
                p.onClose();
              }
            }}
          />
          <button className="find-text-btn" disabled={p.matchCount === 0} onClick={p.onReplaceOne} title="Substituir (Enter)">
            Substituir
          </button>
          <button
            className="find-text-btn"
            disabled={p.matchCount === 0}
            onClick={p.onReplaceAll}
            title="Substituir tudo (Ctrl+Alt+Enter)"
          >
            Tudo
          </button>
        </div>
      )}
    </div>
  );
}
