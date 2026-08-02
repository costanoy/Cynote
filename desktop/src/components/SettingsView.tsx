import { useEffect, useState } from "react";
import { BackChevronIcon } from "../icons";
import type { PeerInfo } from "../types";
import { listDiscoveredDevices, listTrustedDevices, requestPairing } from "../sync";

type Props = {
  darkMode: boolean;
  onBack: () => void;
  onToggleDarkMode: () => void;
  spellCheckEnabled: boolean;
  onToggleSpellCheck: () => void;
};

export function SettingsView({
  darkMode,
  onBack,
  onToggleDarkMode,
  spellCheckEnabled,
  onToggleSpellCheck,
}: Props) {
  const [discovered, setDiscovered] = useState<PeerInfo[]>([]);
  const [trusted, setTrusted] = useState<PeerInfo[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);

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

  const connect = async (peer: PeerInfo) => {
    setConnectingId(peer.deviceId);
    await requestPairing(peer.deviceId);
    setConnectingId(null);
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
    </div>
  );
}
