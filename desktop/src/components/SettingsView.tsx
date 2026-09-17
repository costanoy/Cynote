import { useEffect, useState } from "react";
import { BackChevronIcon } from "../icons";
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

  return (
    <div className="settings-wrap">
      <div className="settings-back" onClick={onBack}>
        <BackChevronIcon />
        <span className="settings-back-label">Voltar</span>
      </div>
      <div className="settings-title heading-font">Configurações</div>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">Tema escuro</div>
          <div className="settings-row-hint">Ativa a interface escura do bloquinho</div>
        </div>
        <button className={"switch-track" + (darkMode ? " on" : "")} onClick={onToggleDarkMode}>
          <span className={"switch-thumb" + (darkMode ? " on" : "")} />
        </button>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Verificação ortográfica</div>
          <div className="settings-row-hint">Sublinhado vermelho embaixo de possíveis erros</div>
        </div>
        <button className={"switch-track" + (spellCheckEnabled ? " on" : "")} onClick={onToggleSpellCheck}>
          <span className={"switch-thumb" + (spellCheckEnabled ? " on" : "")} />
        </button>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Iniciar com o Windows</div>
          <div className="settings-row-hint">
            Abre o Cynote em segundo plano ao ligar o computador, para o atalho Ctrl+Shift+Space
            estar sempre disponível
          </div>
        </div>
        <button className={"switch-track" + (autoStartEnabled ? " on" : "")} onClick={onToggleAutoStart}>
          <span className={"switch-thumb" + (autoStartEnabled ? " on" : "")} />
        </button>
      </div>

      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
        <div>
          <div className="settings-row-label">Sincronização</div>
          <div className="settings-row-hint">Dispositivos na mesma rede</div>
        </div>

        {trusted.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {trusted.map((d) => (
              <div key={d.deviceId} className="device-row">
                <span className="device-row-name">{d.deviceName}</span>
                <span className="device-row-status">Sincronizado</span>
              </div>
            ))}
          </div>
        )}

        {discovered.length === 0 ? (
          <div className="settings-row-hint">Procurando dispositivos…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {discovered.map((d) => (
              <div key={d.deviceId} className="device-row">
                <span className="device-row-name">{d.deviceName}</span>
                <button
                  className="device-connect-btn"
                  onClick={() => connect(d)}
                  disabled={connectingId === d.deviceId}
                >
                  {connectingId === d.deviceId ? "Conectando…" : "Conectar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
        <div>
          <div className="settings-row-label">Sincronização pela internet</div>
          <div className="settings-row-hint">
            Sincronize com outro dispositivo em qualquer rede, usando um código de pareamento
          </div>
        </div>

        {cloudSyncId ? (
          <>
            <div className="sync-code-box">
              <span className="sync-code-text">{cloudSyncId}</span>
              <button className="sync-code-copy-btn" onClick={copyCode}>
                {cloudCopied ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <div className="settings-row-hint">
              Digite esse código no outro dispositivo para conectá-lo
            </div>
            <span className="sync-clear-link" onClick={disableCloudSync}>
              Desativar sincronização pela internet
            </span>
          </>
        ) : (
          <>
            <button
              className="device-connect-btn"
              style={{ alignSelf: "flex-start" }}
              onClick={generateCode}
              disabled={cloudGenerating}
            >
              {cloudGenerating ? "Gerando…" : "Gerar código"}
            </button>
            <div className="settings-row-hint">Ou cole um código gerado em outro dispositivo:</div>
            <div className="sync-code-input-row">
              <input
                className="sync-code-input"
                placeholder="Código de pareamento"
                value={cloudCodeInput}
                onChange={(e) => setCloudCodeInput(e.target.value)}
              />
              <button className="sync-code-join-btn" onClick={joinCode} disabled={cloudJoining || !cloudCodeInput.trim()}>
                {cloudJoining ? "Conectando…" : "Conectar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
