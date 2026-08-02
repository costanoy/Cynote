import 'dart:async';

import 'package:flutter/material.dart';
import 'models/note.dart';
import 'notes_store.dart' as notes_store;
import 'device_identity.dart';
import 'sync/sync_service.dart';
import 'sync/peer_info.dart';
import 'theme.dart';
import 'screens/sync_screen.dart';
import 'screens/home_screen.dart';
import 'screens/search_screen.dart';
import 'screens/editor_screen.dart';
import 'screens/settings_screen.dart';

const _autosaveDelay = Duration(milliseconds: 1500);

void main() {
  runApp(const CynoteApp());
}

class CynoteApp extends StatelessWidget {
  const CynoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'Cynote',
      debugShowCheckedModeBanner: false,
      home: CynoteRoot(),
    );
  }
}

enum CyScreen { sync, home, search, editor, settings }

class CynoteRoot extends StatefulWidget {
  const CynoteRoot({super.key});

  @override
  State<CynoteRoot> createState() => _CynoteRootState();
}

class _CynoteRootState extends State<CynoteRoot> {
  CyScreen _screen = CyScreen.sync;
  CyScreen _returnScreen = CyScreen.home;
  bool _darkMode = true;
  List<Note> _notes = seedNotes();
  String? _activeNoteId;
  Timer? _saveDebounce;
  DeviceIdentity? _identity;
  SyncService? _syncService;
  String? _connectingToDeviceId;
  bool _pairingDialogShowing = false;

  @override
  void initState() {
    super.initState();
    getDeviceIdentity().then((identity) {
      if (!mounted) return;
      setState(() => _identity = identity);
      final service = SyncService(identity);
      service.notesProvider = () => _notes;
      service.onNotesMerged = _onNotesMerged;
      service.addListener(_onSyncChanged);
      _syncService = service;
      service.start();
    });
    notes_store.loadNotes().then((saved) {
      if (!mounted) return;
      if (saved != null && saved.isNotEmpty) {
        setState(() => _notes = saved);
      }
    });
  }

  @override
  void dispose() {
    _saveDebounce?.cancel();
    _syncService?.removeListener(_onSyncChanged);
    _syncService?.dispose();
    super.dispose();
  }

  void _onSyncChanged() {
    if (!mounted) return;
    setState(() {});
    _maybeShowPairingDialog();
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
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text('Sincronizar dispositivo'),
          content: Text('Sincronizar com "${peer.deviceName}"?'),
          actions: [
            TextButton(
              onPressed: () {
                service.respondToPairing(peer.deviceId, false);
                Navigator.of(ctx).pop();
                _pairingDialogShowing = false;
                _maybeShowPairingDialog();
              },
              child: const Text('Recusar'),
            ),
            TextButton(
              onPressed: () {
                service.respondToPairing(peer.deviceId, true);
                Navigator.of(ctx).pop();
                _pairingDialogShowing = false;
                _maybeShowPairingDialog();
              },
              child: const Text('Aceitar'),
            ),
          ],
        ),
      );
    });
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
    _saveDebounce?.cancel();
    _saveDebounce = Timer(_autosaveDelay, () => notes_store.saveNotes(_notes));
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

  void _toggleDarkMode() => setState(() => _darkMode = !_darkMode);

  @override
  Widget build(BuildContext context) {
    final t = _darkMode ? CyColors.dark : CyColors.light;

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
          onBack: _closeEditor,
          onTitleChanged: _onTitleChanged,
          onBodyChanged: _onBodyChanged,
        );
        break;
      case CyScreen.settings:
        content = SettingsScreen(
          t: t,
          darkMode: _darkMode,
          onBack: _goHome,
          onToggleDarkMode: _toggleDarkMode,
        );
        break;
    }

    return Scaffold(
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
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFEEF0F3), Color(0xFFDFE2E7), Color(0xFFEEF0F3)],
              ),
            ),
            child: Center(
              child: Container(
                width: 390,
                height: 844,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: t.border),
                  boxShadow: t.shadow,
                ),
                child: screenCard,
              ),
            ),
          );
        },
      ),
    );
  }
}
