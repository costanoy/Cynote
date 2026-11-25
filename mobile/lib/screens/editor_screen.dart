import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../icons.dart';
import '../models/note.dart';
import '../sync/cloud_sync.dart';
import '../theme.dart';

// The page's geometry, in logical pixels. The red margin rule runs at
// [_marginX]; the text starts [_textLeft] from the edge.
const _marginX = 24.0;
const _textLeft = 36.0;
const _textRight = 16.0;
const _topPad = 12.0;
const _bottomPad = 12.0;

class EditorScreen extends StatefulWidget {
  final Note note;
  final SyncStatus syncStatus;
  final VoidCallback onBack;
  final void Function(String title) onTitleChanged;
  final void Function(String body) onBodyChanged;

  /// The sync state in the status bar was tapped: save and sync now.
  final VoidCallback onSyncTap;

  /// Put the caret in the body on open (a new note).
  final bool autofocusBody;

  /// Where the caret goes when [autofocusBody] is set (end of the text by default).
  final int? initialCaret;

  const EditorScreen({
    super.key,
    required this.note,
    required this.syncStatus,
    required this.onBack,
    required this.onTitleChanged,
    required this.onBodyChanged,
    required this.onSyncTap,
    this.autofocusBody = false,
    this.initialCaret,
  });

  @override
  State<EditorScreen> createState() => _EditorScreenState();
}

/// What the formatting sheet can drop into the note.
enum _Format {
  bullets('Lista com marcadores', '• '),
  numbered('Lista numerada', '1. '),
  checkbox('Caixa de seleção', '[ ] '),
  dateTime('Inserir data e hora', null);

  final String label;

  /// Text put at the start of the current line; null means "insert the
  /// current date and time at the cursor".
  final String? linePrefix;
  const _Format(this.label, this.linePrefix);

  Widget get icon => switch (this) {
    _Format.bullets => const BulletListIcon(),
    _Format.numbered => const NumberedListIcon(),
    _Format.checkbox => const CheckBoxIcon(),
    _Format.dateTime => const DateTimeIcon(),
  };
}

class _EditorScreenState extends State<EditorScreen> {
  late final TextEditingController _titleController = TextEditingController(text: widget.note.title);
  late final TextEditingController _bodyController = TextEditingController(text: widget.note.body);
  final _titleFocus = FocusNode();
  final _bodyFocus = FocusNode();
  // Shared across both fields: Flutter tracks which one is focused and
  // undoes/redoes into that field only, so one pair of buttons works for
  // title and body.
  final UndoHistoryController _undoController = UndoHistoryController();

  double _pitch = CyNoteType.pitch;

  @override
  void initState() {
    super.initState();
    if (widget.autofocusBody) {
      final at = (widget.initialCaret ?? widget.note.body.length).clamp(0, widget.note.body.length);
      _bodyController.selection = TextSelection.collapsed(offset: at);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _bodyFocus.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    _titleFocus.dispose();
    _bodyFocus.dispose();
    _undoController.dispose();
    super.dispose();
  }

  // Typing keeps the note and the fields equal, so a mismatch means sync
  // replaced this note with a newer version: show it, instead of letting the
  // next keystroke write the old text straight back over it.
  @override
  void didUpdateWidget(covariant EditorScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    _showExternalChange(_titleController, widget.note.title);
    _showExternalChange(_bodyController, widget.note.body);
  }

  void _showExternalChange(TextEditingController controller, String value) {
    if (controller.text == value) return;
    final caret = controller.selection.baseOffset.clamp(0, value.length);
    controller.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(offset: caret),
    );
  }

  /// The height of one row of note text at the current text size: the strut
  /// fixes it, this reads it back.
  double _measurePitch(TextScaler scaler) {
    final painter = TextPainter(
      text: TextSpan(text: 'Ág', style: CyNoteType.style(const Color(0xFF000000))),
      strutStyle: CyNoteType.strut,
      textDirection: TextDirection.ltr,
      textScaler: scaler,
    )..layout();
    final height = painter.preferredLineHeight;
    painter.dispose();
    return height;
  }

  // ------------------------------------------------------------ formatting

  Future<void> _openSheet() async {
    final picked = await showModalBottomSheet<_Format>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final format in _Format.values)
                ListTile(
                  leading: format.icon,
                  title: Text(format.label),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 24),
                  onTap: () => Navigator.of(ctx).pop(format),
                ),
            ],
          ),
        ),
      ),
    );
    if (!mounted) return;
    if (picked != null) _applyFormat(picked);
  }

  void _applyFormat(_Format format) {
    final text = _bodyController.text;
    final selection = _bodyController.selection;
    final caret = selection.isValid ? selection.baseOffset.clamp(0, text.length) : text.length;
    final String insert;
    final int at;
    if (format.linePrefix != null) {
      insert = format.linePrefix!;
      at = caret == 0 ? 0 : text.lastIndexOf('\n', caret - 1) + 1;
    } else {
      final now = DateTime.now();
      String two(int n) => n.toString().padLeft(2, '0');
      insert = '${two(now.day)}/${two(now.month)}/${now.year}, ${two(now.hour)}:${two(now.minute)}';
      at = caret;
    }
    final next = text.substring(0, at) + insert + text.substring(at);
    _bodyController.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: caret + insert.length),
    );
    widget.onBodyChanged(next);
    _bodyFocus.requestFocus();
  }

  // ----------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final text = Theme.of(context).textTheme;
    _pitch = _measurePitch(MediaQuery.textScalerOf(context));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(tooltip: 'Voltar', onPressed: widget.onBack, icon: const BackChevronIcon()),
        titleSpacing: 0,
        title: TextField(
          controller: _titleController,
          focusNode: _titleFocus,
          undoController: _undoController,
          onChanged: widget.onTitleChanged,
          maxLines: 1,
          textCapitalization: TextCapitalization.sentences,
          textInputAction: TextInputAction.next,
          onEditingComplete: () => _bodyFocus.requestFocus(),
          style: text.titleLarge,
          decoration: InputDecoration.collapsed(
            hintText: 'Sem título',
            hintStyle: text.titleLarge!.copyWith(color: c.inkSoft),
          ),
        ),
        actions: [
          ValueListenableBuilder(
            valueListenable: _undoController,
            builder: (context, value, _) => IconButton(
              tooltip: 'Desfazer',
              onPressed: value.canUndo ? _undoController.undo : null,
              icon: const UndoIcon(),
            ),
          ),
          ValueListenableBuilder(
            valueListenable: _undoController,
            builder: (context, value, _) => IconButton(
              tooltip: 'Refazer',
              onPressed: value.canRedo ? _undoController.redo : null,
              icon: const RedoIcon(),
            ),
          ),
          IconButton(tooltip: 'Formatação', onPressed: _openSheet, icon: const FormatIcon()),
          const SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _page(c)),
          _StatusBar(status: widget.syncStatus, controller: _bodyController, onSyncTap: widget.onSyncTap),
        ],
      ),
    );
  }

  /// The ruled page: the body field over its rules, scrolling together.
  Widget _page(CyColors c) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final viewport = constraints.maxHeight;
        // Enough rows to fill the page, so a tap anywhere lands in the text
        // and the rules run to the bottom edge.
        final rows = math.max(1, ((viewport - _topPad - _bottomPad) / _pitch).floor());
        return SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: viewport),
            child: CustomPaint(
              painter: _RulesPainter(
                pitch: _pitch,
                rule: c.rule,
                margin: c.margin,
                devicePixelRatio: MediaQuery.devicePixelRatioOf(context),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(_textLeft, _topPad, _textRight, _bottomPad),
                child: TextField(
                  controller: _bodyController,
                  focusNode: _bodyFocus,
                  undoController: _undoController,
                  onChanged: widget.onBodyChanged,
                  keyboardType: TextInputType.multiline,
                  textCapitalization: TextCapitalization.sentences,
                  maxLines: null,
                  minLines: rows,
                  style: CyNoteType.style(c.ink),
                  strutStyle: CyNoteType.strut,
                  cursorColor: c.accent,
                  decoration: InputDecoration.collapsed(
                    hintText: 'Escreva aqui',
                    hintStyle: CyNoteType.style(c.inkFaint),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// The steno page: a rule at the foot of every row of text, all the way down,
/// and the red margin rule on the left.
class _RulesPainter extends CustomPainter {
  final double pitch;
  final Color rule;
  final Color margin;
  final double devicePixelRatio;

  _RulesPainter({
    required this.pitch,
    required this.rule,
    required this.margin,
    required this.devicePixelRatio,
  });

  /// [v] on a whole device pixel, so a 1 dp rule stays crisp.
  double _snap(double v) => (v * devicePixelRatio).round() / devicePixelRatio;

  @override
  void paint(Canvas canvas, Size size) {
    final ruleHeight = _snap(1).clamp(1 / devicePixelRatio, 2.0);
    final rulePaint = Paint()..color = rule;
    // Row i spans [top + i*pitch, top + (i+1)*pitch); its rule is the last
    // pixel of that span, exactly as on the desktop.
    for (var i = 0; ; i++) {
      final y = _snap(_topPad + (i + 1) * pitch - ruleHeight);
      if (y + ruleHeight > size.height) break;
      canvas.drawRect(Rect.fromLTWH(0, y, size.width, ruleHeight), rulePaint);
    }
    final x = _snap(_marginX);
    canvas.drawRect(Rect.fromLTWH(x, 0, ruleHeight, size.height), Paint()..color = margin);
  }

  @override
  bool shouldRepaint(_RulesPainter old) =>
      old.pitch != pitch ||
      old.rule != rule ||
      old.margin != margin ||
      old.devicePixelRatio != devicePixelRatio;
}

/// Thousands with a dot, as in pt-BR.
String _thousands(int n) {
  final digits = n.toString();
  final out = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write('.');
    out.write(digits[i]);
  }
  return out.toString();
}

String characterCountLabel(String text) {
  final n = text.characters.length;
  return n == 1 ? '1 caractere' : '${_thousands(n)} caracteres';
}

/// Short names for the sync state, the same as the desktop status bar.
String syncStateLabel(SyncPhase phase) => switch (phase) {
  SyncPhase.off => 'Sincronização desligada',
  SyncPhase.syncing => 'Sincronizando…',
  SyncPhase.synced => 'Sincronizado',
  SyncPhase.offline => 'Sem conexão',
  SyncPhase.denied => 'Acesso recusado',
  SyncPhase.error => 'Erro ao sincronizar',
};

String _syncHint(SyncPhase phase) => switch (phase) {
  SyncPhase.off => 'Toque para ligar a sincronização',
  SyncPhase.syncing => 'Sincronizando as notas',
  SyncPhase.synced => 'Toque para sincronizar agora',
  SyncPhase.offline => 'Tento de novo sozinho. Toque para tentar agora',
  SyncPhase.denied => 'Toque para tentar de novo',
  SyncPhase.error => 'Toque para tentar de novo',
};

/// The pad's cover at the foot of the page: sync state on the left (tap to
/// sync now), the character count on the right.
class _StatusBar extends StatelessWidget {
  final SyncStatus status;
  final TextEditingController controller;
  final VoidCallback onSyncTap;
  const _StatusBar({required this.status, required this.controller, required this.onSyncTap});

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final label = Theme.of(context).textTheme.labelMedium!.copyWith(color: c.coverInk);
    final phase = status.phase;
    final warn = phase == SyncPhase.offline || phase == SyncPhase.denied || phase == SyncPhase.error;
    final iconColor = warn ? c.coverAlert : c.coverInk;
    final icon = switch (phase) {
      SyncPhase.off || SyncPhase.offline => SyncOffIcon(size: 18, color: iconColor),
      SyncPhase.syncing => SyncingIcon(size: 18, color: iconColor),
      SyncPhase.synced => SyncedIcon(size: 18, color: iconColor),
      SyncPhase.denied || SyncPhase.error => SyncProblemIcon(size: 18, color: iconColor),
    };

    return AnnotatedRegion<SystemUiOverlayStyle>(
      // The navigation bar sits on the cover, dark in both themes.
      value: const SystemUiOverlayStyle(
        systemNavigationBarColor: Color(0x00000000),
        systemNavigationBarIconBrightness: Brightness.light,
        systemNavigationBarContrastEnforced: false,
      ),
      child: Material(
        color: c.cover,
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 48,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Flexible(
                        child: Tooltip(
                          message: _syncHint(phase),
                          child: InkWell(
                            onTap: onSyncTap,
                            splashColor: c.coverInk.withValues(alpha: 0.12),
                            highlightColor: c.coverInk.withValues(alpha: 0.08),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  icon,
                                  const SizedBox(width: 8),
                                  Flexible(
                                    child: Text(
                                      syncStateLabel(phase),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: label,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 8, right: 16),
                  child: Center(
                    child: ValueListenableBuilder(
                      valueListenable: controller,
                      builder: (context, value, _) => Text(characterCountLabel(value.text), style: tabular(label)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
