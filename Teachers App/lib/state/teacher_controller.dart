import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../config.dart';
import '../data/teacher_repository.dart';
import '../data/teacher_store.dart';
import '../models.dart';
import '../models_json.dart';
import '../pupil_photos.dart';

class TeacherController extends ChangeNotifier {
  TeacherController({TeacherRepository? repository, TeacherStore? store})
    : _repository = repository ?? TeacherRepository(),
      _store = store ?? TeacherStore();

  final TeacherRepository _repository;
  final TeacherStore _store;
  StreamSubscription<AuthState>? _authSub;
  Timer? _flushTimer;
  var _flushing = false;
  static const _uuid = Uuid();

  bool booting = true;
  bool configured = false;
  bool refreshing = false;
  bool offline = false;
  String? banner;
  TeacherSnapshot? snapshot;
  bool _supabaseReady = false;

  List<ChatMessage> thread = const [];
  String? threadId;
  bool threadLoading = false;

  bool get hasSession {
    if (!_supabaseReady) return false;
    try {
      return Supabase.instance.client.auth.currentSession != null;
    } catch (_) {
      return false;
    }
  }

  String? get _staffId {
    final id = snapshot?.staff.id.trim() ?? '';
    if (id.isNotEmpty) return id;
    if (!_supabaseReady) return null;
    try {
      return Supabase.instance.client.auth.currentUser?.id;
    } catch (_) {
      return null;
    }
  }

  String? get _authUserId {
    if (!_supabaseReady) return null;
    try {
      return Supabase.instance.client.auth.currentUser?.id;
    } catch (_) {
      return null;
    }
  }

  /// Puts a snapshot in place for widget tests. Does not talk to Supabase.
  void installSnapshot(TeacherSnapshot value) {
    _flushTimer?.cancel();
    snapshot = value;
    booting = false;
    configured = true;
    offline = false;
    banner = null;
    notifyListeners();
  }

  Future<void> boot() async {
    try {
      final config = await AppConfig.load();
      configured = config.isReady;
      if (configured) {
        await _start(config.url, config.anonKey);
        if (_supabaseReady &&
            Supabase.instance.client.auth.currentSession != null) {
          // Open the last saved desk immediately; refresh in the background.
          final userId = _authUserId;
          if (userId != null) {
            final cached = await _store.loadDesk(userId);
            if (cached != null && !cached.unavailable) {
              snapshot = await _mergeDrafts(cached);
              offline = false;
              await _loadCachedPhotos(snapshot!);
              await _updateStatusBanner();
              booting = false;
              notifyListeners();
              unawaited(_refreshInBackground());
              return;
            }
          }
          final error = await _load();
          if (error != null) banner = error;
          unawaited(flushOutbox());
        }
      }
    } catch (_) {
      banner ??= 'Could not finish starting the app.';
    } finally {
      if (booting) {
        booting = false;
        notifyListeners();
      }
    }
  }

  Future<void> _refreshInBackground() async {
    try {
      final error = await _load();
      if (error != null && snapshot == null) banner = error;
      notifyListeners();
      unawaited(flushOutbox());
    } catch (_) {
      // Keep the cached desk; a later pull-to-refresh can retry.
    }
  }

  Future<String?> saveConnection(String url, String anonKey) async {
    final next = AppConfig(url: url.trim(), anonKey: anonKey.trim());
    if (!next.isReady) {
      return 'Enter the school project URL and the anon key from the website setup.';
    }
    await AppConfig.save(next.url, next.anonKey);
    if (_supabaseReady) {
      configured = true;
      notifyListeners();
      return 'Saved. Close and reopen KJA Teachers so the new connection is used.';
    }
    final error = await _start(next.url, next.anonKey);
    configured = _supabaseReady;
    notifyListeners();
    return error;
  }

  Future<String?> signIn(String email, String password) async {
    if (!_supabaseReady) return 'Connect the app to the school first.';
    final trimmedEmail = email.trim();
    if (trimmedEmail.isEmpty || password.isEmpty) {
      return 'Enter your email and password.';
    }
    try {
      await Supabase.instance.client.auth.signInWithPassword(
        email: trimmedEmail,
        password: password,
      );
      banner = null;
      final error = await _load(signOutOnFailure: true);
      if (error != null) banner = error;
      notifyListeners();
      unawaited(flushOutbox());
      return error;
    } on AuthException catch (error) {
      final message = error.message.toLowerCase();
      if (message.contains('invalid login') ||
          message.contains('invalid credentials')) {
        return 'Wrong email or password. Use the same login as the teacher desk on the school website.';
      }
      return error.message;
    } catch (error) {
      return _message(error);
    }
  }

  Future<String?> retry() => _load();

  Future<void> refresh() async {
    if (snapshot == null || !_supabaseReady || snapshot!.unavailable) return;
    refreshing = true;
    banner = null;
    notifyListeners();
    final error = await _load();
    refreshing = false;
    if (error != null) banner = error;
    notifyListeners();
    unawaited(flushOutbox());
  }

  void dismissBanner() {
    if (banner == null) return;
    banner = null;
    notifyListeners();
  }

  Future<void> signOut() async {
    final staffId = _staffId;
    snapshot = null;
    banner = null;
    offline = false;
    thread = const [];
    threadId = null;
    PhotoCache.instance.clear();
    if (staffId != null) {
      try {
        await _store.clearDesk(staffId);
      } catch (_) {}
    }
    if (_supabaseReady) {
      try {
        await Supabase.instance.client.auth.signOut();
      } catch (_) {}
    }
    notifyListeners();
  }

  Future<String?> awardPoints(List<Map<String, dynamic>> entries) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    final now = DateTime.now().toUtc().toIso8601String();
    return _queueOrRun(
      kind: 'awardPoints',
      payload: {'entries': entries},
      applyLocal: () {
        final added = <PointAward>[
          for (final row in entries)
            PointAward(
              id: 'local-${row['student_id']}-$now-${row['points']}',
              studentId: '${row['student_id']}',
              points: (row['points'] as num?)?.toInt() ?? 0,
              reasonId: '${row['reason_id']}',
              reasonLabel: current.pointReasons
                      .where((reason) => reason.id == '${row['reason_id']}')
                      .map((reason) => reason.label)
                      .firstOrNull ??
                  'Points',
              teacherName: current.staff.fullName,
              createdAt: now,
            ),
        ];
        snapshot = current.copyWith(pointAwards: [...added, ...current.pointAwards]);
      },
      online: () => _repository.awardPoints(snapshot: current, entries: entries),
      // Local desk is already updated; skip the heavy reload and return
      // immediately so Award never sits on "Awarding..." while the RPC
      // and parent/pupil notifications finish in the background.
      reloadAfterOnline: false,
      awaitOnline: false,
    );
  }

  Future<String?> changePassword(String password, String confirm) {
    if (offline) {
      return Future.value('Connect to the school to change your password.');
    }
    return _mutateOnline(() => _repository.changePassword(password, confirm));
  }

  Future<String?> setPhoto(List<int> bytes, String extension, String mime) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    return _queueOrRun(
      kind: 'setPhoto',
      payload: {
        'staffId': current.staff.id,
        'previousPath': current.staff.photoPath,
        'extension': extension,
        'mime': mime,
      },
      fileBytes: bytes,
      fileName: 'photo.$extension',
      applyLocal: () {
        PhotoCache.instance.put(current.staff.id, bytes);
        snapshot = current.copyWith(
          staff: StaffProfile(
            id: current.staff.id,
            fullName: current.staff.fullName,
            title: current.staff.title,
            campus: current.staff.campus,
            email: current.staff.email,
            initials: current.staff.initials,
            photoPath: current.staff.photoPath,
            photoUrl: current.staff.photoUrl,
          ),
        );
      },
      online: () => _repository.setPhoto(
        staffId: current.staff.id,
        previousPath: current.staff.photoPath,
        bytes: bytes,
        extension: extension,
        mime: mime,
      ),
    );
  }

  Future<String?> clearPhoto() {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    return _queueOrRun(
      kind: 'clearPhoto',
      payload: {'previousPath': current.staff.photoPath},
      applyLocal: () {
        PhotoCache.instance.remove(current.staff.id);
        snapshot = current.copyWith(
          staff: StaffProfile(
            id: current.staff.id,
            fullName: current.staff.fullName,
            title: current.staff.title,
            campus: current.staff.campus,
            email: current.staff.email,
            initials: current.staff.initials,
          ),
        );
      },
      online: () => _repository.clearPhoto(current.staff.photoPath),
    );
  }

  Future<String?> saveHomework({
    required String classCode,
    required String stream,
    required String subjectId,
    required String title,
    required String instructions,
    required String dueOn,
    required bool publish,
  }) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    final id = _uuid.v4();
    final subjectName = current.subjects
        .where(
          (row) =>
              row.classCode == classCode &&
              row.stream == stream &&
              row.subjectId == subjectId,
        )
        .map((row) => row.subjectName)
        .firstOrNull;
    return _queueOrRun(
      kind: 'saveHomework',
      payload: {
        'classCode': classCode,
        'stream': stream,
        'subjectId': subjectId,
        'title': title,
        'instructions': instructions,
        'dueOn': dueOn,
        'publish': publish,
      },
      applyLocal: () {
        final item = HomeworkItem(
          id: id,
          classCode: classCode,
          stream: stream,
          subjectId: subjectId,
          subjectName: subjectName ?? 'Subject',
          title: title.trim(),
          instructions: instructions.trim().isEmpty ? null : instructions.trim(),
          dueOn: dueOn,
          published: publish,
        );
        snapshot = current.copyWith(homework: [item, ...current.homework]);
      },
      online: () => _repository.saveHomework(
        snapshot: current,
        classCode: classCode,
        stream: stream,
        subjectId: subjectId,
        title: title,
        instructions: instructions,
        dueOn: dueOn,
        publish: publish,
      ),
    );
  }

  Future<String?> publishHomework(HomeworkItem item) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    return _queueOrRun(
      kind: 'publishHomework',
      payload: {'id': item.id},
      applyLocal: () {
        snapshot = current.copyWith(
          homework: [
            for (final row in current.homework)
              if (row.id == item.id)
                HomeworkItem(
                  id: row.id,
                  classCode: row.classCode,
                  stream: row.stream,
                  subjectId: row.subjectId,
                  subjectName: row.subjectName,
                  title: row.title,
                  instructions: row.instructions,
                  dueOn: row.dueOn,
                  published: true,
                  doneCount: row.doneCount,
                )
              else
                row,
          ],
        );
      },
      online: () => _repository.publishHomework(current, item),
    );
  }

  Future<String?> saveResource({
    required String classCode,
    required String stream,
    required String subjectId,
    required String kind,
    required String title,
    required bool publish,
    String? body,
    String? linkUrl,
    List<int>? fileBytes,
    String? fileName,
    String? fileMime,
  }) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    final id = _uuid.v4();
    final subjectName = current.subjects
        .where(
          (row) =>
              row.classCode == classCode &&
              row.stream == stream &&
              row.subjectId == subjectId,
        )
        .map((row) => row.subjectName)
        .firstOrNull;
    return _queueOrRun(
      kind: 'saveResource',
      payload: {
        'classCode': classCode,
        'stream': stream,
        'subjectId': subjectId,
        'kind': kind,
        'title': title,
        'publish': publish,
        'body': body,
        'linkUrl': linkUrl,
        'fileMime': fileMime,
      },
      fileBytes: fileBytes,
      fileName: fileName,
      applyLocal: () {
        final item = ResourceItem(
          id: id,
          classCode: classCode,
          stream: stream,
          subjectId: subjectId,
          subjectName: subjectName ?? 'Subject',
          kind: kind,
          title: title.trim(),
          body: body,
          linkUrl: linkUrl,
          fileName: fileName,
          published: publish,
        );
        snapshot = current.copyWith(resources: [item, ...current.resources]);
      },
      online: () => _repository.saveResource(
        snapshot: current,
        classCode: classCode,
        stream: stream,
        subjectId: subjectId,
        kind: kind,
        title: title,
        publish: publish,
        body: body,
        linkUrl: linkUrl,
        fileBytes: fileBytes,
        fileName: fileName,
        fileMime: fileMime,
      ),
    );
  }

  Future<String?> publishResource(ResourceItem item) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    return _queueOrRun(
      kind: 'publishResource',
      payload: {'id': item.id},
      applyLocal: () {
        snapshot = current.copyWith(
          resources: [
            for (final row in current.resources)
              if (row.id == item.id)
                ResourceItem(
                  id: row.id,
                  classCode: row.classCode,
                  stream: row.stream,
                  subjectId: row.subjectId,
                  subjectName: row.subjectName,
                  kind: row.kind,
                  title: row.title,
                  body: row.body,
                  linkUrl: row.linkUrl,
                  filePath: row.filePath,
                  fileName: row.fileName,
                  published: true,
                )
              else
                row,
          ],
        );
      },
      online: () => _repository.publishResource(current, item),
    );
  }

  Future<String?> openResource(ResourceItem item) async {
    final path = item.filePath;
    if (path == null || path.isEmpty) return item.linkUrl;
    try {
      return await _repository.resourceLink(path);
    } catch (_) {
      return null;
    }
  }

  /// Saves a partial or full mark draft. Blank pupils are omitted.
  Future<String?> saveMarkDraft({
    required Paper paper,
    required List<Map<String, dynamic>> rows,
  }) async {
    final current = snapshot;
    if (current == null) return 'Sign in again.';
    if (!paper.open) return 'This markbook is locked.';
    if (rows.isEmpty) {
      await _store.clearMarkDraft(paper.id);
      await _updateStatusBanner();
      notifyListeners();
      return null;
    }
    final now = DateTime.now().toUtc();
    await _store.saveMarkDraft(paperId: paper.id, rows: rows, updatedAt: now);
    _applyScores(paper.id, [
      for (final row in rows)
        Score(
          assessmentId: paper.id,
          studentId: '${row['student_id']}',
          score: row['score'] == null
              ? null
              : (row['score'] is num
                    ? (row['score'] as num).toDouble()
                    : double.tryParse('${row['score']}')),
          missed: row['missed'] == true,
        ),
    ], replacePaper: false);
    await _persistDesk();
    notifyListeners();
    return _queueOrRun(
      kind: 'saveMarks',
      payload: {
        'paperId': paper.id,
        'rows': rows,
        'submit': false,
      },
      skipLocalApply: true,
      reloadAfterOnline: false,
      online: () => _repository.saveMarks(
        snapshot: current,
        paper: paper,
        rows: rows,
        submit: false,
      ),
    );
  }

  Future<String?> saveMarks({
    required Paper paper,
    required List<Map<String, dynamic>> rows,
    required bool submit,
  }) async {
    final current = snapshot;
    if (current == null) return 'Sign in again.';
    if (submit) {
      await _store.clearMarkDraft(paper.id);
      _applyScores(paper.id, [
        for (final row in rows)
          Score(
            assessmentId: paper.id,
            studentId: '${row['student_id']}',
            score: row['score'] == null
                ? null
                : (row['score'] is num
                      ? (row['score'] as num).toDouble()
                      : double.tryParse('${row['score']}')),
            missed: row['missed'] == true,
          ),
      ], replacePaper: true);
      snapshot = snapshot!.copyWith(
        papers: [
          for (final row in snapshot!.papers)
            if (row.id == paper.id)
              Paper(
                id: row.id,
                name: row.name,
                classCode: row.classCode,
                stream: row.stream,
                subjectId: row.subjectId,
                subjectName: row.subjectName,
                kind: row.kind,
                maxScore: row.maxScore,
                status: 'submitted',
                heldOn: row.heldOn,
              )
            else
              row,
        ],
      );
      await _persistDesk();
      notifyListeners();
    }
    return _queueOrRun(
      kind: 'saveMarks',
      payload: {
        'paperId': paper.id,
        'rows': rows,
        'submit': submit,
      },
      skipLocalApply: true,
      online: () => _repository.saveMarks(
        snapshot: current,
        paper: paper,
        rows: rows,
        submit: submit,
      ),
    );
  }

  Future<String?> saveRegister({
    required String classCode,
    required String stream,
    required List<Map<String, dynamic>> rows,
  }) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    return _queueOrRun(
      kind: 'saveRegister',
      payload: {
        'classCode': classCode,
        'stream': stream,
        'rows': rows,
      },
      applyLocal: () {
        final studentIds = {
          for (final pupil in current.pupilsIn(classCode, stream)) pupil.id,
        };
        final kept = current.marks
            .where((row) => !studentIds.contains(row.studentId))
            .toList();
        final next = [
          ...kept,
          for (final row in rows)
            AttendanceMark(
              studentId: '${row['student_id']}',
              status: '${row['status'] ?? 'present'}',
              note: row['note']?.toString(),
            ),
        ];
        snapshot = current.copyWith(marks: next);
      },
      online: () => _repository.saveRegister(
        snapshot: current,
        classCode: classCode,
        stream: stream,
        rows: rows,
      ),
    );
  }

  Future<String?> setRegisterClosed({
    required String classCode,
    required String stream,
    required bool closed,
  }) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    return _queueOrRun(
      kind: 'setRegisterClosed',
      payload: {
        'classCode': classCode,
        'stream': stream,
        'closed': closed,
      },
      applyLocal: () {
        final closures = current.closures
            .where(
              (row) => !(row.classCode == classCode && row.stream == stream),
            )
            .toList();
        if (closed) {
          closures.add(RegisterClosure(classCode: classCode, stream: stream));
        }
        snapshot = current.copyWith(closures: closures);
      },
      online: () => _repository.setRegisterClosed(
        snapshot: current,
        classCode: classCode,
        stream: stream,
        closed: closed,
      ),
    );
  }

  Future<String?> saveDate({
    String? id,
    required String classCode,
    required String stream,
    required String title,
    required String kind,
    required String startsOn,
    String? endsOn,
    String? note,
  }) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    final dateId = id ?? _uuid.v4();
    return _queueOrRun(
      kind: 'saveDate',
      payload: {
        'id': id,
        'classCode': classCode,
        'stream': stream,
        'title': title,
        'kind': kind,
        'startsOn': startsOn,
        'endsOn': endsOn,
        'note': note,
      },
      applyLocal: () {
        final next = SchoolDate(
          id: dateId,
          title: title.trim(),
          kind: kind,
          startsOn: startsOn,
          endsOn: endsOn,
          note: note,
          classCode: classCode,
          stream: stream,
        );
        final dates = [
          for (final row in current.dates)
            if (row.id != dateId) row,
          next,
        ];
        snapshot = current.copyWith(dates: dates);
      },
      online: () => _repository.saveDate(
        snapshot: current,
        id: id,
        classCode: classCode,
        stream: stream,
        title: title,
        kind: kind,
        startsOn: startsOn,
        endsOn: endsOn,
        note: note,
      ),
    );
  }

  Future<String?> deleteDate(SchoolDate date) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    return _queueOrRun(
      kind: 'deleteDate',
      payload: {'id': date.id},
      applyLocal: () {
        snapshot = current.copyWith(
          dates: current.dates.where((row) => row.id != date.id).toList(),
        );
      },
      online: () => _repository.deleteDate(current, date),
    );
  }

  Future<String?> sendNotice({
    required String classCode,
    required String stream,
    required String title,
    required String body,
  }) {
    final current = snapshot;
    if (current == null) return Future.value('Sign in again.');
    final id = _uuid.v4();
    return _queueOrRun(
      kind: 'sendNotice',
      payload: {
        'classCode': classCode,
        'stream': stream,
        'title': title,
        'body': body,
      },
      applyLocal: () {
        final notice = ClassNotice(
          id: id,
          classCode: classCode,
          stream: stream,
          title: title.trim(),
          body: body.trim().isEmpty ? null : body.trim(),
          createdAt: DateTime.now().toUtc().toIso8601String(),
        );
        snapshot = current.copyWith(notices: [notice, ...current.notices]);
      },
      online: () => _repository.sendNotice(
        snapshot: current,
        classCode: classCode,
        stream: stream,
        title: title,
        body: body,
      ),
    );
  }

  Future<void> openThread(String id) async {
    final current = snapshot;
    if (current == null) return;
    threadId = id;
    threadLoading = true;
    thread = const [];
    notifyListeners();
    final cached = await _store.loadThread(id);
    if (cached.isNotEmpty) {
      thread = cached;
      threadLoading = false;
      notifyListeners();
    }
    try {
      thread = await _repository.loadMessages(id, current);
      await _store.saveThread(id, thread);
      offline = false;
    } catch (error) {
      if (thread.isEmpty) {
        banner = _message(error);
        thread = const [];
      } else {
        offline = true;
        await _updateStatusBanner();
      }
    } finally {
      threadLoading = false;
      notifyListeners();
    }
  }

  Future<String?> hideMessage(String id) async {
    final current = snapshot;
    if (current == null) return 'Sign in again.';
    return _queueOrRun(
      kind: 'hideMessage',
      payload: {'id': id},
      applyLocal: () {
        thread = [
          for (final message in thread)
            if (message.id == id) message.copyWith(hidden: true) else message,
        ];
        if (threadId != null) {
          unawaited(_store.saveThread(threadId!, thread));
        }
      },
      online: () => _repository.hideMessage(id),
    );
  }

  Uint8List? cachedPhoto(String? key) => PhotoCache.instance[key];

  Future<void> rememberPhoto(String key, List<int> bytes) async {
    if (key.isEmpty || bytes.isEmpty) return;
    PhotoCache.instance.put(key, bytes);
    await _store.savePhotoBytes(key, bytes);
  }

  Future<String?> flushOutbox() async {
    if (_flushing || !_supabaseReady || !hasSession) return null;
    _flushing = true;
    try {
      await _pruneEmptyDraftOutbox();
      final items = await _store.listOutbox();
      for (final item in items) {
        try {
          await _runOutboxItem(item);
          await _store.removeOutbox(item.id);
        } catch (error) {
          if (_isConnectivityError(error)) {
            offline = true;
            await _updateStatusBanner();
            _scheduleFlush();
            notifyListeners();
            return _message(error);
          }
          // Permanent failure: drop draft syncs (local draft still holds marks),
          // stop on other work so the teacher sees the real problem.
          if (item.kind == 'saveMarks' && item.payload['submit'] != true) {
            await _store.removeOutbox(item.id);
            continue;
          }
          banner = _message(error);
          notifyListeners();
          return _message(error);
        }
      }
      if (items.isNotEmpty) {
        offline = false;
        await _load();
        notifyListeners();
      } else {
        await _updateStatusBanner();
        notifyListeners();
      }
      return null;
    } finally {
      _flushing = false;
    }
  }

  Future<String?> _queueOrRun({
    required String kind,
    required Map<String, dynamic> payload,
    required Future<void> Function() online,
    void Function()? applyLocal,
    List<int>? fileBytes,
    String? fileName,
    bool skipLocalApply = false,
    bool reloadAfterOnline = true,
    bool awaitOnline = true,
  }) async {
    if (!skipLocalApply) {
      applyLocal?.call();
      await _persistDesk();
      notifyListeners();
    }

    Future<String?> runOnline() async {
      try {
        await online();
        offline = false;
        if (reloadAfterOnline) {
          final error = await _load();
          notifyListeners();
          unawaited(flushOutbox());
          return error;
        }
        await _updateStatusBanner();
        notifyListeners();
        unawaited(flushOutbox());
        return null;
      } catch (error) {
        if (!_isConnectivityError(error)) {
          if (!awaitOnline) {
            banner = _message(error);
          }
          notifyListeners();
          return _message(error);
        }
        await _store.enqueue(
          kind: kind,
          payload: payload,
          fileBytes: fileBytes,
          fileName: fileName,
          replaceSamePaperDraft:
              kind == 'saveMarks' && payload['submit'] != true,
        );
        offline = true;
        await _updateStatusBanner();
        _scheduleFlush();
        notifyListeners();
        return null;
      }
    }

    if (!awaitOnline) {
      unawaited(runOnline());
      return null;
    }
    return runOnline();
  }

  Future<String?> _mutateOnline(Future<void> Function() action) async {
    try {
      await action();
      final error = await _load();
      notifyListeners();
      return error;
    } catch (error) {
      notifyListeners();
      return _message(error);
    }
  }

  Future<String?> _start(String url, String anonKey) async {
    if (_supabaseReady) return null;
    try {
      await Supabase.initialize(url: url, publishableKey: anonKey);
      _supabaseReady = true;
      _authSub = Supabase.instance.client.auth.onAuthStateChange.listen((
        state,
      ) {
        if (state.event == AuthChangeEvent.signedOut) {
          snapshot = null;
          thread = const [];
          threadId = null;
          offline = false;
          notifyListeners();
        }
      });
      return null;
    } catch (_) {
      return 'Could not connect to the school. Check the project URL and anon key.';
    }
  }

  Future<String?> _load({bool signOutOnFailure = false}) async {
    final userId = _authUserId;
    try {
      final live = await _repository.load();
      var desk = live;
      if (!live.unavailable) {
        desk = await _mergeDrafts(live);
        snapshot = desk;
        offline = false;
        await _persistDesk();
        unawaited(_cachePhotos(desk));
        await _updateStatusBanner();
        return null;
      }
      final cached = userId == null ? null : await _store.loadDesk(userId);
      if (cached != null && !cached.unavailable) {
        snapshot = await _mergeDrafts(cached);
        offline = true;
        await _loadCachedPhotos(snapshot!);
        await _updateStatusBanner();
        return null;
      }
      snapshot = live;
      return live.unavailableMessage;
    } catch (error) {
      final staffHint = snapshot?.staff.id ?? userId;
      TeacherSnapshot? cached;
      if (staffHint != null && staffHint.isNotEmpty) {
        cached = await _store.loadDesk(staffHint);
      }
      if (cached == null && userId != null) {
        cached = await _store.loadDesk(userId);
      }
      if (cached != null && !cached.unavailable) {
        snapshot = await _mergeDrafts(cached);
        offline = true;
        await _loadCachedPhotos(snapshot!);
        await _updateStatusBanner();
        return null;
      }
      if (signOutOnFailure && _supabaseReady) {
        snapshot = null;
        try {
          await Supabase.instance.client.auth.signOut();
        } catch (_) {}
      }
      return _message(error);
    }
  }

  Future<TeacherSnapshot> _mergeDrafts(TeacherSnapshot desk) async {
    final drafts = await _store.loadAllMarkDrafts();
    if (drafts.isEmpty) return desk;
    var scores = List<Score>.from(desk.scores);
    for (final draft in drafts) {
      final paper = desk.papers.where((row) => row.id == draft.paperId).firstOrNull;
      if (paper == null || !paper.open) {
        await _store.clearMarkDraft(draft.paperId);
        continue;
      }
      final draftIds = {for (final row in draft.scores) row.studentId};
      scores = [
        for (final row in scores)
          if (row.assessmentId != draft.paperId || !draftIds.contains(row.studentId))
            row,
        ...draft.scores,
      ];
    }
    return desk.copyWith(scores: scores);
  }

  void _applyScores(
    String paperId,
    List<Score> incoming, {
    required bool replacePaper,
  }) {
    final current = snapshot;
    if (current == null) return;
    final incomingIds = {for (final row in incoming) row.studentId};
    final kept = [
      for (final row in current.scores)
        if (row.assessmentId != paperId)
          row
        else if (!replacePaper && !incomingIds.contains(row.studentId))
          row,
    ];
    snapshot = current.copyWith(scores: [...kept, ...incoming]);
  }

  Future<void> _persistDesk() async {
    final desk = snapshot;
    final staffId = desk?.staff.id.trim();
    if (desk == null || desk.unavailable || staffId == null || staffId.isEmpty) {
      return;
    }
    try {
      await _store.saveDesk(staffId, desk);
      final userId = _authUserId;
      if (userId != null && userId != staffId) {
        await _store.saveDesk(userId, desk);
      }
    } catch (_) {}
  }

  Future<void> _cachePhotos(TeacherSnapshot desk) async {
    // Sign paths in the background so cold load is not blocked on storage.
    Map<String, String> signed = const {};
    try {
      signed = await _repository.signStudentPhotos(desk.pupils);
    } catch (_) {}
    var working = desk;
    if (signed.isNotEmpty) {
      working = desk.copyWith(
        pupils: [
          for (final pupil in desk.pupils)
            Pupil(
              id: pupil.id,
              fullName: pupil.fullName,
              classCode: pupil.classCode,
              stream: pupil.stream,
              studentNumber: pupil.studentNumber,
              profileId: pupil.profileId,
              photoPath: pupil.photoPath,
              photoUrl: signed[pupil.id] ?? pupil.photoUrl,
            ),
        ],
      );
      if (snapshot?.staff.id == desk.staff.id) {
        snapshot = working;
      }
    }

    final urls = <String, String>{};
    if ((working.staff.photoUrl ?? '').startsWith('http')) {
      urls[working.staff.id] = working.staff.photoUrl!;
    }
    for (final pupil in working.pupils) {
      final url = pupil.photoUrl?.trim() ?? '';
      if (url.startsWith('http')) urls[pupil.id] = url;
    }
    var added = false;
    for (final entry in urls.entries) {
      if (PhotoCache.instance[entry.key] != null) continue;
      try {
        final response = await http.get(Uri.parse(entry.value));
        if (response.statusCode >= 200 &&
            response.statusCode < 300 &&
            response.bodyBytes.isNotEmpty) {
          await rememberPhoto(entry.key, response.bodyBytes);
          added = true;
        }
      } catch (_) {}
    }
    if (added || signed.isNotEmpty) notifyListeners();
  }

  Future<void> _loadCachedPhotos(TeacherSnapshot desk) async {
    final keys = <String>{desk.staff.id, for (final pupil in desk.pupils) pupil.id};
    for (final key in keys) {
      if (PhotoCache.instance[key] != null) continue;
      final bytes = await _store.loadPhotoBytes(key);
      if (bytes != null && bytes.isNotEmpty) PhotoCache.instance.put(key, bytes);
    }
  }

  Future<void> _runOutboxItem(OutboxItem item) async {
    final current = snapshot;
    if (current == null) throw TeacherException('Sign in again.');
    final p = item.payload;
    switch (item.kind) {
      case 'saveMarks':
        final paperId = '${p['paperId']}';
        final paper = current.papers.where((row) => row.id == paperId).firstOrNull;
        if (paper == null) return;
        final rows = [
          for (final row in (p['rows'] as List? ?? const []))
            if (row is Map) Map<String, dynamic>.from(row),
        ];
        await _repository.saveMarks(
          snapshot: current,
          paper: paper,
          rows: rows,
          submit: p['submit'] == true,
        );
        if (p['submit'] == true) await _store.clearMarkDraft(paperId);
      case 'saveRegister':
        await _repository.saveRegister(
          snapshot: current,
          classCode: '${p['classCode']}',
          stream: '${p['stream']}',
          rows: [
            for (final row in (p['rows'] as List? ?? const []))
              if (row is Map) Map<String, dynamic>.from(row),
          ],
        );
      case 'setRegisterClosed':
        await _repository.setRegisterClosed(
          snapshot: current,
          classCode: '${p['classCode']}',
          stream: '${p['stream']}',
          closed: p['closed'] == true,
        );
      case 'saveDate':
        await _repository.saveDate(
          snapshot: current,
          id: p['id']?.toString(),
          classCode: '${p['classCode']}',
          stream: '${p['stream']}',
          title: '${p['title']}',
          kind: '${p['kind']}',
          startsOn: '${p['startsOn']}',
          endsOn: p['endsOn']?.toString(),
          note: p['note']?.toString(),
        );
      case 'deleteDate':
        final date = current.dates
            .where((row) => row.id == '${p['id']}')
            .firstOrNull;
        if (date != null) await _repository.deleteDate(current, date);
      case 'sendNotice':
        await _repository.sendNotice(
          snapshot: current,
          classCode: '${p['classCode']}',
          stream: '${p['stream']}',
          title: '${p['title']}',
          body: '${p['body']}',
        );
      case 'saveHomework':
        await _repository.saveHomework(
          snapshot: current,
          classCode: '${p['classCode']}',
          stream: '${p['stream']}',
          subjectId: '${p['subjectId']}',
          title: '${p['title']}',
          instructions: '${p['instructions'] ?? ''}',
          dueOn: '${p['dueOn']}',
          publish: p['publish'] == true,
        );
      case 'publishHomework':
        final homework = current.homework
            .where((row) => row.id == '${p['id']}')
            .firstOrNull;
        if (homework != null) {
          await _repository.publishHomework(current, homework);
        }
      case 'saveResource':
        final bytes = await _store.readOutboxFile(item);
        await _repository.saveResource(
          snapshot: current,
          classCode: '${p['classCode']}',
          stream: '${p['stream']}',
          subjectId: '${p['subjectId']}',
          kind: '${p['kind']}',
          title: '${p['title']}',
          publish: p['publish'] == true,
          body: p['body']?.toString(),
          linkUrl: p['linkUrl']?.toString(),
          fileBytes: bytes,
          fileName: item.fileName ?? p['fileName']?.toString(),
          fileMime: p['fileMime']?.toString(),
        );
      case 'publishResource':
        final resource = current.resources
            .where((row) => row.id == '${p['id']}')
            .firstOrNull;
        if (resource != null) {
          await _repository.publishResource(current, resource);
        }
      case 'hideMessage':
        await _repository.hideMessage('${p['id']}');
      case 'setPhoto':
        final bytes = await _store.readOutboxFile(item);
        if (bytes == null) return;
        await _repository.setPhoto(
          staffId: '${p['staffId']}',
          previousPath: p['previousPath']?.toString(),
          bytes: bytes,
          extension: '${p['extension'] ?? 'jpg'}',
          mime: '${p['mime'] ?? 'image/jpeg'}',
        );
      case 'clearPhoto':
        await _repository.clearPhoto(p['previousPath']?.toString());
      case 'awardPoints':
        await _repository.awardPoints(
          snapshot: current,
          entries: [
            for (final row in (p['entries'] as List? ?? const []))
              if (row is Map) Map<String, dynamic>.from(row),
          ],
        );
      default:
        break;
    }
  }

  void _scheduleFlush() {
    if (!_supabaseReady) return;
    _flushTimer?.cancel();
    _flushTimer = Timer(const Duration(seconds: 20), () {
      unawaited(flushOutbox());
    });
  }

  Future<void> _pruneEmptyDraftOutbox() async {
    final items = await _store.listOutbox();
    for (final item in items) {
      if (item.kind != 'saveMarks' || item.payload['submit'] == true) continue;
      final rows = item.payload['rows'];
      if (rows is List && rows.isNotEmpty) continue;
      await _store.removeOutbox(item.id);
    }
  }

  /// Offline, outbox, or unsubmitted mark drafts — not one-off action errors.
  Future<void> _updateStatusBanner() async {
    final outbox = await _store.listOutbox();
    final drafts = await _store.loadAllMarkDrafts();
    final desk = snapshot;
    final openDrafts = [
      for (final draft in drafts)
        if (draft.rows.isNotEmpty &&
            desk != null &&
            desk.papers.any((paper) => paper.id == draft.paperId && paper.open))
          draft,
    ];

    if (offline) {
      banner = outbox.isNotEmpty
          ? 'You are offline. Some work is waiting on this phone and will send when you are back online.'
          : 'You are offline. Showing the last saved desk.';
      return;
    }
    if (outbox.isNotEmpty) {
      // Online with work still queued — flush is about to run; do not claim offline.
      if (_isStatusBanner(banner)) banner = null;
      return;
    }
    if (openDrafts.isNotEmpty) {
      banner = openDrafts.length == 1
          ? 'Marks are saved as a draft. Open the markbook and submit when you are ready.'
          : 'Marks are saved as drafts in ${openDrafts.length} markbooks. Submit when every pupil has a mark.';
      return;
    }
    if (_isStatusBanner(banner)) banner = null;
  }

  bool _isStatusBanner(String? text) {
    if (text == null || text.isEmpty) return false;
    return text.startsWith('You are offline.') ||
        text.startsWith('Marks are saved as a draft') ||
        text.startsWith('Some work is waiting') ||
        text.startsWith('Saved on this phone.') ||
        text.startsWith('Showing the last saved');
  }

  bool _isConnectivityError(Object error) {
    if (error is TeacherException) return false;
    if (error is AuthException) return false;
    if (error is StorageException) {
      return _looksLikeConnectivity(error.message);
    }
    if (error is PostgrestException) {
      return _looksLikeConnectivity(error.message);
    }
    if (error is http.ClientException) return true;
    if (error is TimeoutException) return true;
    return _looksLikeConnectivity(error.toString());
  }

  bool _looksLikeConnectivity(String raw) {
    final text = raw.toLowerCase();
    return text.contains('socket') ||
        text.contains('failed host lookup') ||
        text.contains('network') ||
        text.contains('connection') ||
        text.contains('connection refused') ||
        text.contains('connection reset') ||
        text.contains('timed out') ||
        text.contains('timeout') ||
        text.contains('failed to fetch') ||
        text.contains('clientexception') ||
        text.contains('xmlhttprequest') ||
        text.contains('offline') ||
        text.contains('unreachable') ||
        text.contains('no address associated');
  }

  String _message(Object error) {
    if (error is TeacherException) return error.message;
    if (error is AuthException) return error.message;
    if (error is PostgrestException) return error.message;
    if (error is StorageException) return error.message;
    return 'Something went wrong. Try again.';
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _flushTimer?.cancel();
    super.dispose();
  }
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull {
    final iterator = this.iterator;
    if (!iterator.moveNext()) return null;
    return iterator.current;
  }
}
