import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../icons.dart';
import '../theme.dart';
import '../widgets/switch_toggle.dart';

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
    return Container(
      color: t.bg,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(18, 40, 18, 20),
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: t.border))),
            child: Row(
              children: [
                GestureDetector(
                  onTap: onBack,
                  child: SizedBox(
                    width: 30 * kScale,
                    height: 30 * kScale,
                    child: Center(child: BackChevronIcon(size: 17 * kScale, color: t.mutedText)),
                  ),
                ),
                const SizedBox(width: 6 * kScale),
                Text(
                  'Configurações',
                  style: GoogleFonts.bricolageGrotesque(
                    fontWeight: FontWeight.w700,
                    fontSize: 15.5 * kScale,
                    color: t.text,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    decoration: BoxDecoration(border: Border(bottom: BorderSide(color: t.border))),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Tema escuro',
                                style: GoogleFonts.manrope(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13.5 * kScale,
                                  color: t.text,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                'Ativa a interface escura do bloquinho',
                                style: GoogleFonts.manrope(fontSize: 11.5 * kScale, color: t.mutedText),
                              ),
                            ],
                          ),
                        ),
                        SwitchToggle(on: darkMode, onTap: onToggleDarkMode, t: t),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 20),
                    child: _CloudSyncSection(
                      t: t,
                      syncId: cloudSyncId,
                      onGenerate: onGenerateCloudCode,
                      onJoin: onJoinCloudCode,
                      onClear: onClearCloudCode,
                    ),
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
  bool _generating = false;
  bool _joining = false;
  bool _copied = false;

  @override
  void dispose() {
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Sincronização pela internet',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w600, fontSize: 13.5 * kScale, color: t.text),
        ),
        const SizedBox(height: 3),
        Text(
          'Sincronize com outro dispositivo em qualquer rede, usando um código de pareamento',
          style: GoogleFonts.manrope(fontSize: 11.5 * kScale, height: 1.4, color: t.mutedText),
        ),
        const SizedBox(height: 14),
        if (id != null) ...[
          Container(
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
                    id,
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5 * kScale,
                      letterSpacing: 0.4,
                      color: t.text,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: _copy,
                  child: Text(
                    _copied ? 'Copiado!' : 'Copiar',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 12.5 * kScale, color: t.accentDark),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Digite esse código no outro dispositivo para conectá-lo',
            style: GoogleFonts.manrope(fontSize: 11 * kScale, color: t.mutedText),
          ),
          const SizedBox(height: 10),
          GestureDetector(
            onTap: widget.onClear,
            child: Text(
              'Desativar sincronização pela internet',
              style: GoogleFonts.manrope(
                fontSize: 11.5 * kScale,
                fontWeight: FontWeight.w600,
                color: t.mutedText,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ] else ...[
          GestureDetector(
            onTap: _generating ? null : _generate,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(color: t.accentTint, borderRadius: BorderRadius.circular(8)),
              child: Text(
                _generating ? 'Gerando…' : 'Gerar código',
                style: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 12.5 * kScale, color: t.accentDark),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Ou cole um código gerado em outro dispositivo:',
            style: GoogleFonts.manrope(fontSize: 11.5 * kScale, color: t.mutedText),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    border: Border.all(color: t.cardBorder),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: TextField(
                    controller: _controller,
                    style: TextStyle(fontFamily: 'monospace', fontSize: 12 * kScale, color: t.text),
                    decoration: InputDecoration(
                      border: InputBorder.none,
                      hintText: 'Código de pareamento',
                      hintStyle: GoogleFonts.manrope(fontSize: 12 * kScale, color: t.subtleText),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: _joining ? null : _join,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(color: t.accentTint, borderRadius: BorderRadius.circular(8)),
                  child: Text(
                    _joining ? 'Conectando…' : 'Conectar',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 12 * kScale, color: t.accentDark),
                  ),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
