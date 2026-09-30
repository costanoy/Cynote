import { useEffect, useState } from "react";
import { BackIcon, Bud, LeafDivider, OpenLeaves } from "../icons";
import type { PeerInfo } from "../types";
import { listDiscoveredDevices, listTrustedDevices, requestPairing } from "../sync";
import { getCloudSyncId, generateCloudSyncId, setCloudSyncId, clearCloudSyncId } from "../cloudSync";

type Props = {
  darkMode: boolean;
  onBack: () => void;
  onToggleDarkMode: () => void;
  spellCheckEnabled: boolean;
  onToggleSpellCheck: () => void;
  autoStartEnabled: boolean;
  onToggleAutoStart: () => void;
};

export function SettingsView({
  darkMode,
  onBack,
  onToggleDarkMode,
  spellCheckEnabled,
  onToggleSpellCheck,
  autoStartEnabled,
  onToggleAutoStart,
}: Props) {
  const [discovered, setDiscovered] = useState<PeerInfo[]>([]);
  const [trusted, setTrusted] = useState<PeerInfo[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const [cloudSyncId, setCloudSyncIdState] = useState<string | null>(null);
  const [cloudCodeInput, setCloudCodeInput] = useState("");
  const [cloudCopied, setCloudCopied] = useState(false);
  const [cloudJoining, setCloudJoining] = useState(false);
  const [cloudGenerating, setCloudGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      listDiscoveredDevices().then((d) => !cancelled && setDiscovered(d));
      listTrustedDevices().then((d) => !cancelled && setTrusted(d));
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    getCloudSyncId().then(setCloudSyncIdState);
  }, []);

  const connect = async (peer: PeerInfo) => {
    setConnectingId(peer.deviceId);
    await requestPairing(peer.deviceId);
    setConnectingId(null);
  };

  const generateCode = async () => {
    setCloudGenerating(true);
    const id = await generateCloudSyncId();
    setCloudSyncIdState(id);
    setCloudGenerating(false);
  };

  const copyCode = async () => {
    if (!cloudSyncId) return;
    try {
      await navigator.clipboard.writeText(cloudSyncId);
      setCloudCopied(true);
      setTimeout(() => setCloudCopied(false), 1500);
    } catch {
      // clipboard unavailable - ignore
    }
  };

  const joinCode = async () => {
    const code = cloudCodeInput.trim();
    if (!code) return;
    setCloudJoining(true);
    const ok = await setCloudSyncId(code);
    if (ok) {
      setCloudSyncIdState(code);
      setCloudCodeInput("");
    }
    setCloudJoining(false);
  };

  const disableCloudSync = async () => {
    await clearCloudSyncId();
    setCloudSyncIdState(null);
  };

  const toggles = [
    {
      label: "Tema escuro",
      hint: "Ativa a interface escura do bloquinho",
      on: darkMode,
      toggle: onToggleDarkMode,
    },
    {
      label: "Verificação ortográfica",
      hint: "Sublinhado vermelho embaixo de possíveis erros",
      on: spellCheckEnabled,
      toggle: onToggleSpellCheck,
    },
    {
      label: "Iniciar com o Windows",
      hint: "Abre o Cynote em segundo plano ao ligar o computador, para o atalho Ctrl+Shift+Space estar sempre disponível",
      on: autoStartEnabled,
      toggle: onToggleAutoStart,
    },
  ];

  return (
    <div className="settings-wrap">
      <div className="settings-col">
        <div className="settings-head">
          <button className="pill" onClick={onBack}>
            <BackIcon />
            Voltar
          </button>
          <div className="settings-title-wrap">
            <div className="settings-title">Configurações</div>
            <svg className="settings-title-vine" width="130" height="8" viewBox="0 0 130 8">
              <path d="M1 5 C30 -1 52 9 84 4 C100 1.5 112 2.5 128 5" />
            </svg>
          </div>
        </div>

        {toggles.map((t, i) => (
          <div key={t.label} className="settings-row" style={{ animationDelay: i * 50 + "ms" }}>
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
        ))}

        <div className="settings-divider">
          <span />
          <LeafDivider />
          <span />
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Sincronização — Dispositivos na mesma rede</div>

          {trusted.map((d) => (
            <div key={d.deviceId} className="device-row synced">
              <OpenLeaves />
              <span className="device-row-name">{d.deviceName}</span>
              <span className="device-row-status">Sincronizado</span>
            </div>
          ))}

          {discovered.map((d) => (
            <div key={d.deviceId} className="device-row found">
              <Bud color="var(--ink-soft)" outline />
              <span className="device-row-name">{d.deviceName}</span>
              <button
                className="pill primary small"
                onClick={() => connect(d)}
                disabled={connectingId === d.deviceId}
              >
                {connectingId === d.deviceId ? "Conectando…" : "Conectar"}
              </button>
            </div>
          ))}

          {discovered.length === 0 && (
            <div className="device-searching">
              <span className="device-searching-bud">
                <Bud />
              </span>
              Procurando dispositivos…
            </div>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Sincronização pela internet</div>
          <div className="settings-row-hint">
            Sincronize com outro dispositivo em qualquer rede, usando um código de pareamento
          </div>

          {cloudSyncId ? (
            <div className="cloud-on">
              <div className="sync-code-box">
                <span className="sync-code-text">{cloudSyncId}</span>
                <button className="pill primary small" onClick={copyCode}>
                  {cloudCopied ? "Copiado!" : "Copiar"}
                </button>
              </div>
              <div className="settings-row-hint">Digite esse código no outro dispositivo para conectá-lo</div>
              <button className="sync-clear-link" onClick={disableCloudSync}>
                Desativar sincronização pela internet
              </button>
            </div>
          ) : (
            <div className="cloud-off">
              <div>
                <button className="pill primary" onClick={generateCode} disabled={cloudGenerating}>
                  {cloudGenerating ? "Gerando…" : "Gerar código"}
                </button>
              </div>
              <div className="settings-row-hint">Ou cole um código gerado em outro dispositivo:</div>
              <div className="sync-code-input-row">
                <input
                  className="sync-code-input"
                  placeholder="Código de pareamento"
                  value={cloudCodeInput}
                  onChange={(e) => setCloudCodeInput(e.target.value)}
                />
                <button className="pill" onClick={joinCode} disabled={cloudJoining || !cloudCodeInput.trim()}>
                  {cloudJoining ? "Conectando…" : "Conectar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
