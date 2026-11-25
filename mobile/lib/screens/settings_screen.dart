import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../icons.dart';
import '../sync/cloud_sync.dart';
import '../theme.dart';

class SettingsScreen extends StatelessWidget {
  final bool darkMode;

  /// True while the theme still follows the system (nothing picked here yet).
  final bool followsSystem;
  final VoidCallback onBack;
  final ValueChanged<bool> onDarkModeChanged;
  final String? syncCode;
  final SyncStatus syncStatus;
  final Future<String> Function() onCreateSyncCode;
  final Future<bool> Function(String code) onJoinSyncCode;
  final Future<void> Function() onLeaveSync;

  /// "0.1.31", or null while unknown.
  final String? version;

  const SettingsScreen({
    super.key,
    required this.darkMode,
    this.followsSystem = false,
    required this.onBack,
    required this.onDarkModeChanged,
    required this.syncCode,
    required this.syncStatus,
    required this.onCreateSyncCode,
    required this.onJoinSyncCode,
    required this.onLeaveSync,
    this.version,
  });

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(tooltip: 'Voltar', onPressed: onBack, icon: const BackChevronIcon()),
        title: const Text('Configurações'),
      ),
      body: ListView(
        padding: EdgeInsets.only(top: 8, bottom: 24 + MediaQuery.paddingOf(context).bottom),
        children: [
          SwitchListTile(
            value: darkMode,
            onChanged: onDarkModeChanged,
            title: const Text('Tema escuro'),
            subtitle: followsSystem ? const Text('Segue o tema do sistema') : null,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          ),
          const SizedBox(height: 8),
          const Divider(),
          const SizedBox(height: 16),
          _SyncSection(
            code: syncCode,
            status: syncStatus,
            onCreate: onCreateSyncCode,
            onJoin: onJoinSyncCode,
            onLeave: onLeaveSync,
          ),
          if (version != null) ...[
            const SizedBox(height: 32),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text('Versão $version', style: tabular(text.bodyMedium!.copyWith(color: c.inkSoft))),
            ),
          ],
        ],
      ),
    );
  }
}

String _two(int n) => n.toString().padLeft(2, '0');

/// The status line under the code, the same texts as the desktop.
String syncStatusText(SyncStatus s) {
  switch (s.phase) {
    case SyncPhase.off:
      return '';
    case SyncPhase.syncing:
      return 'Sincronizando…';
    case SyncPhase.synced:
      final at = s.lastSync;
      return at == null ? 'Sincronizado' : 'Sincronizado às ${_two(at.hour)}:${_two(at.minute)}';
    case SyncPhase.offline:
      return 'Sem conexão. Tento de novo sozinho.';
    case SyncPhase.denied:
      return 'O servidor recusou o acesso. As regras do banco precisam ser publicadas (veja SYNC.md).';
    case SyncPhase.error:
      return 'Não deu para sincronizar: ${s.message ?? 'erro inesperado'}';
  }
}

const _invalidCodeText = 'Esse código não parece certo. Ele tem 20 letras e números, como 4F2A9-C81D0-77B3E-0A1C5.';

class _SyncSection extends StatefulWidget {
  final String? code;
  final SyncStatus status;
  final Future<String> Function() onCreate;
  final Future<bool> Function(String code) onJoin;
  final Future<void> Function() onLeave;

  const _SyncSection({
    required this.code,
    required this.status,
    required this.onCreate,
    required this.onJoin,
    required this.onLeave,
  });

  @override
  State<_SyncSection> createState() => _SyncSectionState();
}

class _SyncSectionState extends State<_SyncSection> {
  final _controller = TextEditingController();
  bool _busy = false;
  bool _copied = false;
  bool _invalidCode = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    setState(() => _busy = true);
    await widget.onCreate();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _copy() async {
    final code = widget.code;
    if (code == null) return;
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    setState(() => _copied = true);
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  Future<void> _join() async {
    final code = _controller.text.trim();
    if (code.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _invalidCode = false;
    });
    final ok = await widget.onJoin(code);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _invalidCode = !ok;
    });
    if (ok) _controller.clear();
  }

  Future<void> _leave() async {
    setState(() => _busy = true);
    await widget.onLeave();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final text = Theme.of(context).textTheme;
    final code = widget.code;
    final soft = text.bodyMedium!.copyWith(color: c.inkSoft);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Sincronizar com o computador', style: text.titleMedium),
          const SizedBox(height: 4),
          Text('As notas ficam iguais no celular e no computador. Use o mesmo código nos dois.', style: soft),
          const SizedBox(height: 16),
          if (code != null) ...[
            Container(
              padding: const EdgeInsets.only(left: 16),
              decoration: BoxDecoration(color: c.page2, borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  Expanded(
                    child: SelectableText(
                      code,
                      maxLines: 1,
                      style: tabular(text.bodyLarge!.copyWith(letterSpacing: 0.6)),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(4),
                    child: TextButton.icon(
                      onPressed: _copy,
                      icon: _copied ? const CheckIcon(size: 18) : const CopyIcon(size: 18),
                      label: Text(_copied ? 'Copiado' : 'Copiar'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _StatusLine(status: widget.status),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _busy ? null : _leave,
              // Flush with the text above; the button keeps its 48 dp height.
              style: TextButton.styleFrom(
                foregroundColor: c.marginInk,
                padding: EdgeInsets.zero,
                minimumSize: const Size(48, 48),
              ),
              child: const Text('Desconectar este celular'),
            ),
          ] else ...[
            FilledButton(onPressed: _busy ? null : _create, child: const Text('Criar código')),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    onChanged: (_) => setState(() => _invalidCode = false),
                    onSubmitted: (_) => _join(),
                    textInputAction: TextInputAction.go,
                    textCapitalization: TextCapitalization.characters,
                    autocorrect: false,
                    enableSuggestions: false,
                    style: tabular(text.bodyLarge!),
                    decoration: InputDecoration(
                      hintText: 'Colar código',
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      errorText: _invalidCode ? _invalidCodeText : null,
                      errorMaxLines: 3,
                      // The caret's field is where you are: the ballpoint edge.
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: c.accent, width: 2)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _busy || _controller.text.trim().isEmpty ? null : _join,
                  style: OutlinedButton.styleFrom(minimumSize: const Size(64, 48)),
                  child: const Text('Conectar'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// How the sync is going, with a small mark in the state's color.
class _StatusLine extends StatelessWidget {
  final SyncStatus status;
  const _StatusLine({required this.status});

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final text = Theme.of(context).textTheme;
    final phase = status.phase;
    final problem = phase == SyncPhase.denied || phase == SyncPhase.error;
    final mark = switch (phase) {
      SyncPhase.synced => c.cover,
      SyncPhase.syncing || SyncPhase.off => c.inkFaint,
      SyncPhase.offline => c.amber,
      SyncPhase.denied || SyncPhase.error => c.margin,
    };
    final markColor = phase == SyncPhase.synced && Theme.of(context).brightness == Brightness.dark ? c.inkSoft : mark;
    return Semantics(
      liveRegion: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 6, right: 10),
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: markColor, shape: BoxShape.circle),
            ),
          ),
          Expanded(
            child: Text(
              syncStatusText(status),
              style: tabular(text.bodyMedium!.copyWith(color: problem ? c.marginInk : c.inkSoft)),
            ),
          ),
        ],
      ),
    );
  }
}
