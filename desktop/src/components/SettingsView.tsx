import { useEffect, useRef, useState } from "react";
import { BackIcon } from "../icons";
import type { CloudSyncApi } from "../sync/useCloudSync";

type Props = {
  darkMode: boolean;
  onBack: () => void;
  onToggleDarkMode: () => void;
  spellCheckEnabled: boolean;
  onToggleSpellCheck: () => void;
  autoStartEnabled: boolean;
  onToggleAutoStart: () => void;
  wordWrap?: boolean;
  onToggleWordWrap?: () => void;
  lineNumbers?: boolean;
  onToggleLineNumbers?: () => void;
  sync: CloudSyncApi;
};

type Toggle = { label: string; hint: string; on: boolean; toggle: () => void };

// The editing shortcuts worth knowing, in the order people reach for them.
const SHORTCUTS: [string, string][] = [
  ["Ctrl+D", "Seleciona a próxima ocorrência"],
  ["Ctrl+Shift+L", "Seleciona todas as ocorrências"],
  ["Alt+clique", "Adiciona um cursor"],
  ["Ctrl+Alt+↑ / ↓", "Adiciona um cursor acima ou abaixo"],
  ["Shift+Alt+arrastar", "Seleção em coluna (ou o botão do meio)"],
  ["Alt+↑ / ↓", "Move a linha"],
  ["Shift+Alt+↑ / ↓", "Duplica a linha"],
  ["Ctrl+Shift+K", "Apaga a linha"],
  ["Ctrl+L", "Seleciona a linha"],
  ["Ctrl+F / Ctrl+H", "Localizar / Substituir"],
  ["Ctrl+G", "Ir para a linha"],
  ["Alt+Z", "Quebra de linha"],
  ["Ctrl+Shift+T", "Reabre a última nota fechada"],
  ["Ctrl+Shift+D", "Desenhar na nota"],
];

function SwitchRow({ t }: { t: Toggle }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-label">{t.label}</div>
        <div className="settings-row-hint">{t.hint}</div>
      </div>
      <button
        role="switch"
        aria-checked={t.on}
        aria-label={t.label}
        className={"switch-track" + (t.on ? " on" : "")}
        onClick={t.toggle}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

export function SettingsView({
  darkMode,
  onBack,
  onToggleDarkMode,
  spellCheckEnabled,
  onToggleSpellCheck,
  autoStartEnabled,
  onToggleAutoStart,
  wordWrap,
  onToggleWordWrap,
  lineNumbers,
  onToggleLineNumbers,
  sync,
}: Props) {
  const { status, code } = sync;
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  // Esc goes back to the note, like closing a settings tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const createCode = async () => {
    setBusy(true);
    setCodeError(null);
    const result = await sync.createCode();
    if (!result.ok) setCodeError(result.error);
    setBusy(false);
  };

  const joinCode = async () => {
    if (!codeInput.trim()) return;
    setBusy(true);
    setCodeError(null);
    const result = await sync.joinCode(codeInput);
    if (result.ok) setCodeInput("");
    else setCodeError(result.error);
    setBusy(false);
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable: the code is on screen to be read out
    }
  };

  const statusText = (): string => {
    switch (status.phase) {
      case "synced":
        return status.lastSyncAt
          ? "Sincronizado às " +
              new Date(status.lastSyncAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : "Sincronizado";
      case "syncing":
        return "Sincronizando…";
      case "offline":
        return "Sem conexão. Tento de novo sozinho.";
      case "denied":
        return "O servidor de sincronização recusou o acesso. Tento de novo mais tarde.";
      case "error":
        return "Não deu para sincronizar: " + (status.message ?? "erro inesperado");
      default:
        return "";
    }
  };

  const look: Toggle[] = [
    { label: "Tema escuro", hint: "Folha escura, para escrever à noite.", on: darkMode, toggle: onToggleDarkMode },
  ];
  const writing: Toggle[] = [
    ...(onToggleWordWrap
      ? [{ label: "Quebra de linha", hint: "Linhas compridas continuam na pauta de baixo (Alt+Z).", on: !!wordWrap, toggle: onToggleWordWrap }]
      : []),
    ...(onToggleLineNumbers
      ? [{ label: "Números de linha", hint: "Mostra o número de cada linha na margem.", on: !!lineNumbers, toggle: onToggleLineNumbers }]
      : []),
    {
      label: "Verificação ortográfica",
      hint: "Sublinha em vermelho as palavras que podem estar erradas.",
      on: spellCheckEnabled,
      toggle: onToggleSpellCheck,
    },
  ];
  const system: Toggle[] = [
    {
      label: "Iniciar com o Windows",
      hint: "Deixa o Cynote pronto na bandeja ao ligar o computador, para o Ctrl+Shift+Espaço funcionar sempre.",
      on: autoStartEnabled,
      toggle: onToggleAutoStart,
    },
  ];

  return (
    <div className="settings-wrap">
      <div className="settings-col">
        <div className="settings-head">
          <button className="icon-btn" onClick={onBack} title="Voltar para a nota (Esc)" aria-label="Voltar para a nota">
            <BackIcon />
          </button>
          <h1 className="settings-title">Configurações</h1>
        </div>

        <section className="settings-section" aria-labelledby="set-look">
          <h2 className="settings-section-title" id="set-look">
            Aparência
          </h2>
          {look.map((t) => (
            <SwitchRow key={t.label} t={t} />
          ))}
        </section>

        <section className="settings-section" aria-labelledby="set-writing">
          <h2 className="settings-section-title" id="set-writing">
            Escrita
          </h2>
          {writing.map((t) => (
            <SwitchRow key={t.label} t={t} />
          ))}
        </section>

        <section className="settings-section" aria-labelledby="set-system">
          <h2 className="settings-section-title" id="set-system">
            Sistema
          </h2>
          {system.map((t) => (
            <SwitchRow key={t.label} t={t} />
          ))}
        </section>

        <section className="sync-section" aria-labelledby="set-sync">
          <h2 className="settings-section-title" id="set-sync">
            Sincronizar com o celular
          </h2>
          <p className="sync-explain">
            As notas ficam iguais no computador e no celular, pela internet e sem conta. Crie um código aqui e digite o
            mesmo código no celular (ou o contrário).
          </p>

          {code ? (
            <>
              <div className="sync-code-row">
                <code className="sync-code">{code}</code>
                <button className="btn" onClick={copyCode}>
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <div className="sync-status" data-phase={status.phase} role="status">
                {statusText()}
              </div>
              <button className="btn link danger" onClick={() => void sync.leave()}>
                Desconectar este computador
              </button>
            </>
          ) : (
            <div className="sync-actions">
              <button className="btn primary" onClick={createCode} disabled={busy}>
                Criar código
              </button>
              <span className="sync-or">ou</span>
              <input
                className="text-input"
                placeholder="Colar código"
                aria-label="Código de sincronização"
                spellCheck={false}
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setCodeError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") joinCode();
                }}
              />
              <button className="btn" onClick={joinCode} disabled={busy || !codeInput.trim()}>
                Conectar
              </button>
            </div>
          )}

          {codeError && (
            <div className="sync-error" role="alert">
              {codeError}
            </div>
          )}
        </section>

        <section className="settings-section" aria-labelledby="set-keys">
          <h2 className="settings-section-title" id="set-keys">
            Atalhos do editor
          </h2>
          <dl className="shortcut-list">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="shortcut-row">
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
