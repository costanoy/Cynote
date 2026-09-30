import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../icons.dart';
import '../theme.dart';
import '../widgets/greenhouse.dart';

class SettingsScreen extends StatelessWidget {
  final CyColors t;
  final bool darkMode;
  final VoidCallback onBack;
  final VoidCallback onToggleDarkMode;
  final String? cloudSyncId;
  final Future<String> Function() onGenerateCloudCode;
  final Future<void> Function(String code) onJoinCloudCode;
  final Future<void> Function() onClearCloudCode;

  const SettingsScreen({
    super.key,
    required this.t,
    required this.darkMode,
    required this.onBack,
    required this.onToggleDarkMode,
    required this.cloudSyncId,
    required this.onGenerateCloudCode,
    required this.onJoinCloudCode,
    required this.onClearCloudCode,
  });

  @override
  Widget build(BuildContext context) {
    return GreenhouseScreen(
      t: t,
      header: [
        Medallion(t: t, onTap: onBack, child: BackChevronIcon(color: t.frameInk)),
        const SizedBox(width: 12),
        Expanded(child: Text('Configurações', style: CyType.display(21, t.frameInk, letterSpacing: 0.63))),
      ],
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 500),
        color: t.paper,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(22, ArchHeader.overhang + 14, 22, 50),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Tema escuro', style: CyType.ui(15.5, t.ink, weight: FontWeight.w500)),
                        const SizedBox(height: 2),
                        Text('A estufa à noite', style: CyType.ui(13, t.inkSoft, height: 1.45)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 16),
                  CySwitch(t: t, on: darkMode, onTap: onToggleDarkMode),
                ],
              ),
              const SizedBox(height: 12),
              LeafDivider(t: t),
              const SizedBox(height: 18),
              _CloudSyncSection(
                t: t,
                syncId: cloudSyncId,
                onGenerate: onGenerateCloudCode,
                onJoin: onJoinCloudCode,
                onClear: onClearCloudCode,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CloudSyncSection extends StatefulWidget {
  final CyColors t;
  final String? syncId;
  final Future<String> Function() onGenerate;
  final Future<void> Function(String code) onJoin;
  final Future<void> Function() onClear;

  const _CloudSyncSection({
    required this.t,
    required this.syncId,
    required this.onGenerate,
    required this.onJoin,
    required this.onClear,
  });

  @override
  State<_CloudSyncSection> createState() => _CloudSyncSectionState();
}

class _CloudSyncSectionState extends State<_CloudSyncSection> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  bool _generating = false;
  bool _joining = false;
  bool _copied = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    setState(() => _generating = true);
    await widget.onGenerate();
    if (mounted) setState(() => _generating = false);
  }

  Future<void> _copy() async {
    final id = widget.syncId;
    if (id == null) return;
    await Clipboard.setData(ClipboardData(text: id));
    if (!mounted) return;
    setState(() => _copied = true);
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  Future<void> _join() async {
    final code = _controller.text.trim();
    if (code.isEmpty) return;
    setState(() => _joining = true);
    await widget.onJoin(code);
    if (mounted) {
      setState(() => _joining = false);
      _controller.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final id = widget.syncId;
    final hint = CyType.ui(13, t.inkSoft, height: 1.45);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Sincronização pela internet', style: CyType.display(17, t.ink, letterSpacing: 0.5)),
        const SizedBox(height: 4),
        Text('Sincronize com outro dispositivo em qualquer rede, usando um código de pareamento', style: hint),
        const SizedBox(height: 12),
        if (id != null) ...[
          Container(
            padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
            decoration: BoxDecoration(
              color: t.paper2,
              border: Border.all(color: t.goldLine),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    id,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: CyType.mono(13, t.ink, letterSpacing: 0.4),
                  ),
                ),
                const SizedBox(width: 8),
                PillButton(
                  t: t,
                  label: _copied ? 'Copiado!' : 'Copiar',
                  kind: PillKind.primary,
                  height: 40,
                  horizontalPadding: 14,
                  fontSize: 13.5,
                  onTap: _copy,
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text('Digite esse código no outro dispositivo para conectá-lo', style: hint),
          PillButton(
            t: t,
            label: 'Desativar sincronização pela internet',
            kind: PillKind.danger,
            fontSize: 13.5,
            onTap: widget.onClear,
          ),
        ] else ...[
          PillButton(
            t: t,
            label: _generating ? 'Gerando…' : 'Gerar código',
            kind: PillKind.primary,
            enabled: !_generating,
            onTap: _generate,
          ),
          const SizedBox(height: 12),
          Text('Ou cole um código gerado em outro dispositivo:', style: hint),
          const SizedBox(height: 12),
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            height: kTouchTarget,
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: t.field,
              border: Border.all(color: _focus.hasFocus ? t.gold : t.fieldBorder),
              borderRadius: BorderRadius.circular(12),
              boxShadow: _focus.hasFocus ? [BoxShadow(color: t.goldSoft, spreadRadius: 3)] : null,
            ),
            child: TextField(
              controller: _controller,
              focusNode: _focus,
              onChanged: (_) => setState(() {}),
              cursorColor: t.accent,
              style: CyType.mono(14, t.fieldInk),
              decoration: InputDecoration(
                isDense: true,
                border: InputBorder.none,
                hintText: 'Código de pareamento',
                hintStyle: CyType.mono(14, t.inkFaint),
              ),
            ),
          ),
          const SizedBox(height: 12),
          PillButton(
            t: t,
            label: _joining ? 'Conectando…' : 'Conectar',
            enabled: !_joining && _controller.text.trim().isNotEmpty,
            onTap: _join,
          ),
        ],
      ],
    );
  }
}
