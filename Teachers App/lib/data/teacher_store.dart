import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../models.dart';
import '../models_json.dart';

/// Local desk, mark drafts, chat threads, photos, and the write outbox.
class TeacherStore {
  TeacherStore();

  static const _uuid = Uuid();

  Future<void> saveDesk(String staffId, TeacherSnapshot desk) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'desk_$staffId',
      jsonEncode({
        'staffId': staffId,
        'savedAt': DateTime.now().toUtc().toIso8601String(),
        'desk': desk.toJson(),
      }),
    );
  }

  Future<TeacherSnapshot?> loadDesk(String staffId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('desk_$staffId');
      if (raw == null || raw.isEmpty) return null;
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final desk = map['desk'];
      if (desk is! Map) return null;
      return TeacherSnapshotJson.fromJson(Map<String, dynamic>.from(desk));
    } catch (_) {
      return null;
    }
  }

  Future<void> clearDesk(String staffId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('desk_$staffId');
  }

  /// Draft rows for one paper. Only pupils with a mark or Missed.
  Future<void> saveMarkDraft({
    required String paperId,
    required List<Map<String, dynamic>> rows,
    required DateTime updatedAt,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'draft_$paperId',
      jsonEncode({
        'paperId': paperId,
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'rows': rows,
      }),
    );
  }

  Future<MarkDraftBundle?> loadMarkDraft(String paperId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('draft_$paperId');
      if (raw == null || raw.isEmpty) return null;
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final rows = map['rows'];
      if (rows is! List) return null;
      return MarkDraftBundle(
        paperId: paperId,
        updatedAt: DateTime.tryParse('${map['updatedAt']}')?.toUtc() ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        rows: [
          for (final row in rows)
            if (row is Map) Map<String, dynamic>.from(row),
        ],
      );
    } catch (_) {
      return null;
    }
  }

  Future<List<MarkDraftBundle>> loadAllMarkDrafts() async {
    final prefs = await SharedPreferences.getInstance();
    final out = <MarkDraftBundle>[];
    for (final key in prefs.getKeys()) {
      if (!key.startsWith('draft_')) continue;
      final draft = await loadMarkDraft(key.substring('draft_'.length));
      if (draft != null) out.add(draft);
    }
    return out;
  }

  Future<void> clearMarkDraft(String paperId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('draft_$paperId');
  }

  Future<void> saveThread(String threadId, List<ChatMessage> messages) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'thread_$threadId',
      jsonEncode({
        'threadId': threadId,
        'messages': messages.map((row) => row.toJson()).toList(),
      }),
    );
  }

  Future<List<ChatMessage>> loadThread(String threadId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('thread_$threadId');
      if (raw == null || raw.isEmpty) return const [];
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final messages = map['messages'];
      if (messages is! List) return const [];
      return [
        for (final row in messages)
          if (row is Map)
            ChatMessageJson.fromJson(Map<String, dynamic>.from(row)),
      ];
    } catch (_) {
      return const [];
    }
  }

  Future<void> savePhotoBytes(String key, List<int> bytes) async {
    if (bytes.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('photo_$key', base64Encode(bytes));
  }

  Future<Uint8List?> loadPhotoBytes(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('photo_$key');
      if (raw == null || raw.isEmpty) return null;
      return Uint8List.fromList(base64Decode(raw));
    } catch (_) {
      return null;
    }
  }

  Future<OutboxItem> enqueue({
    required String kind,
    required Map<String, dynamic> payload,
    List<int>? fileBytes,
    String? fileName,
    bool replaceSamePaperDraft = false,
  }) async {
    final id = _uuid.v4();
    String? localFile;
    final prefs = await SharedPreferences.getInstance();
    if (fileBytes != null && fileBytes.isNotEmpty) {
      await prefs.setString('outbox_file_$id', base64Encode(fileBytes));
      localFile = 'prefs:outbox_file_$id';
    }
    final item = OutboxItem(
      id: id,
      kind: kind,
      payload: payload,
      localFile: localFile,
      fileName: fileName,
      createdAt: DateTime.now().toUtc(),
    );
    var items = await listOutbox();
    if (replaceSamePaperDraft &&
        kind == 'saveMarks' &&
        payload['submit'] != true) {
      final paperId = '${payload['paperId']}';
      final stale = items
          .where(
            (row) =>
                row.kind == 'saveMarks' &&
                row.payload['submit'] != true &&
                '${row.payload['paperId']}' == paperId,
          )
          .toList();
      for (final old in stale) {
        await removeOutbox(old.id);
      }
      items = await listOutbox();
    }
    items.add(item);
    await prefs.setString(
      'outbox',
      jsonEncode(items.map((row) => row.toJson()).toList()),
    );
    return item;
  }

  Future<List<OutboxItem>> listOutbox() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('outbox');
      if (raw == null || raw.isEmpty) return [];
      final list = jsonDecode(raw);
      if (list is! List) return [];
      return [
        for (final row in list)
          if (row is Map) OutboxItem.fromJson(Map<String, dynamic>.from(row)),
      ]..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    } catch (_) {
      return [];
    }
  }

  Future<void> removeOutbox(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final items = await listOutbox();
    await prefs.setString(
      'outbox',
      jsonEncode(
        items.where((row) => row.id != id).map((row) => row.toJson()).toList(),
      ),
    );
    await prefs.remove('outbox_file_$id');
  }

  Future<List<int>?> readOutboxFile(OutboxItem item) async {
    final path = item.localFile;
    if (path == null || !path.startsWith('prefs:')) return null;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(path.substring('prefs:'.length));
      if (raw == null) return null;
      return base64Decode(raw);
    } catch (_) {
      return null;
    }
  }
}

class MarkDraftBundle {
  const MarkDraftBundle({
    required this.paperId,
    required this.updatedAt,
    required this.rows,
  });

  final String paperId;
  final DateTime updatedAt;
  final List<Map<String, dynamic>> rows;

  List<Score> get scores => [
        for (final row in rows)
          Score(
            assessmentId: '${row['assessment_id'] ?? paperId}',
            studentId: '${row['student_id'] ?? ''}',
            score: row['score'] == null
                ? null
                : (row['score'] is num
                    ? (row['score'] as num).toDouble()
                    : double.tryParse('${row['score']}')),
            missed: row['missed'] == true,
          ),
      ];
}

class OutboxItem {
  const OutboxItem({
    required this.id,
    required this.kind,
    required this.payload,
    required this.createdAt,
    this.localFile,
    this.fileName,
  });

  final String id;
  final String kind;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final String? localFile;
  final String? fileName;

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'payload': payload,
        'createdAt': createdAt.toIso8601String(),
        'localFile': localFile,
        'fileName': fileName,
      };

  factory OutboxItem.fromJson(Map<String, dynamic> json) => OutboxItem(
        id: '${json['id'] ?? ''}',
        kind: '${json['kind'] ?? ''}',
        payload: json['payload'] is Map
            ? Map<String, dynamic>.from(json['payload'] as Map)
            : const {},
        createdAt: DateTime.tryParse('${json['createdAt']}')?.toUtc() ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        localFile: json['localFile']?.toString(),
        fileName: json['fileName']?.toString(),
      );
}
