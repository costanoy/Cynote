import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'models/note.dart';
import 'note_sort.dart';
import 'notes_store.dart' as notes_store;
import 'ui_prefs.dart';
import 'device_identity.dart';
import 'mobile_updater.dart';
import 'sync/cloud_sync.dart';
import 'sync/sync_state_store.dart';
import 'sync/tidy.dart';
import 'icons.dart';
import 'theme.dart';
import 'screens/home_screen.dart';
import 'screens/search_screen.dart';
import 'screens/editor_screen.dart';
import 'screens/settings_screen.dart';

const _autosaveDelay = Duration(milliseconds: 1500);
const _updateCheckDelay = Duration(seconds: 4);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // A steady cursor in every text field, like the desktop editor. Despite the
  // name this is a plain static flag that also holds in release builds.
  EditableText.debugDeterministicCursor = true;
  // Edge to edge: the app draws under the status and navigation bars and
  // keeps its content out of them with the window insets.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  registerFontLicense();
  runApp(const CynoteApp());
}

/// JetBrains Mono ships with the app under the SIL Open Font License.
void registerFontLicense() {
  LicenseRegistry.addLicense(() async* {
    final text = await rootBundle.loadString('assets/fonts/JetBrainsMono-OFL.txt');
    yield LicenseEntryWithLineBreaks(const ['JetBrains Mono'], text);
  });
}

enum CyScreen { home, search, editor, settings }

/// Starts the app on a given screen with given state. Only the web preview
/// (tool/preview_main.dart) uses it, to capture each screen; a real launch
/// never passes one.
class CynotePreview {
  final CyScreen screen;
  final String? noteId;

  /// Caret offset in the open note's body; the body gets focus when set.
  final int? caret;
  final String searchQuery;
  final bool? darkMode;
  final String? syncCode;
  final SyncStatus syncStatus;
  final String? version;

  const CynotePreview({
    this.screen = CyScreen.home,
    this.noteId,
    this.caret,
    this.searchQuery = '',
    this.darkMode,
    this.syncCode,
    this.syncStatus = SyncStatus.off,
    this.version,
  });
}

class CynoteApp extends StatefulWidget {
  /// Only ever populated by tests and the web preview: a real launch always
  /// starts empty and fills in from notes_store and sync.
  final List<Note> initialNotes;
  final CynotePreview? preview;
  const CynoteApp({super.key, this.initialNotes = const [], this.preview});

  @override
  State<CynoteApp> createState() => _CynoteAppState();
}

class _CynoteAppState extends State<CynoteApp> {
  /// Null while the theme follows the system.
  bool? _darkPref;

  @override
  void initState() {
    super.initState();
    final preview = widget.preview;
    if (preview != null) {
      _darkPref = preview.darkMode;
    } else {
      loadDarkMode().then((dark) {
        if (mounted && dark != null && _darkPref == null) setState(() => _darkPref = dark);
      });
    }
  }

  void _setDarkMode(bool dark) {
    setState(() => _darkPref = dark);
    if (widget.preview == null) saveDarkMode(dark);
  }

  @override
  Widget build(BuildContext context) {
    final still = WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    return MaterialApp(
      title: 'Cynote',
      debugShowCheckedModeBanner: false,
      theme: cynoteTheme(Brightness.light),
      darkTheme: cynoteTheme(Brightness.dark),
      themeMode: switch (_darkPref) {
        null => ThemeMode.system,
        true => ThemeMode.dark,
        false => ThemeMode.light,
      },
      themeAnimationStyle: still ? AnimationStyle.noAnimation : null,
      home: CynoteRoot(
        initialNotes: widget.initialNotes,
        preview: widget.preview,
        followsSystemTheme: _darkPref == null,
        onDarkModeChanged: _setDarkMode,
      ),
    );
  }
}

class CynoteRoot extends StatefulWidget {
  final List<Note> initialNotes;
  final CynotePreview? preview;
  final bool followsSystemTheme;
  final ValueChanged<bool> onDarkModeChanged;

  const CynoteRoot({
    super.key,
    this.initialNotes = const [],
    this.preview,
    this.followsSystemTheme = true,
    required this.onDarkModeChanged,
  });

  @override
  State<CynoteRoot> createState() => _CynoteRootState();
}

class _CynoteRootState extends State<CynoteRoot> with WidgetsBindingObserver {
  late CyScreen _screen = widget.preview?.screen ?? CyScreen.home;
  CyScreen _returnScreen = CyScreen.home;
  CyScreen _settingsReturn = CyScreen.home;
  late List<Note> _notes = widget.initialNotes;
  NoteSort _sort = NoteSort.recent;
  late String? _activeNoteId = widget.preview?.noteId;

  /// The note just created: it opens with the caret in its body.
  String? _newNoteId;
  Timer? _saveDebounce;
  DeviceIdentity? _identity;
  SyncController? _sync;
  final List<String> _droppedDuplicates = [];
  MobileUpdate? _availableUpdate;
  bool _downloadingUpdate = false;
  Timer? _updateCheckTimer;
  late String? _version = widget.preview?.version;

  bool get _isPreview => widget.preview != null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (_isPreview) return;

    // Checked once, a few seconds after launch: no need to race notes or
    // sync startup, and a silent miss (offline, already up to date) is fine.
    // A real Timer so dispose() can cancel it.
    _updateCheckTimer = Timer(_updateCheckDelay, () async {
      final update = await checkForMobileUpdate();
      if (!mounted || update == null) return;
      setState(() => _availableUpdate = update);
      _showUpdateDialog();
    });
    PackageInfo.fromPlatform().then((info) {
      if (mounted) setState(() => _version = info.version);
    }, onError: (Object _) {});
    loadNoteSort().then((sort) {
      if (mounted && sort != _sort) setState(() => _sort = sort);
    });
    final notesLoaded = notes_store.loadNotes().then((saved) {
      if (!mounted) return;
      if (saved != null && saved.isNotEmpty) {
        // Clears the piles of identical copies the first versions left
        // behind. They are announced as deleted below, like any deletion, so
        // the old per-device slots cannot bring them back.
        final deduped = dropDuplicateCopies(saved);
        final kept = {for (final n in deduped) n.id};
        _droppedDuplicates.addAll([
          for (final n in saved)
            if (!kept.contains(n.id)) n.id,
        ]);
        setState(() => _notes = deduped);
        if (deduped.length != saved.length) _scheduleSave();
      }
    });
    getDeviceIdentity().then((identity) async {
      if (!mounted) return;
      setState(() => _identity = identity);
      // Syncing before the saved notes are in would treat every note as
      // missing here, and the load landing afterwards would then overwrite
      // whatever the sync brought in.
      await notesLoaded;
      if (!mounted) return;
      final sync = SyncController(
        deviceId: identity.deviceId,
        store: SyncStateStore(),
        notesProvider: () => _notes,
        onApply: _onSyncApply,
      );
      sync.addListener(_onSyncChanged);
      _sync = sync;
      await sync.start();
      _droppedDuplicates.forEach(sync.noteDeleted);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _saveDebounce?.cancel();
    _updateCheckTimer?.cancel();
    _sync?.removeListener(_onSyncChanged);
    _sync?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => _sync?.onAppLifecycle(state);

  void _onSyncChanged() {
    if (!mounted) return;
    setState(() {});
  }

  /// Called by the sync controller, synchronously, with what the cloud changed.
  void _onSyncApply(List<Note> upserts, List<String> removedIds) {
    if (!mounted) return;
    final incoming = {for (final n in upserts) n.id: n};
    final removed = removedIds.toSet();
    setState(() {
      final next = <Note>[];
      for (final n in _notes) {
        if (removed.contains(n.id)) continue;
        next.add(incoming.remove(n.id) ?? n);
      }
      // What is left is new here.
      _notes = [...incoming.values, ...next];
      if (_activeNoteId != null && removed.contains(_activeNoteId)) {
        _activeNoteId = null;
        if (_screen == CyScreen.editor) _screen = CyScreen.home;
      }
    });
    _scheduleSave();
  }

  void _showUpdateDialog() {
    final update = _availableUpdate;
    if (update == null) return;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => PopScope(
          canPop: !_downloadingUpdate,
          child: AlertDialog(
            icon: const UpdateIcon(),
            title: const Text('Atualização disponível'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _downloadingUpdate
                      ? 'Baixando a versão ${update.version}… O instalador do Android vai abrir em instantes.'
                      : 'O Cynote ${update.version} está disponível. Atualizar agora?',
                ),
                if (_downloadingUpdate) ...[const SizedBox(height: 16), const LinearProgressIndicator()],
              ],
            ),
            actions: _downloadingUpdate
                ? null
                : [
                    TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Agora não')),
                    TextButton(
                      onPressed: () async {
                        setDialogState(() => _downloadingUpdate = true);
                        setState(() => _downloadingUpdate = true);
                        var failed = false;
                        try {
                          await downloadAndInstallMobileUpdate(update);
                        } catch (_) {
                          failed = true;
                        } finally {
                          if (mounted) setState(() => _downloadingUpdate = false);
                        }
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        if (failed && mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Não deu para baixar a atualização. Tente de novo mais tarde.'),
                            ),
                          );
                        }
                      },
                      child: const Text('Atualizar'),
                    ),
                  ],
          ),
        ),
      ),
    );
  }

  void _scheduleSave() {
    if (_isPreview) return;
    _saveDebounce?.cancel();
    _saveDebounce = Timer(_autosaveDelay, () async {
      await notes_store.saveNotes(_notes);
      if (!mounted) return;
      _sync?.notesSaved();
    });
  }

  Note? get _activeNote {
    if (_activeNoteId == null) return null;
    for (final n in _notes) {
      if (n.id == _activeNoteId) return n;
    }
    return null;
  }

  void _goHome() => setState(() => _screen = CyScreen.home);
  void _goSearch() => setState(() => _screen = CyScreen.search);

  void _goSettings({CyScreen from = CyScreen.home}) => setState(() {
    _settingsReturn = from;
    _screen = CyScreen.settings;
  });

  void _closeSettings() => setState(() {
    _screen = _settingsReturn == CyScreen.editor && _activeNote != null ? CyScreen.editor : CyScreen.home;
  });

  void _openNote(Note note, CyScreen from) {
    setState(() {
      _activeNoteId = note.id;
      _newNoteId = null;
      _returnScreen = from;
      _screen = CyScreen.editor;
    });
  }

  void _closeEditor() => setState(() {
    _newNoteId = null;
    _screen = _returnScreen;
  });

  void _addNote() {
    final note = Note(
      id: 'n${DateTime.now().millisecondsSinceEpoch}',
      title: 'Nova nota',
      time: 'Agora',
      body: '',
      originDeviceId: _identity?.deviceId ?? 'seed',
    );
    setState(() {
      _notes = [note, ..._notes];
      _activeNoteId = note.id;
      _newNoteId = note.id;
      _returnScreen = CyScreen.home;
      _screen = CyScreen.editor;
    });
    _scheduleSave();
  }

  void _confirmDeleteNote(Note note) {
    final name = note.title.trim().isEmpty ? 'Sem título' : note.title.trim();
    showDialog<void>(
      context: context,
      builder: (ctx) {
        final c = CyColors.of(ctx);
        return AlertDialog(
          title: const Text('Excluir nota'),
          content: Text('Excluir “$name”? Ela também some do computador se a sincronização estiver ligada.'),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancelar')),
            TextButton(
              style: TextButton.styleFrom(foregroundColor: c.marginInk),
              onPressed: () {
                Navigator.of(ctx).pop();
                _deleteNote(note);
              },
              child: const Text('Excluir'),
            ),
          ],
        );
      },
    );
  }

  void _deleteNote(Note note) {
    final index = _notes.indexWhere((n) => n.id == note.id);
    setState(() {
      _notes = _notes.where((n) => n.id != note.id).toList();
      if (_activeNoteId == note.id) {
        _activeNoteId = null;
        _screen = CyScreen.home;
      }
    });
    // Goes away everywhere, and sync must not bring it back.
    // Before the sync controller exists the id waits with the dropped copies.
    final sync = _sync;
    if (sync != null) {
      sync.noteDeleted(note.id);
    } else {
      _droppedDuplicates.add(note.id);
    }
    _scheduleSave();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: const Text('Nota excluída'),
          persist: false,
          duration: const Duration(seconds: 6),
          action: SnackBarAction(label: 'Desfazer', onPressed: () => _restoreNote(note, index)),
        ),
      );
  }

  /// Undo of a delete: the note goes back where it was.
  void _restoreNote(Note note, int index) {
    if (!mounted || _notes.any((n) => n.id == note.id)) return;
    setState(() {
      _notes = [..._notes]..insert(index.clamp(0, _notes.length), note);
    });
    final sync = _sync;
    if (sync != null) {
      sync.noteRestored(note.id);
    } else {
      _droppedDuplicates.remove(note.id);
    }
    _scheduleSave();
  }

  void _onTitleChanged(String value) {
    setState(() {
      _notes = _notes.map((n) => n.id == _activeNoteId ? n.copyWith(title: value) : n).toList();
    });
    _scheduleSave();
  }

  void _onBodyChanged(String value) {
    setState(() {
      _notes = _notes.map((n) => n.id == _activeNoteId ? n.copyWith(body: value) : n).toList();
    });
    _scheduleSave();
  }

  String? get _syncCode => widget.preview?.syncCode ?? _sync?.code;
  SyncStatus get _syncStatus => widget.preview?.syncStatus ?? _sync?.status ?? SyncStatus.off;

  /// The sync state in the editor was tapped: with sync off, open the
  /// settings where it is turned on; otherwise save now and sync.
  void _onSyncTap() {
    if (_isPreview) return;
    if (_syncCode == null) {
      _goSettings(from: CyScreen.editor);
    } else {
      _saveNow();
    }
  }

  Future<void> _saveNow() async {
    _saveDebounce?.cancel();
    await notes_store.saveNotes(_notes);
    if (!mounted) return;
    final sync = _sync;
    if (sync != null) unawaited(sync.syncNow());
  }

  void _setSort(NoteSort sort) {
    setState(() => _sort = sort);
    if (!_isPreview) saveNoteSort(sort);
  }

  Future<String> _createSyncCode() async => await _sync?.createCode() ?? '';

  Future<bool> _joinSyncCode(String code) async => await _sync?.joinCode(code) ?? false;

  Future<void> _leaveSync() async => _sync?.leave();

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    // Search lists its results in the same order as the home screen.
    final ordered = sortNotes(_notes, _sort);
    final active = _activeNote;
    final screen = _screen == CyScreen.editor && active == null ? CyScreen.home : _screen;

    final Widget content = switch (screen) {
      CyScreen.home => HomeScreen(
        notes: ordered,
        sort: _sort,
        onSortChanged: _setSort,
        onOpenNote: (n) => _openNote(n, CyScreen.home),
        onSearch: _goSearch,
        onSettings: _goSettings,
        onAddNote: _addNote,
        onLongPressNote: _confirmDeleteNote,
      ),
      CyScreen.search => SearchScreen(
        notes: ordered,
        initialQuery: widget.preview?.searchQuery ?? '',
        onOpenNote: (n) => _openNote(n, CyScreen.search),
        onBack: _goHome,
      ),
      CyScreen.editor => EditorScreen(
        key: ValueKey(active!.id),
        note: active,
        syncStatus: _syncStatus,
        onBack: _closeEditor,
        onTitleChanged: _onTitleChanged,
        onBodyChanged: _onBodyChanged,
        onSyncTap: _onSyncTap,
        autofocusBody: _newNoteId == active.id || widget.preview?.caret != null,
        initialCaret: widget.preview?.caret,
      ),
      CyScreen.settings => SettingsScreen(
        darkMode: dark,
        followsSystem: widget.followsSystemTheme,
        onBack: _closeSettings,
        onDarkModeChanged: widget.onDarkModeChanged,
        syncCode: _syncCode,
        syncStatus: _syncStatus,
        onCreateSyncCode: _createSyncCode,
        onJoinSyncCode: _joinSyncCode,
        onLeaveSync: _leaveSync,
        version: _version,
      ),
    };

    // The system back gesture or button goes back a screen; only home leaves
    // the app (this screen stack has no Navigator routes of its own).
    final canSystemPop = screen == CyScreen.home;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: const Color(0x00000000),
        statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
        statusBarBrightness: dark ? Brightness.dark : Brightness.light,
        systemNavigationBarColor: const Color(0x00000000),
        systemNavigationBarIconBrightness: dark ? Brightness.light : Brightness.dark,
        systemNavigationBarContrastEnforced: false,
      ),
      child: PopScope(
        canPop: canSystemPop,
        onPopInvokedWithResult: (didPop, result) {
          if (didPop) return;
          switch (screen) {
            case CyScreen.editor:
              _closeEditor();
            case CyScreen.settings:
              _closeSettings();
            case CyScreen.search:
            case CyScreen.home:
              _goHome();
          }
        },
        // On a tablet or a wide window the screens keep a phone-like measure,
        // centred on the page.
        child: ColoredBox(
          color: c.page,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: AnimatedSwitcher(
                duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : Durations.short4,
                child: KeyedSubtree(
                  key: ValueKey(screen == CyScreen.editor ? 'editor:${active!.id}' : screen.name),
                  child: content,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
