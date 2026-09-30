import 'package:flutter/material.dart';
import '../icons.dart';
import '../models/note.dart';
import '../theme.dart';
import '../widgets/greenhouse.dart';

export '../widgets/greenhouse.dart' show SyncState;

class EditorScreen extends StatefulWidget {
  final CyColors t;
  final Note note;
  final SyncState syncStatus;
  final VoidCallback onBack;
  final void Function(String title) onTitleChanged;
  final void Function(String body) onBodyChanged;

  /// Tapping the sync pill: save (and so sync) right away.
  final VoidCallback onRetrySync;

  const EditorScreen({
    super.key,
    required this.t,
    required this.note,
    required this.syncStatus,
    required this.onBack,
    required this.onTitleChanged,
    required this.onBodyChanged,
    required this.onRetrySync,
  });

  @override
  State<EditorScreen> createState() => _EditorScreenState();
}

/// What the formatting sheet can drop into the note.
enum _Format {
  bullets('—', 'Lista com marcadores', '— '),
  numbered('1.', 'Lista numerada', '1. '),
  checkbox('[ ]', 'Caixa de seleção', '[ ] '),
  dateTime('12:00', 'Inserir data e hora', null);

  final String glyph;
  final String label;

  /// Text put at the start of the current line; null means "insert the
  /// current date and time at the cursor".
  final String? linePrefix;
  const _Format(this.glyph, this.label, this.linePrefix);
}

class _EditorScreenState extends State<EditorScreen> {
  late final TextEditingController _titleController = TextEditingController(text: widget.note.title);
  late final TextEditingController _bodyController = TextEditingController(text: widget.note.body);
  final _titleFocus = FocusNode();
  final _bodyFocus = FocusNode();
  // Shared across both fields: Flutter tracks which one is focused and
  // undoes/redoes into that field only, so one pair of buttons works for
  // title and body without us having to track focus ourselves.
  final UndoHistoryController _undoController = UndoHistoryController();
  bool _sheetOpen = false;

  @override
  void initState() {
    super.initState();
    _titleFocus.addListener(() => setState(() {}));
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
  // replaced this note with a newer version - show it, instead of letting the
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

  Future<void> _openSheet() async {
    setState(() => _sheetOpen = true);
    final t = widget.t;
    final picked = await showModalBottomSheet<_Format>(
      context: context,
      backgroundColor: const Color(0x00000000),
      barrierColor: t.scrim,
      sheetAnimationStyle: const AnimationStyle(duration: Duration(milliseconds: 320), curve: CyMotion.grow),
      builder: (ctx) => _FormatSheet(t: t),
    );
    if (!mounted) return;
    setState(() => _sheetOpen = false);
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

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final sync = widget.syncStatus;
    return GreenhouseScreen(
      t: t,
      header: [
        Medallion(
          t: t,
          onTap: widget.onBack,
          child: BackChevronIcon(color: t.frameInk),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Container(
            height: 40,
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: _titleFocus.hasFocus ? t.gold : const Color(0x00000000))),
            ),
            child: TextField(
              controller: _titleController,
              focusNode: _titleFocus,
              undoController: _undoController,
              onChanged: widget.onTitleChanged,
              cursorColor: t.gold,
              style: CyType.display(19, t.frameInk, letterSpacing: 0.38),
              decoration: InputDecoration(
                isDense: true,
                border: InputBorder.none,
                hintText: 'Sem título',
                hintStyle: CyType.display(19, t.frameInkSoft, letterSpacing: 0.38),
              ),
            ),
          ),
        ),
        ValueListenableBuilder(
          valueListenable: _undoController,
          builder: (context, value, _) => Medallion(
            t: t,
            bordered: false,
            enabled: value.canUndo,
            onTap: _undoController.undo,
            child: UndoIcon(color: t.frameInk),
          ),
        ),
        ValueListenableBuilder(
          valueListenable: _undoController,
          builder: (context, value, _) => Medallion(
            t: t,
            bordered: false,
            enabled: value.canRedo,
            onTap: _undoController.redo,
            child: RedoIcon(color: t.frameInk),
          ),
        ),
        Medallion(
          t: t,
          active: _sheetOpen,
          onTap: _openSheet,
          child: Text('Aa', style: CyType.display(17, _sheetOpen ? t.frame2 : t.frameInk, height: 1)),
        ),
      ],
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 500),
        color: t.paper,
        child: Column(
          children: [
            Expanded(
              child: Stack(
                children: [
                  // The fine rule framing the page.
                  Positioned(
                    left: 10,
                    right: 10,
                    top: 8,
                    bottom: 8,
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          border: Border.all(color: t.rule),
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ),
                  ),
                  Positioned.fill(
                    child: TextField(
                      controller: _bodyController,
                      focusNode: _bodyFocus,
                      undoController: _undoController,
                      onChanged: widget.onBodyChanged,
                      maxLines: null,
                      expands: true,
                      textAlignVertical: TextAlignVertical.top,
                      cursorColor: t.accent,
                      style: CyType.body(16.5, t.ink, height: 1.7),
                      decoration: InputDecoration(
                        isDense: true,
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.fromLTRB(26, ArchHeader.overhang + 4, 26, 24),
                        hintText: 'Plante a primeira linha…',
                        hintStyle: CyType.body(16.5, t.inkFaint, height: 1.7),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            AnimatedContainer(
              duration: const Duration(milliseconds: 500),
              color: t.frame,
              padding: EdgeInsets.fromLTRB(20, 6, 20, 18 + MediaQuery.paddingOf(context).bottom),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Flexible(
                    child: Tooltip(
                      message: sync == SyncState.error ? 'Tocar para tentar de novo' : 'Sincronização',
                      child: Pressable(
                        onTap: widget.onRetrySync,
                        builder: (context, pressed) => Container(
                          height: kTouchTarget,
                          padding: const EdgeInsets.fromLTRB(8, 0, 12, 0),
                          decoration: BoxDecoration(
                            color: pressed ? t.goldSoft : null,
                            border: Border.all(color: t.goldLine),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SyncFlower(t: t, status: sync),
                              const SizedBox(width: 7),
                              Flexible(
                                child: Text(
                                  syncLabel(sync),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: CyType.ui(13, sync == SyncState.error ? t.alert : t.frameInkSoft),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  ValueListenableBuilder(
                    valueListenable: _bodyController,
                    builder: (context, value, _) => Text(
                      '${value.text.length} caracteres',
                      style: CyType.ui(
                        12.5,
                        t.frameInkSoft,
                      ).copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The formatting sheet: rises from the bottom, with a handle and a vine.
class _FormatSheet extends StatelessWidget {
  final CyColors t;
  const _FormatSheet({required this.t});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(14, 10, 14, 30 + MediaQuery.paddingOf(context).bottom),
      decoration: BoxDecoration(
        color: t.paper,
        border: Border(top: BorderSide(color: t.goldLine)),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
        boxShadow: [BoxShadow(color: t.shadow, blurRadius: 30, offset: const Offset(0, -10))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(color: t.rule, borderRadius: BorderRadius.circular(4)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
            child: Row(
              children: [
                Text('Formatação', style: CyType.display(17, t.ink, letterSpacing: 0.5)),
                const SizedBox(width: 10),
                Expanded(
                  child: VineUnderline(t: t, width: double.infinity),
                ),
              ],
            ),
          ),
          for (var i = 0; i < _Format.values.length; i++)
            RiseIn(
              delay: Duration(milliseconds: 60 + i * 40),
              child: _FormatItem(
                t: t,
                format: _Format.values[i],
                onTap: () => Navigator.of(context).pop(_Format.values[i]),
              ),
            ),
        ],
      ),
    );
  }
}

class _FormatItem extends StatelessWidget {
  final CyColors t;
  final _Format format;
  final VoidCallback onTap;
  const _FormatItem({required this.t, required this.format, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: onTap,
      pressedScale: 0.98,
      builder: (context, pressed) => Container(
        height: 50,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(color: pressed ? t.goldSoft : null, borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            SizedBox(width: 48, child: Text(format.glyph, style: CyType.mono(13, t.accent))),
            Expanded(child: Text(format.label, style: CyType.ui(15, t.ink))),
          ],
        ),
      ),
    );
  }
}
