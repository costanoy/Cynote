import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../icons.dart';
import '../theme.dart';
import '../sync/peer_info.dart';

class SyncScreen extends StatelessWidget {
  final CyColors t;
  final List<PeerInfo> discovered;
  final String? connectingToDeviceId;
  final void Function(PeerInfo) onConnect;
  final VoidCallback onContinueWithoutSync;

  const SyncScreen({
    super.key,
    required this.t,
    required this.discovered,
    required this.connectingToDeviceId,
    required this.onConnect,
    required this.onContinueWithoutSync,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: t.bg,
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(40, 60, 40, 48),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const LogoIcon(size: 48 * kScale),
              const SizedBox(height: 22),
              Text(
                'Sincronize com seu computador',
                textAlign: TextAlign.center,
                style: GoogleFonts.bricolageGrotesque(
                  fontWeight: FontWeight.w700,
                  fontSize: 24 * kScale,
                  height: 1.25,
                  color: t.text,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Abra o Cynote no computador conectado à mesma rede para sincronizar suas notas automaticamente.',
                textAlign: TextAlign.center,
                style: GoogleFonts.manrope(fontSize: 13.5 * kScale, height: 1.55, color: t.mutedText),
              ),
              const SizedBox(height: 24),
              if (discovered.isEmpty) ...[
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 14 * kScale,
                      height: 14 * kScale,
                      child: CircularProgressIndicator(strokeWidth: 2, color: t.accent),
                    ),
                    const SizedBox(width: 10),
                    Flexible(
                      child: Text(
                        'Procurando dispositivos…',
                        style: GoogleFonts.manrope(
                          fontSize: 12.5 * kScale,
                          fontWeight: FontWeight.w600,
                          color: t.accent,
                        ),
                      ),
                    ),
                  ],
                ),
              ] else
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final device in discovered) ...[
                      _DeviceRow(
                        t: t,
                        device: device,
                        connecting: connectingToDeviceId == device.deviceId,
                        onTap: () => onConnect(device),
                      ),
                      const SizedBox(height: 8),
                    ],
                  ],
                ),
              const SizedBox(height: 32),
              GestureDetector(
                onTap: onContinueWithoutSync,
                child: Text(
                  'Continuar sem sincronizar',
                  style: GoogleFonts.manrope(fontSize: 13 * kScale, fontWeight: FontWeight.w600, color: t.mutedText),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DeviceRow extends StatelessWidget {
  final CyColors t;
  final PeerInfo device;
  final bool connecting;
  final VoidCallback onTap;

  const _DeviceRow({required this.t, required this.device, required this.connecting, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: connecting ? null : onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: t.cardBg,
          border: Border.all(color: t.cardBorder),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                device.deviceName,
                style: GoogleFonts.manrope(fontWeight: FontWeight.w600, fontSize: 13 * kScale, color: t.text),
              ),
            ),
            if (connecting)
              SizedBox(
                width: 14 * kScale,
                height: 14 * kScale,
                child: CircularProgressIndicator(strokeWidth: 2, color: t.accent),
              )
            else
              Text(
                'Conectar',
                style: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 12.5 * kScale, color: t.accentDark),
              ),
          ],
        ),
      ),
    );
  }
}
