import 'package:flutter/material.dart';
import '../icons.dart';
import '../theme.dart';
import '../sync/peer_info.dart';
import '../widgets/greenhouse.dart';

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
    final topInset = MediaQuery.paddingOf(context).top;
    return Container(
      color: t.paper,
      child: Stack(
        children: [
          // An arched frame around the whole page, like a greenhouse doorway.
          Positioned(
            left: 12,
            right: 12,
            top: topInset + 10 > 44 ? topInset + 10 : 44,
            bottom: 22,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.all(color: t.rule),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(120), bottom: Radius.circular(18)),
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(34, 86 + (topInset > 34 ? topInset - 34 : 0), 34, 40),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  LogoMedallion(t: t, size: 88, glowing: true),
                  const SizedBox(height: 14),
                  Text('CYNOTE', style: CyType.display(16, t.inkSoft, letterSpacing: 2.2)),
                  const SizedBox(height: 24),
                  Text(
                    'Sincronize com seu computador',
                    textAlign: TextAlign.center,
                    style: CyType.display(26, t.ink, height: 1.2, letterSpacing: 0.26),
                  ),
                  const SizedBox(height: 14),
                  VineUnderline(t: t),
                  const SizedBox(height: 14),
                  Text(
                    'Abra o Cynote no computador, na mesma rede Wi-Fi. As notas dos dois lados passam a ser as mesmas.',
                    textAlign: TextAlign.center,
                    style: CyType.body(15, t.inkSoft, height: 1.6),
                  ),
                  const SizedBox(height: 28),
                  for (var i = 0; i < discovered.length; i++) ...[
                    RiseIn(
                      delay: Duration(milliseconds: 120 + i * 80),
                      child: _DeviceRow(
                        t: t,
                        device: discovered[i],
                        connecting: connectingToDeviceId == discovered[i].deviceId,
                        onTap: () => onConnect(discovered[i]),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        PulsingBud(t: t),
                        const SizedBox(width: 8),
                        Flexible(child: Text('Procurando dispositivos…', style: CyType.ui(13.5, t.inkFaint))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  PillButton(
                    t: t,
                    label: 'Continuar sem sincronizar',
                    kind: PillKind.link,
                    onTap: onContinueWithoutSync,
                  ),
                ],
              ),
            ),
          ),
        ],
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
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
      decoration: BoxDecoration(
        color: t.paper2,
        border: Border.all(color: t.rule),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          ComputerIcon(color: t.inkSoft),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              device.deviceName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: CyType.ui(15, t.ink),
            ),
          ),
          const SizedBox(width: 12),
          if (connecting)
            Container(
              height: kTouchTarget,
              padding: const EdgeInsets.symmetric(horizontal: 18),
              alignment: Alignment.center,
              decoration: BoxDecoration(color: t.paper, borderRadius: BorderRadius.circular(999)),
              child: Text('Conectando…', style: CyType.ui(14, t.inkSoft, weight: FontWeight.w500)),
            )
          else
            PillButton(t: t, label: 'Conectar', kind: PillKind.primary, horizontalPadding: 18, onTap: onTap),
        ],
      ),
    );
  }
}
