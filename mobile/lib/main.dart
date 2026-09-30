import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'models/note.dart';
import 'notes_store.dart' as notes_store;
import 'device_identity.dart';
import 'mobile_updater.dart';
import 'sync/sync_service.dart';
import 'sync/cloud_sync_service.dart';
import 'sync/bookkeeping_store.dart';
import 'sync/merge.dart' show dropDuplicateCopies;
import 'sync/peer_info.dart';
import 'icons.dart';
import 'theme.dart';
import 'widgets/greenhouse.dart';
import 'screens/sync_screen.dart';
import 'screens/home_screen.dart';
import 'screens/search_screen.dart';
import 'screens/editor_screen.dart';
import 'screens/settings_screen.dart';

const _autosaveDelay = Duration(milliseconds: 1500);
const _updateCheckDelay = Duration(seconds: 4);

void main() {
  runApp(const CynoteApp());
}

class CynoteApp extends StatelessWidget {
  /// Only ever populated by tests - a real launch always starts empty and
  /// fills in from notes_store/sync, so nobody ever sees leftover demo notes.
  final List<Note> initialNotes;
  const CynoteApp({super.key, this.initialNotes = const []});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cynote',
      debugShowCheckedModeBanner: false,
      home: CynoteRoot(initialNotes: initialNotes),
    );
  }
}

enum CyScreen { sync, home, search, editor, settings }

class CynoteRoot extends StatefulWidget {
  final List<Note> initialNotes;
  const CynoteRoot({super.key, this.initialNotes = const []});

  @override
  State<CynoteRoot> createState() => _CynoteRootState();
}

class _CynoteRootState extends State<CynoteRoot> {
  CyScreen _screen = CyScreen.sync;
  CyScreen _returnScreen = CyScreen.home;
  bool _darkMode = true;
  late List<Note> _notes = widget.initialNotes;
  SyncState _syncStatus = SyncState.synced;
  String? _activeNoteId;
  Timer? _saveDebounce;
  DeviceIdentity? _identity;
  SyncService? _syncService;
  CloudSyncService? _cloudSyncService;
  String? _connectingToDeviceId;
  bool _pairingDialogShowing = false;
  MobileUpdate? _availableUpdate;
  bool _downloadingUpdate = false;
  Timer? _updateCheckTimer;

  @override
  void initState() {
    super.initState();
    // Checked once, a few seconds after launch - no need to race notes/sync
    // startup, and a silent miss (offline, already up to date) is fine since
    // this only ever surfaces something when there's actually a new build.
    // A real Timer (not a bare Future.delayed) so dispose() can cancel it -
    // otherwise it outlives a widget test's tear-down and fails the run.
    _updateCheckTimer = Timer(_updateCheckDelay, () async {
      final update = await checkForMobileUpdate();
      if (!mounted || update == null) return;
      setState(() => _availableUpdate = update);
      _showUpdateDialog();
    });
    final notesLoaded = notes_store.loadNotes().then((saved) {
      if (!mounted) return;
      if (saved != null && saved.isNotEmpty) {
        final deduped = dropDuplicateCopies(saved);
        setState(() => _notes = deduped);
        if (deduped.length != saved.length) _scheduleSave();
      }
    });
    getDeviceIdentity().then((identity) async {
      if (!mounted) return;
      setState(() => _identity = identity);
      final bookkeeping = BookkeepingStore();
      final service = SyncService(identity, bookkeeping);
      service.notesProvider = () => _notes;
      service.onNotesMerged = _onNotesMerged;
      service.addListener(_onSyncChanged);
      _syncService = service;

      final cloudService = CloudSyncService(identity, bookkeeping);
      cloudService.notesProvider = () => _notes;
      cloudService.onNotesMerged = _onNotesMerged;
      cloudService.addListener(_onCloudSyncChanged);
      _cloudSyncService = cloudService;

      // Merging before the saved notes are in would treat every note as
      // missing here, and the load landing afterwards would then overwrite
      // whatever the merge brought in.
      await notesLoaded;
      if (!mounted) return;
      service.start();
      cloudService.start();
    });
  }

  @override
  void dispose() {
    _saveDebounce?.cancel();
    _updateCheckTimer?.cancel();
    _syncService?.removeListener(_onSyncChanged);
    _syncService?.dispose();
    _cloudSyncService?.removeListener(_onCloudSyncChanged);
    _cloudSyncService?.dispose();
    super.dispose();
  }

  void _onSyncChanged() {
    if (!mounted) return;
    setState(() {});
    _maybeShowPairingDialog();
  }

  void _onCloudSyncChanged() {
    if (!mounted) return;
    setState(() {});
  }

  void _onNotesMerged(List<Note> notes) {
    if (!mounted) return;
    setState(() => _notes = notes);
    _scheduleSave();
  }

  void _maybeShowPairingDialog() {
    final service = _syncService;
    if (service == null || _pairingDialogShowing || service.incomingRequests.isEmpty) return;
    final peer = service.incomingRequests.values.first;
    _pairingDialogShowing = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      void respond(BuildContext ctx, bool accept) {
        service.respondToPairing(peer.deviceId, accept);
        Navigator.of(ctx).pop();
        _pairingDialogShowing = false;
        _maybeShowPairingDialog();
      }

      final t = _colors;
      showCyDialog(
        context,
        t,
        (ctx) => CyDialog(
          t: t,
          icon: ComputerIcon(size: 22, color: t.gold),
          title: 'Sincronizar dispositivo',
          body: 'Sincronizar com “${peer.deviceName}”?',
          actions: [
            CyDialogAction('Recusar', () => respond(ctx, false)),
            CyDialogAction('Aceitar', () => respond(ctx, true), primary: true),
          ],
        ),
      );
    });
  }

  void _showUpdateDialog() {
    final update = _availableUpdate;
    if (update == null) return;
    final t = _colors;
    showCyDialog(
      context,
      t,
      (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => CyDialog(
          t: t,
          icon: UpdateIcon(color: t.gold),
          title: 'Atualização disponível',
          body: _downloadingUpdate
              ? 'Baixando a versão ${update.version}… O instalador do Android vai abrir em instantes.'
              : 'O Cynote ${update.version} está disponível. Atualizar agora?',
          progress: _downloadingUpdate,
          actions: _downloadingUpdate
              ? const []
              : [
                  CyDialogAction('Agora não', () => Navigator.of(ctx).pop()),
                  CyDialogAction('Atualizar', () async {
                    setDialogState(() => _downloadingUpdate = true);
                    setState(() => _downloadingUpdate = true);
                    try {
                      await downloadAndInstallMobileUpdate(update);
                    } finally {
                      if (mounted) setState(() => _downloadingUpdate = false);
                    }
                    if (ctx.mounted) Navigator.of(ctx).pop();
                  }, primary: true),
                ],
        ),
      ),
    );
  }

  Future<void> _connectToDevice(PeerInfo peer) async {
    final service = _syncService;
    if (service == null) return;
    setState(() => _connectingToDeviceId = peer.deviceId);
    final accepted = await service.requestPairing(peer);
    if (!mounted) return;
    setState(() => _connectingToDeviceId = null);
    if (accepted) _goHome();
  }

  void _scheduleSave() {
    setState(() => _syncStatus = SyncState.syncing);
    _saveDebounce?.cancel();
    _saveDebounce = Timer(_autosaveDelay, () async {
      await notes_store.saveNotes(_notes);
      if (!mounted) return;
      setState(() => _syncStatus = SyncState.synced);
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
  void _goSettings() => setState(() => _screen = CyScreen.settings);

  void _openNote(Note note, CyScreen from) {
    setState(() {
      _activeNoteId = note.id;
      _returnScreen = from;
      _screen = CyScreen.editor;
    });
  }

  void _closeEditor() => setState(() => _screen = _returnScreen);

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
      _returnScreen = CyScreen.home;
      _screen = CyScreen.editor;
    });
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

  CyColors get _colors => _darkMode ? CyColors.dark : CyColors.light;

  // Tapping the sync pill: write to disk now instead of waiting out the
  // autosave delay.
  Future<void> _saveNow() async {
    _saveDebounce?.cancel();
    setState(() => _syncStatus = SyncState.syncing);
    await notes_store.saveNotes(_notes);
    if (!mounted) return;
    setState(() => _syncStatus = SyncState.synced);
  }

  void _toggleDarkMode() => setState(() => _darkMode = !_darkMode);

  Future<String> _generateCloudCode() async {
    final service = _cloudSyncService;
    if (service == null) return '';
    return service.generateSyncId();
  }

  Future<void> _joinCloudCode(String code) async {
    await _cloudSyncService?.setSyncId(code);
  }

  Future<void> _clearCloudCode() async {
    await _cloudSyncService?.clearSyncId();
  }

  @override
  Widget build(BuildContext context) {
    final t = _colors;

    Widget content;
    switch (_screen) {
      case CyScreen.sync:
        content = SyncScreen(
          t: t,
          discovered: _syncService?.connectableDevices ?? [],
          connectingToDeviceId: _connectingToDeviceId,
          onConnect: _connectToDevice,
          onContinueWithoutSync: _goHome,
        );
        break;
      case CyScreen.home:
        content = HomeScreen(
          t: t,
          notes: _notes,
          onOpenNote: (n) => _openNote(n, CyScreen.home),
          onSearch: _goSearch,
          onSettings: _goSettings,
          onAddNote: _addNote,
        );
        break;
      case CyScreen.search:
        content = SearchScreen(
          t: t,
          notes: _notes,
          onOpenNote: (n) => _openNote(n, CyScreen.search),
          onBack: _goHome,
        );
        break;
      case CyScreen.editor:
        content = EditorScreen(
          key: ValueKey(_activeNoteId),
          t: t,
          note: _activeNote!,
          syncStatus: _syncStatus,
          onBack: _closeEditor,
          onTitleChanged: _onTitleChanged,
          onBodyChanged: _onBodyChanged,
          onRetrySync: _saveNow,
        );
        break;
      case CyScreen.settings:
        content = SettingsScreen(
          t: t,
          darkMode: _darkMode,
          onBack: _goHome,
          onToggleDarkMode: _toggleDarkMode,
          cloudSyncId: _cloudSyncService?.syncId,
          onGenerateCloudCode: _generateCloudCode,
          onJoinCloudCode: _joinCloudCode,
          onClearCloudCode: _clearCloudCode,
        );
        break;
    }

    // Whether the system back gesture/button should be handled by us
    // instead of the OS default (which would exit the app, since this
    // screen stack has no Navigator routes to pop) - only sync/home have
    // nowhere of ours left to go back to.
    final canSystemPop = _screen == CyScreen.home || _screen == CyScreen.sync;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      // The status bar sits on the iron header, dark green in both themes,
      // so its icons stay light - except on the sync screen, which is plain
      // paper all the way up.
      value: _screen == CyScreen.sync && !_darkMode ? SystemUiOverlayStyle.dark : SystemUiOverlayStyle.light,
      child: PopScope(
        canPop: canSystemPop,
        onPopInvokedWithResult: (didPop, result) {
          if (didPop) return;
          if (_screen == CyScreen.editor) {
            _closeEditor();
          } else {
            _goHome();
          }
        },
        child: Scaffold(
          backgroundColor: t.paper,
          body: LayoutBuilder(
            builder: (context, constraints) {
              final isPhoneSized = constraints.maxWidth <= 430;
              final screenCard = ClipRRect(
                borderRadius: BorderRadius.circular(isPhoneSized ? 0 : 20),
                child: content,
              );

              if (isPhoneSized) {
                return screenCard;
              }

              return Container(
                color: _darkMode ? const Color(0xFF070F0C) : const Color(0xFFE4DECB),
                child: Center(
                  child: Container(
                    width: 390,
                    height: 844,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: t.rule),
                      boxShadow: [BoxShadow(color: t.shadow, blurRadius: 50, offset: const Offset(0, 24))],
                    ),
                    child: screenCard,
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
