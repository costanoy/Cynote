// Port of desktop/src/sync/reconcile.ts (Cynote sync v2, see SYNC.md at the
// repo root). Every case in sync-spec/vectors.json must give the same output
// here and there, so keep the two in step.

import 'dart:math';

/// One note as this device sees it. [u] is the time of the last edit (ms).
class LocalNote {
  final String id;
  final String title;
  final String body;
  final int u;
  const LocalNote({required this.id, required this.title, required this.body, required this.u});

  @override
  bool operator ==(Object other) =>
      other is LocalNote && other.id == id && other.title == title && other.body == body && other.u == u;

  @override
  int get hashCode => Object.hash(id, title, body, u);

  @override
  String toString() => 'LocalNote($id, $title, $u)';
}

/// One note as stored in the cloud under /sync/{code}/v2/notes/{id}.
class RemoteNote {
  final String t;
  final String b;
  final int u;
  final String d;
  final String? p;
  final bool x;
  const RemoteNote({required this.t, required this.b, required this.u, required this.d, this.p, this.x = false});

  Map<String, dynamic> toJson() => {'t': t, 'b': b, 'u': u, 'd': d, if (p != null) 'p': p, if (x) 'x': true};

  @override
  String toString() => 'RemoteNote(${toJson()})';
}

/// The version both sides last agreed on. [m]: this device wrote it.
class BaseEntry {
  final String h;
  final bool m;
  const BaseEntry(this.h, this.m);

  Map<String, dynamic> toJson() => {'h': h, 'm': m};

  @override
  bool operator ==(Object other) => other is BaseEntry && other.h == h && other.m == m;

  @override
  int get hashCode => Object.hash(h, m);

  @override
  String toString() => 'BaseEntry($h, $m)';
}

typedef Base = Map<String, BaseEntry>;

class RemovedNote {
  final String id;
  final int deletedAt;
  const RemovedNote(this.id, this.deletedAt);
}

class ReconcileOutput {
  /// Notes to create or replace on this device (conflict copies included).
  final List<LocalNote> upserts = [];

  /// Notes deleted on another device: remove here and remember as deleted.
  final List<RemovedNote> removals = [];

  /// Ids to drop from the local deleted list (another device kept editing them).
  final List<String> undeletes = [];

  /// Notes to write to the cloud.
  final Map<String, RemoteNote> push = {};

  /// The complete new base. Entries for ids in [push] only count once the push succeeds.
  final Base base = {};
}

final noteIdPattern = RegExp(r'^[A-Za-z0-9_~-]{1,100}$');

/// FNV-1a, 32 bits, over UTF-16 code units; 8 lowercase hex digits.
String fnv1a(String text) {
  var h = 0x811c9dc5;
  for (final unit in text.codeUnits) {
    h ^= unit;
    h = (h * 0x01000193) & 0xFFFFFFFF;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

String noteHash(String title, String body, bool deleted) => fnv1a('$title\u0000$body\u0000${deleted ? '1' : '0'}');

final tombstoneHash = noteHash('', '', true);

bool isBlankNote(String title, String body) {
  final t = title.trim();
  return body.trim().isEmpty && (t.isEmpty || t == 'Nova nota');
}

/// Null when [v] is not a well-formed cloud note.
RemoteNote? validRemote(Object? v) {
  if (v is! Map) return null;
  final t = v['t'];
  final b = v['b'];
  final d = v['d'];
  final u = v['u'];
  final p = v['p'];
  final x = v['x'];
  if (t is! String || b is! String || d is! String) return null;
  if (u is! num || !u.isFinite) return null;
  if (p != null && p is! String) return null;
  if (x != null && x is! bool) return null;
  return RemoteNote(t: t, b: b, u: u.toInt(), d: d, p: p as String?, x: x == true);
}

bool _hasUniqueLines(String loser, String winner) {
  if (loser.trim().isEmpty) return false;
  final kept = winner.split('\n').map((l) => l.trim()).toSet();
  return loser.split('\n').any((l) => l.trim().isNotEmpty && !kept.contains(l.trim()));
}

String conflictTitle(String title) => '${title.trim().isEmpty ? 'Sem título' : title.trim()} (conflito)';

class _Side {
  final String title;
  final String body;
  final int u;
  final bool deleted;
  const _Side(this.title, this.body, this.u, this.deleted);
}

ReconcileOutput reconcile({
  required String me,
  required int now,
  required List<LocalNote> local,
  required Map<String, int> deleted,
  required List<String> ignored,
  required Map<String, Object?> remote,
  required Base base,
  required String Function() newId,
}) {
  final out = ReconcileOutput();
  final ignoredSet = ignored.toSet();

  final localById = <String, LocalNote>{};
  for (final n in local) {
    if (noteIdPattern.hasMatch(n.id)) localById[n.id] = n;
  }

  final remoteById = <String, RemoteNote>{};
  remote.forEach((id, v) {
    final r = validRemote(v);
    if (r != null && noteIdPattern.hasMatch(id)) remoteById[id] = r;
  });

  final ids = <String>{...localById.keys, ...remoteById.keys};
  for (final id in deleted.keys) {
    if (noteIdPattern.hasMatch(id) && (remoteById.containsKey(id) || base.containsKey(id))) ids.add(id);
  }

  RemoteNote toRemote(_Side s, String p) => s.deleted
      ? RemoteNote(t: '', b: '', u: s.u, d: me, p: p, x: true)
      : RemoteNote(t: s.title, b: s.body, u: s.u, d: me, p: p);

  void addCopy(String title, String body) {
    final id = newId();
    final copy = LocalNote(id: id, title: conflictTitle(title), body: body, u: now);
    out.upserts.add(copy);
    out.push[id] = toRemote(_Side(copy.title, copy.body, copy.u, false), '');
    out.base[id] = BaseEntry(noteHash(copy.title, copy.body, false), true);
  }

  final sorted = ids.toList()..sort();
  for (final id in sorted) {
    if (ignoredSet.contains(id) && !localById.containsKey(id)) continue;

    final live = localById[id];
    final deletedAt = deleted[id];
    final _Side? l = live != null
        ? _Side(live.title, live.body, live.u, false)
        : deletedAt != null
        ? _Side('', '', deletedAt, true)
        : null;
    final r = remoteById[id];
    final b = base[id];

    if (r == null) {
      if (l == null || l.deleted) continue;
      if (b == null && isBlankNote(l.title, l.body)) continue;
      out.push[id] = toRemote(l, b?.h ?? '');
      out.base[id] = BaseEntry(noteHash(l.title, l.body, false), true);
      continue;
    }

    final hR = noteHash(r.t, r.b, r.x);
    LocalNote fromRemote() => LocalNote(id: id, title: r.t, body: r.b, u: r.u);

    if (l == null) {
      out.base[id] = BaseEntry(hR, false);
      if (!r.x) out.upserts.add(fromRemote());
      continue;
    }

    final hL = noteHash(l.title, l.body, l.deleted);
    if (hL == hR) {
      out.base[id] = BaseEntry(hR, b != null && b.h == hR ? b.m : false);
      continue;
    }

    final localChanged = b == null || hL != b.h;
    final remoteChanged = b == null || hR != b.h;
    final clobbered = b != null && b.m && hR != b.h && (r.p ?? '') != b.h;

    if (!localChanged && !clobbered) {
      // Only the other device changed it.
      out.base[id] = BaseEntry(hR, false);
      if (r.x) {
        out.removals.add(RemovedNote(id, r.u));
      } else {
        out.upserts.add(fromRemote());
        if (l.deleted) out.undeletes.add(id);
      }
      continue;
    }

    if (localChanged && !remoteChanged) {
      out.push[id] = toRemote(l, b.h);
      out.base[id] = BaseEntry(hL, true);
      continue;
    }

    // Both changed since they last agreed. An edit always beats a deletion.
    if (l.deleted && !r.x) {
      out.base[id] = BaseEntry(hR, false);
      out.upserts.add(fromRemote());
      out.undeletes.add(id);
      continue;
    }
    if (!l.deleted && r.x) {
      out.push[id] = toRemote(l, hR);
      out.base[id] = BaseEntry(hL, true);
      continue;
    }

    // Both edited: the later edit stays, the other text survives as a copy.
    final localWins = l.u > r.u || (l.u == r.u && hL.compareTo(hR) > 0);
    if (localWins) {
      out.push[id] = toRemote(l, hR);
      out.base[id] = BaseEntry(hL, true);
      if (_hasUniqueLines(r.b, l.body)) addCopy(r.t, r.b);
    } else {
      out.base[id] = BaseEntry(hR, false);
      out.upserts.add(fromRemote());
      if (_hasUniqueLines(l.body, r.b)) addCopy(l.title, l.body);
    }
  }

  return out;
}

/// True when this device has something the cloud has not seen yet.
bool hasLocalChanges(List<LocalNote> local, Map<String, int> deleted, Base base) {
  for (final n in local) {
    if (!noteIdPattern.hasMatch(n.id)) continue;
    final b = base[n.id];
    if (b == null) {
      if (!isBlankNote(n.title, n.body)) return true;
    } else if (b.h != noteHash(n.title, n.body, false)) {
      return true;
    }
  }
  for (final id in deleted.keys) {
    final b = base[id];
    if (b != null && b.h != tombstoneHash) return true;
  }
  return false;
}

/// Codes look like 4F2A9-C81D0-77B3E-0A1C5: 20 hex digits in groups of five.
String? normalizeSyncCode(String input) {
  final hex = input.toUpperCase().replaceAll(RegExp(r'[^0-9A-F]'), '');
  if (hex.length != 20) return null;
  return [for (var i = 0; i < 20; i += 5) hex.substring(i, i + 5)].join('-');
}

String generateSyncCode([Random? random]) {
  final rng = random ?? Random.secure();
  final hex = StringBuffer();
  for (var i = 0; i < 10; i++) {
    hex.write(rng.nextInt(256).toRadixString(16).padLeft(2, '0'));
  }
  return normalizeSyncCode(hex.toString())!;
}
