import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../chat_filter.dart';
import '../format.dart';
import '../models.dart';
import '../pupil_photos.dart';

class PortalException implements Exception {
  PortalException(this.message);
  final String message;

  @override
  String toString() => message;
}

class PortalRepository {
  SupabaseClient get _db => Supabase.instance.client;
  final Map<String, List<int>> _sendBuckets = {};

  Future<PortalSnapshot> load() async {
    final user = _db.auth.currentUser;
    if (user == null) throw PortalException('Sign in to continue.');

    late final Map<String, dynamic> profile;
    late final Pupil? pupil;
    try {
      final settled = await Future.wait<Object?>([
        _db.from('profiles').select('id, role, full_name, email').eq('id', user.id).maybeSingle(),
        _loadPupil(user.id),
      ]);
      final row = settled[0] as Map<String, dynamic>?;
      profile = row ?? {'id': user.id, 'role': 'student', 'full_name': user.userMetadata?['full_name'], 'email': user.email};
      pupil = settled[1] as Pupil?;
    } catch (_) {
      throw PortalException('Could not reach the school. Check your connection and try again.');
    }

    final role = profile['role'] as String?;
    if (role != null && role.isNotEmpty && role != 'student') {
      throw PortalException('This account is not a pupil login. Use the email the office created for you.');
    }

    final email = (profile['email'] as String?) ?? user.email ?? '';
    final mustReset = _flag(user.userMetadata?['must_reset_password']);
    if (pupil == null) {
      final name = (profile['full_name'] as String?)?.trim();
      return PortalSnapshot(
        displayName: (name == null || name.isEmpty) ? 'Student' : name,
        classLabel: '',
        email: email,
        mustResetPassword: mustReset,
        preview: false,
      );
    }

    final boot = await Future.wait<Object?>([
      _maybeMap(_db.from('fee_terms').select('id, label').eq('is_current', true).maybeSingle()),
      _rows(_db.from('subjects').select('id, name')),
      _classmates(),
    ]);
    final term = boot[0] as Map<String, dynamic>?;
    final subjectRows = boot[1] as List<Map<String, dynamic>>;
    final classmatesRaw = boot[2] as List<Classmate>;
    final termId = term?['id'] as String?;
    final termLabel = term?['label'] as String?;
    final subjectNames = <String, String>{
      for (final row in subjectRows)
        if (row['id'] != null) row['id'].toString(): (row['name'] as String?) ?? 'Subject',
    };

    final photoPaths = <String, String?>{
      pupil.id: pupil.photoPath,
      for (final mate in classmatesRaw) mate.id: mate.photoPath,
    };

    // Home-critical data + photo signing + club consents (paid or not) in parallel.
    final bundle = await Future.wait<Object?>([
      _homework(pupil, termId, subjectNames),
      _notices(user.id),
      _timetable(pupil, termId, subjectNames),
      _attendance(pupil.id, termId),
      _teachers(pupil, termId, subjectNames),
      _resolvePhotoUrls(photoPaths),
      _clubs(pupil.id, termId),
    ]);

    final homework = bundle[0] as List<HomeworkItem>;
    final notices = bundle[1] as List<Notice>;
    final timetable = bundle[2] as List<Lesson>;
    final attendance = bundle[3] as AttendanceSummary;
    final staff = bundle[4] as (Teacher?, List<Teacher>);
    final photoUrls = bundle[5] as Map<String, String>;
    final clubs = bundle[6] as List<ClubMembership>;
    final classmates = [
      for (final mate in classmatesRaw) mate.withPhotoUrl(photoUrls[mate.id]),
    ];

    // Teacher portraits: signed storage URLs (same idea as pupil photos) + site proxy fallback.
    final teacherPaths = <String, String?>{
      if (staff.$1 != null) staff.$1!.staffId: staff.$1!.photoPath,
      for (final teacher in staff.$2) teacher.staffId: teacher.photoPath,
    };
    final teacherUrls = await _resolveTeacherPhotoUrls(teacherPaths);
    final classTeacher = staff.$1 == null
        ? null
        : staff.$1!.withPhotoUrl(teacherUrls[staff.$1!.staffId] ?? staff.$1!.photoUrl);
    final teachers = [
      for (final teacher in staff.$2)
        teacher.withPhotoUrl(teacherUrls[teacher.staffId] ?? teacher.photoUrl),
    ];

    final weekday = kampalaWeekday();
    final lessonsToday = weekday >= 1 && weekday <= 5
        ? timetable.where((lesson) => lesson.weekday == weekday).toList()
        : <Lesson>[];

    // Fill memory cache in the background so faces refresh without another login.
    unawaited(_hydratePhotoCache(photoPaths));
    unawaited(_hydrateTeacherPhotoCache(teacherPaths));

    return PortalSnapshot(
      displayName: pupil.displayName,
      classLabel: pupil.classLabel,
      email: email,
      mustResetPassword: mustReset,
      preview: false,
      pupil: pupil,
      photoUrl: photoUrls[pupil.id],
      photoUrls: photoUrls,
      termLabel: termLabel,
      classTeacher: classTeacher,
      homework: homework,
      notices: notices,
      lessonsToday: lessonsToday,
      timetable: timetable,
      attendance: attendance,
      clubs: clubs,
      teachers: teachers,
      classmates: classmates,
    );
  }

  /// Fills chat, reports, calendar and class resources after the first home paint.
  Future<PortalSnapshot> enrichExtras(PortalSnapshot current) async {
    final pupil = current.pupil;
    if (pupil == null) return current;

    String? termId;
    Map<String, String> subjectNames = {};
    try {
      final term = await _maybeMap(_db.from('fee_terms').select('id').eq('is_current', true).maybeSingle());
      termId = term?['id'] as String?;
      final subjectRows = await _rows(_db.from('subjects').select('id, name'));
      subjectNames = {
        for (final row in subjectRows)
          if (row['id'] != null) row['id'].toString(): (row['name'] as String?) ?? 'Subject',
      };
    } catch (_) {}

    final extras = await Future.wait<Object?>([
      _academicDates(pupil, termId),
      _events(),
      _reports(pupil.id),
      _conversations(pupil, current.classmates),
      _resources(pupil, subjectNames),
    ]);
    final inbox = extras[3] as (List<Conversation>, int);

    return current.copyWith(
      academicDates: extras[0] as List<AcademicDate>,
      events: extras[1] as List<SchoolEvent>,
      reports: extras[2] as List<ReportCard>,
      conversations: inbox.$1,
      unreadMessages: inbox.$2,
      resources: extras[4] as List<ClassResource>,
    );
  }

  /// Fresh signed URL when a pupil opens a file or image.
  Future<String?> resourceFileUrl(String? filePath) async {
    final path = filePath?.trim() ?? '';
    if (path.isEmpty) return null;
    try {
      return await _db.storage.from('class-resources').createSignedUrl(path, 60 * 60);
    } catch (_) {
      return null;
    }
  }

  Future<String?> setHomeworkDone({
    required String assignmentId,
    required String studentId,
    required bool done,
  }) async {
    try {
      if (done) {
        await _db.from('homework_completions').upsert({
          'assignment_id': assignmentId,
          'student_id': studentId,
          'done_at': DateTime.now().toUtc().toIso8601String(),
        });
      } else {
        await _db.from('homework_completions').delete().eq('assignment_id', assignmentId).eq('student_id', studentId);
      }
      return null;
    } on PostgrestException catch (error) {
      return error.message;
    } catch (_) {
      return 'Could not update that homework.';
    }
  }

  Future<String?> markNoticesRead(List<String> ids, String userId) async {
    if (ids.isEmpty) return null;
    try {
      await _db.from('notifications').update({'read': true}).inFilter('id', ids).eq('user_id', userId);
      return null;
    } on PostgrestException catch (error) {
      return error.message;
    } catch (_) {
      return 'Could not update notices.';
    }
  }

  Future<String?> changePassword(String password) async {
    try {
      await _db.auth.updateUser(UserAttributes(password: password, data: {'must_reset_password': false}));
      return null;
    } on AuthException catch (error) {
      return error.message;
    } catch (_) {
      return 'Could not change the password.';
    }
  }

  Future<List<ChatMessage>> messages(String conversationId) async {
    final rows = await _rows(
      _db
          .from('student_messages')
          .select('id, conversation_id, sender_student_id, body, flagged, created_at')
          .eq('conversation_id', conversationId)
          .eq('hidden', false)
          .order('created_at')
          .limit(200),
    );
    return rows.map(_message).whereType<ChatMessage>().toList();
  }

  RealtimeChannel watchMessages(String conversationId, void Function(ChatMessage message) onMessage) {
    final channel = _db.channel('pupil-messages:$conversationId');
    channel.onPostgresChanges(
      event: PostgresChangeEvent.insert,
      schema: 'public',
      table: 'student_messages',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'conversation_id',
        value: conversationId,
      ),
      callback: (payload) {
        final message = _message(Map<String, dynamic>.from(payload.newRecord));
        if (message != null) onMessage(message);
      },
    );
    channel.subscribe();
    return channel;
  }

  Future<void> stopWatching(RealtimeChannel channel) async {
    await _db.removeChannel(channel);
  }

  Future<Conversation?> startChat(Pupil pupil, Classmate peer) async {
    if (peer.id == pupil.id) throw PortalException('You cannot message yourself.');
    final low = pupil.id.compareTo(peer.id) < 0 ? pupil.id : peer.id;
    final high = pupil.id.compareTo(peer.id) < 0 ? peer.id : pupil.id;
    final existing = await _maybeMap(
      _db
          .from('student_conversations')
          .select('id')
          .eq('kind', 'dm')
          .eq('student_low_id', low)
          .eq('student_high_id', high)
          .maybeSingle(),
    );
    final id = existing?['id'] as String? ??
        (await _db.from('student_conversations').insert({
          'kind': 'dm',
          'student_low_id': low,
          'student_high_id': high,
        }).select('id').maybeSingle())?['id'] as String?;
    if (id == null) throw PortalException('Could not start that chat.');
    return Conversation(id: id, kind: 'dm', title: firstNameOf(peer.displayName), peerId: peer.id, house: peer.house);
  }

  Future<ChatMessage> sendMessage({
    required Pupil pupil,
    required Conversation conversation,
    required String body,
    required List<Classmate> classmates,
  }) async {
    final text = body.trim();
    if (text.isEmpty) throw PortalException('Write a message first.');
    if (text.length > 2000) throw PortalException('That message is too long.');
    if (!_rateOk(pupil.id)) throw PortalException('Please wait a moment before sending more messages.');
    final check = filterStudentChat(text);
    if (check.blocked) {
      throw PortalException("That message can't be sent. Please choose kinder words.");
    }

    final row = await _db.from('student_messages').insert({
      'conversation_id': conversation.id,
      'sender_student_id': pupil.id,
      'body': text,
      'flagged': check.flagged,
    }).select('id, conversation_id, sender_student_id, body, flagged, created_at').maybeSingle();
    final message = row == null ? null : _message(row);
    if (message == null) throw PortalException('The message was not sent.');

    try {
      await _notifyPeers(pupil, conversation, text, classmates);
    } catch (_) {
      /* The message is already saved. A missed notice should not undo it. */
    }
    return message;
  }

  Future<void> _notifyPeers(Pupil pupil, Conversation conversation, String text, List<Classmate> classmates) async {
    final from = firstNameOf(pupil.displayName);
    if (conversation.isGroup) {
      for (final peer in classmates.take(40)) {
        final profileId = peer.profileId;
        if (profileId == null || profileId.isEmpty) continue;
        await _db.rpc('notify_user', params: {
          'p_user_id': profileId,
          'p_title': '$from in class group',
          'p_body': text.length > 120 ? text.substring(0, 120) : text,
          'p_href': '/student/messages?c=${conversation.id}',
          'p_kind': 'messages',
        });
      }
      return;
    }
    final peer = classmates.cast<Classmate?>().firstWhere(
      (mate) => mate?.id == conversation.peerId,
      orElse: () => null,
    );
    final profileId = peer?.profileId;
    if (profileId == null || profileId.isEmpty) return;
    await _db.rpc('notify_user', params: {
      'p_user_id': profileId,
      'p_title': 'Message from $from',
      'p_body': text.length > 120 ? text.substring(0, 120) : text,
      'p_href': '/student/messages?c=${conversation.id}',
      'p_kind': 'messages',
    });
  }

  bool _rateOk(String studentId) {
    final now = DateTime.now().millisecondsSinceEpoch;
    final stamps = (_sendBuckets[studentId] ?? []).where((stamp) => now - stamp < 60000).toList();
    if (stamps.length >= 20) return false;
    stamps.add(now);
    _sendBuckets[studentId] = stamps;
    return true;
  }

  Future<Pupil?> _loadPupil(String userId) async {
    try {
      final row = await _db
          .from('students')
          .select('id, full_name, preferred_name, class_code, stream, campus, student_number, photo_path, status, profile_id, house, sex')
          .eq('profile_id', userId)
          .maybeSingle();
      return row == null ? null : _pupil(row);
    } on PostgrestException catch (error) {
      if (!RegExp(r'house|sex', caseSensitive: false).hasMatch(error.message)) rethrow;
      final row = await _db
          .from('students')
          .select('id, full_name, preferred_name, class_code, stream, campus, student_number, photo_path, status, profile_id')
          .eq('profile_id', userId)
          .maybeSingle();
      return row == null ? null : _pupil(row);
    }
  }

  Future<List<Classmate>> _classmates() async {
    try {
      final raw = await _db.rpc('classmate_ids');
      final ids = raw is List ? raw.map((id) => id.toString()).where((id) => id.isNotEmpty).toList() : <String>[];
      if (ids.isEmpty) return [];
      final rows = await _rows(
        _db
            .from('students')
            .select('id, full_name, preferred_name, house, profile_id, photo_path')
            .inFilter('id', ids)
            .order('full_name'),
      );
      return rows.map(_classmate).toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<HomeworkItem>> _homework(Pupil pupil, String? termId, Map<String, String> subjectNames) async {
    if (termId == null || (pupil.classCode ?? '').isEmpty) return [];
    try {
      final assignments = await _rows(
        _db
            .from('homework_assignments')
            .select('id, title, instructions, due_on, subject_id')
            .not('published_at', 'is', null)
            .eq('term_id', termId)
            .eq('class_code', pupil.classCode!)
            .eq('stream', pupil.stream ?? '')
            .order('due_on'),
      );
      final completions = await _rows(
        _db.from('homework_completions').select('assignment_id, done_at').eq('student_id', pupil.id),
      );
      final done = {for (final row in completions) row['assignment_id'].toString(): row['done_at'] as String?};
      return [
        for (final row in assignments)
          HomeworkItem(
            id: row['id'].toString(),
            title: (row['title'] as String?) ?? 'Homework',
            instructions: row['instructions'] as String?,
            dueOn: (row['due_on'] as String?) ?? '',
            subjectName: subjectNames[row['subject_id']?.toString()],
            done: done.containsKey(row['id'].toString()),
            doneAt: done[row['id'].toString()],
          ),
      ];
    } catch (_) {
      return [];
    }
  }

  Future<List<Notice>> _notices(String userId) async {
    final rows = await _rows(
      _db
          .from('notifications')
          .select('id, title, body, href, kind, read, created_at')
          .eq('user_id', userId)
          .order('created_at', ascending: false),
    );
    return [
      for (final row in rows)
        Notice(
          id: row['id'].toString(),
          title: (row['title'] as String?) ?? 'Notice',
          body: row['body'] as String?,
          href: row['href'] as String?,
          kind: row['kind'] as String?,
          read: row['read'] == true,
          createdAt: (row['created_at'] as String?) ?? '',
        ),
    ];
  }

  Future<List<Lesson>> _timetable(Pupil pupil, String? termId, Map<String, String> subjectNames) async {
    if (termId == null || (pupil.classCode ?? '').isEmpty) return [];
    final rows = await _rows(
      _db
          .from('timetable_slots')
          .select('id, weekday, period, starts_at, ends_at, subject_id, room')
          .eq('term_id', termId)
          .eq('class_code', pupil.classCode!)
          .eq('stream', pupil.stream ?? '')
          .order('weekday')
          .order('period'),
    );
    return [
      for (final row in rows)
        Lesson(
          id: row['id'].toString(),
          weekday: _int(row['weekday']) ?? 1,
          period: _int(row['period']) ?? 1,
          startsAt: row['starts_at']?.toString(),
          endsAt: row['ends_at']?.toString(),
          subjectName: subjectNames[row['subject_id']?.toString()] ?? 'Lesson',
          room: row['room'] as String?,
        ),
    ];
  }

  Future<AttendanceSummary> _attendance(String studentId, String? termId) async {
    if (termId == null) return AttendanceSummary.empty;
    final rows = await _rows(
      _db.from('attendance').select('attended_on, status').eq('student_id', studentId).eq('term_id', termId),
    );
    return AttendanceSummary.fromDays([
      for (final row in rows)
        AttendanceDay(
          attendedOn: (row['attended_on'] as String?) ?? '',
          status: (row['status'] as String?) ?? 'present',
        ),
    ]);
  }

  /// Every open parent consent for this pupil — paid or not.
  /// RLS on club_consents already hides withdrawn rows for the linked pupil.
  Future<List<ClubMembership>> _clubs(String studentId, String? termId) async {
    List<Map<String, dynamic>> consents = [];
    try {
      // Embed club details in one round-trip. Do not filter withdrawn_at here —
      // the student policy only exposes open consents.
      consents = await _rows(
        _db
            .from('club_consents')
            .select('id, club_id, consented_at, clubs(id, title, campus, meeting, description)')
            .eq('student_id', studentId)
            .order('consented_at', ascending: false),
      );
    } catch (error) {
      assert(() {
        debugPrint('KJA club_consents embed failed: $error');
        return true;
      }());
      try {
        consents = await _rows(
          _db.from('club_consents').select('id, club_id, consented_at').eq('student_id', studentId),
        );
      } catch (fallbackError) {
        assert(() {
          debugPrint('KJA club_consents failed: $fallbackError');
          return true;
        }());
        return [];
      }
    }

    if (consents.isEmpty) {
      assert(() {
        debugPrint('KJA clubs: no open consents for student $studentId');
        return true;
      }());
      return [];
    }

    final clubIds = <String>[
      for (final consent in consents)
        if ((consent['club_id']?.toString() ?? '').isNotEmpty) consent['club_id'].toString(),
    ];

    // Fill any missing club rows (when embed was stripped by RLS).
    var byId = <String, Map<String, dynamic>>{};
    for (final consent in consents) {
      final embedded = _embeddedClub(consent['clubs']);
      final clubId = consent['club_id']?.toString() ?? '';
      if (embedded != null && clubId.isNotEmpty) byId[clubId] = embedded;
    }
    final missing = [for (final id in clubIds) if (!byId.containsKey(id)) id];
    if (missing.isNotEmpty) {
      try {
        final clubs = await _rows(
          _db.from('clubs').select('id, title, campus, meeting, description').inFilter('id', missing),
        );
        for (final club in clubs) {
          byId[club['id'].toString()] = club;
        }
      } catch (error) {
        assert(() {
          debugPrint('KJA clubs catalogue failed: $error');
          return true;
        }());
      }
    }

    var paid = <String>{};
    if (termId != null) {
      try {
        final payments = await _rows(
          _db.from('club_payments').select('club_id').eq('student_id', studentId).eq('term_id', termId),
        );
        // Student payment policy already hides voided rows.
        paid = {for (final row in payments) row['club_id'].toString()};
      } catch (error) {
        assert(() {
          debugPrint('KJA club_payments failed: $error');
          return true;
        }());
      }
    }

    final memberships = <ClubMembership>[];
    for (final consent in consents) {
      final clubId = consent['club_id'].toString();
      final club = byId[clubId];
      final title = (club?['title'] as String?)?.trim();
      memberships.add(
        ClubMembership(
          id: consent['id'].toString(),
          title: (title == null || title.isEmpty) ? 'Club' : title,
          campus: club?['campus'] as String?,
          meeting: club?['meeting'] as String?,
          description: club?['description'] as String?,
          paid: paid.contains(clubId),
        ),
      );
    }
    assert(() {
      debugPrint('KJA clubs loaded ${memberships.length} (paid ${memberships.where((c) => c.paid).length})');
      return true;
    }());
    return memberships;
  }

  Map<String, dynamic>? _embeddedClub(dynamic value) {
    if (value is Map) return Map<String, dynamic>.from(value);
    if (value is List && value.isNotEmpty && value.first is Map) {
      return Map<String, dynamic>.from(value.first as Map);
    }
    return null;
  }

  Future<(Teacher?, List<Teacher>)> _teachers(Pupil pupil, String? termId, Map<String, String> subjectNames) async {
    if ((pupil.classCode ?? '').isEmpty) return (null, <Teacher>[]);
    try {
      // Preferred: security-definer RPC (0045) — matches stream the same way the office assigns.
      final rpc = await _db.rpc('my_class_teachers');
      if (rpc is List && rpc.isNotEmpty) {
        Teacher? classTeacher;
        final teachers = <Teacher>[];
        for (final raw in rpc) {
          if (raw is! Map) continue;
          final row = Map<String, dynamic>.from(raw);
          final role = (row['role'] as String?) ?? '';
          final staffId = row['staff_id']?.toString() ?? '';
          final fullName = (row['full_name'] as String?)?.trim();
          if (staffId.isEmpty || fullName == null || fullName.isEmpty) continue;
          final photoPath = _textOrNull(row['photo_path']);
          if (role == 'class') {
            classTeacher ??= Teacher(
              id: staffId,
              fullName: fullName,
              title: row['title'] as String?,
              role: 'class',
              photoPath: photoPath,
              photoUrl: photoPath == null
                  ? null
                  : PupilPhotoUrl.teacherProxy(staffId: staffId, photoPath: photoPath),
            );
            continue;
          }
          if (role == 'subject') {
            final subjectId = row['subject_id']?.toString() ?? '';
            teachers.add(
              Teacher(
                id: '$staffId:$subjectId',
                fullName: fullName,
                title: row['title'] as String?,
                subjectName: subjectNames[subjectId] ?? 'Subject',
                role: 'subject',
                photoPath: photoPath,
                photoUrl: photoPath == null
                    ? null
                    : PupilPhotoUrl.teacherProxy(staffId: staffId, photoPath: photoPath),
              ),
            );
          }
        }
        return (classTeacher, teachers);
      }
    } catch (error) {
      assert(() {
        debugPrint('KJA my_class_teachers RPC failed: $error');
        return true;
      }());
    }

    // Fallback when 0045 is not applied yet.
    if (termId == null) return (null, <Teacher>[]);
    final stream = (pupil.stream ?? '').trim();
    try {
      final classRows = await _rows(
        _db
            .from('class_teachers')
            .select('staff_id, teaching_staff(id, full_name, title, active, photo_path)')
            .eq('term_id', termId)
            .eq('class_code', pupil.classCode!)
            .eq('stream', stream),
      );
      final subjectRows = await _rows(
        _db
            .from('subject_teachers')
            .select('staff_id, subject_id, teaching_staff(id, full_name, title, active, photo_path)')
            .eq('term_id', termId)
            .eq('class_code', pupil.classCode!)
            .eq('stream', stream),
      );
      Teacher? classTeacher;
      for (final row in classRows) {
        final staff = _embeddedStaff(row['teaching_staff']);
        if (staff == null || staff['active'] == false) continue;
        final staffId = (staff['id'] ?? row['staff_id']).toString();
        final photoPath = _textOrNull(staff['photo_path']);
        classTeacher = Teacher(
          id: staffId,
          fullName: (staff['full_name'] as String?) ?? 'Teacher',
          title: staff['title'] as String?,
          role: 'class',
          photoPath: photoPath,
          photoUrl: photoPath == null
              ? null
              : PupilPhotoUrl.teacherProxy(staffId: staffId, photoPath: photoPath),
        );
        break;
      }
      final teachers = <Teacher>[];
      for (final row in subjectRows) {
        final staff = _embeddedStaff(row['teaching_staff']);
        if (staff == null || staff['active'] == false) continue;
        final staffId = row['staff_id']?.toString() ?? '';
        final photoPath = _textOrNull(staff['photo_path']);
        teachers.add(
          Teacher(
            id: '$staffId:${row['subject_id']}',
            fullName: (staff['full_name'] as String?) ?? 'Teacher',
            title: staff['title'] as String?,
            subjectName: subjectNames[row['subject_id']?.toString()] ?? 'Subject',
            role: 'subject',
            photoPath: photoPath,
            photoUrl: photoPath == null
                ? null
                : PupilPhotoUrl.teacherProxy(staffId: staffId, photoPath: photoPath),
          ),
        );
      }
      return (classTeacher, teachers);
    } catch (error) {
      assert(() {
        debugPrint('KJA teachers fallback failed: $error');
        return true;
      }());
      return (null, <Teacher>[]);
    }
  }

  Map<String, dynamic>? _embeddedStaff(dynamic value) {
    if (value is Map) return Map<String, dynamic>.from(value);
    if (value is List && value.isNotEmpty && value.first is Map) {
      return Map<String, dynamic>.from(value.first as Map);
    }
    return null;
  }

  Future<List<AcademicDate>> _academicDates(Pupil pupil, String? termId) async {
    if (termId == null) return [];
    final rows = await _rows(
      _db.from('academic_dates').select('id, title, kind, starts_on, ends_on, campus, note').eq('term_id', termId).order('starts_on'),
    );
    return [
      for (final row in rows)
        if (_campusMatches(row['campus'] as String?, pupil.campus))
          AcademicDate(
            id: row['id'].toString(),
            title: (row['title'] as String?) ?? 'School day',
            kind: (row['kind'] as String?) ?? 'meeting',
            startsOn: (row['starts_on'] as String?) ?? '',
            endsOn: row['ends_on'] as String?,
            campus: row['campus'] as String?,
            note: row['note'] as String?,
          ),
    ];
  }

  Future<List<SchoolEvent>> _events() async {
    final rows = await _rows(
      _db.from('events').select('slug, title, starts_on, location, published').eq('published', true).order('starts_on'),
    );
    return [
      for (final row in rows)
        if (row['starts_on'] != null)
          SchoolEvent(
            slug: (row['slug'] as String?) ?? row['title'].toString(),
            title: (row['title'] as String?) ?? 'Event',
            startsOn: row['starts_on'].toString(),
            location: row['location'] as String?,
          ),
    ];
  }

  Future<List<ReportCard>> _reports(String studentId) async {
    var rows = await _rows(
      _db
          .from('report_cards')
          .select(
            'id, class_code, stream, published_at, overall_score, overall_position, overall_aggregate, overall_grade, class_teacher_name, class_teacher_comment, head_comment, conduct, days_present, days_opened, fee_terms(label)',
          )
          .eq('student_id', studentId)
          .not('published_at', 'is', null)
          .order('published_at', ascending: false),
    );
    if (rows.isEmpty) {
      rows = await _rows(
        _db
            .from('report_cards')
            .select('id, class_code, stream, published_at, fee_terms(label)')
            .eq('student_id', studentId)
            .not('published_at', 'is', null)
            .order('published_at', ascending: false),
      );
    }
    if (rows.isEmpty) return [];
    final ids = rows.map((row) => row['id'].toString()).toList();
    final lines = await _rows(
      _db
          .from('report_lines')
          .select('report_card_id, subject_id, subject_name, score, max_score, grade, points, position, teacher_comment')
          .inFilter('report_card_id', ids),
    );
    final parts = await _rows(
      _db
          .from('report_line_parts')
          .select('report_card_id, subject_id, label, share, score, sort_order')
          .inFilter('report_card_id', ids),
    );
    return [
      for (final row in rows)
        ReportCard(
          id: row['id'].toString(),
          term: _termLabel(row['fee_terms']) ?? 'Term',
          classLabel: classLabelOf(row['class_code'] as String?, row['stream'] as String?),
          publishedAt: row['published_at'] as String?,
          overallScore: _double(row['overall_score']),
          overallPosition: _int(row['overall_position']),
          overallAggregate: _int(row['overall_aggregate']),
          overallGrade: row['overall_grade']?.toString(),
          classTeacherName: row['class_teacher_name'] as String?,
          classTeacherComment: row['class_teacher_comment'] as String?,
          headComment: row['head_comment'] as String?,
          conduct: row['conduct'] as String?,
          daysPresent: _int(row['days_present']),
          daysOpened: _int(row['days_opened']),
          lines: [
            for (final line in lines.where((item) => item['report_card_id'].toString() == row['id'].toString()))
              ReportLine(
                subjectName: (line['subject_name'] as String?) ?? 'Subject',
                score: _double(line['score']),
                maxScore: _double(line['max_score']),
                grade: line['grade'] as String?,
                points: _int(line['points']),
                position: _int(line['position']),
                comment: line['teacher_comment'] as String?,
                parts: [
                  for (final part in parts.where(
                    (item) =>
                        item['report_card_id'].toString() == row['id'].toString() &&
                        item['subject_id'].toString() == line['subject_id'].toString(),
                  ))
                    ReportPart(
                      label: (part['label'] as String?) ?? 'Set',
                      share: _double(part['share']) ?? 0,
                      score: _double(part['score']),
                      sortOrder: _int(part['sort_order']) ?? 0,
                    ),
                ]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
              ),
          ]..sort((a, b) => a.subjectName.compareTo(b.subjectName)),
        ),
    ];
  }

  Future<(List<Conversation>, int)> _conversations(Pupil pupil, List<Classmate> classmates) async {
    try {
      final dmsFuture = _rows(
        _db
            .from('student_conversations')
            .select('id, kind, student_low_id, student_high_id, class_code, stream')
            .eq('kind', 'dm')
            .or('student_low_id.eq.${pupil.id},student_high_id.eq.${pupil.id}'),
      );

      final groupIdFuture = () async {
        try {
          final ensured = await _db.rpc('ensure_my_class_group');
          return ensured?.toString();
        } catch (_) {
          return null;
        }
      }();

      final classGroupFuture = (pupil.classCode ?? '').isEmpty
          ? Future.value(<Map<String, dynamic>>[])
          : _rows(
              _db
                  .from('student_conversations')
                  .select('id, kind, student_low_id, student_high_id, class_code, stream')
                  .eq('kind', 'class_group')
                  .eq('class_code', pupil.classCode!)
                  .eq('stream', pupil.stream ?? ''),
            );

      final lists = await Future.wait([dmsFuture, groupIdFuture, classGroupFuture]);
      final dms = lists[0] as List<Map<String, dynamic>>;
      final groupId = lists[1] as String?;
      var groups = lists[2] as List<Map<String, dynamic>>;
      if (groupId != null && groups.every((row) => row['id']?.toString() != groupId)) {
        groups = await _rows(
          _db
              .from('student_conversations')
              .select('id, kind, student_low_id, student_high_id, class_code, stream')
              .eq('id', groupId),
        );
      }
      final convs = [...groups, ...dms];
      if (convs.isEmpty) return (<Conversation>[], 0);
      final ids = convs.map((row) => row['id'].toString()).toList();
      final since = DateTime.now().toUtc().subtract(const Duration(days: 7)).toIso8601String();
      final settled = await Future.wait<Object?>([
        _rows(
          _db
              .from('student_messages')
              .select('conversation_id, body, created_at, sender_student_id')
              .inFilter('conversation_id', ids)
              .eq('hidden', false)
              .order('created_at', ascending: false)
              .limit(400),
        ),
        _db
            .from('student_messages')
            .count()
            .inFilter('conversation_id', ids)
            .neq('sender_student_id', pupil.id)
            .eq('hidden', false)
            .gte('created_at', since),
      ]);
      final recent = settled[0] as List<Map<String, dynamic>>;
      final unread = settled[1] as int;
      final last = <String, Map<String, dynamic>>{};
      for (final row in recent) {
        last.putIfAbsent(row['conversation_id'].toString(), () => row);
      }
      final peers = {for (final mate in classmates) mate.id: mate};
      final conversations = <Conversation>[
        for (final row in convs)
          if ((row['kind'] as String?) == 'class_group')
            Conversation(
              id: row['id'].toString(),
              kind: 'class_group',
              title: '${pupil.classLabel} group',
              lastBody: last[row['id'].toString()]?['body'] as String?,
              lastAt: DateTime.tryParse(last[row['id'].toString()]?['created_at']?.toString() ?? ''),
              memberCount: classmates.length + 1,
            )
          else
            () {
              final low = row['student_low_id']?.toString();
              final high = row['student_high_id']?.toString();
              final peerId = low == pupil.id ? high : low;
              final peer = peerId == null ? null : peers[peerId];
              return Conversation(
                id: row['id'].toString(),
                kind: 'dm',
                title: peer == null ? 'Classmate' : firstNameOf(peer.displayName),
                peerId: peerId,
                house: peer?.house,
                lastBody: last[row['id'].toString()]?['body'] as String?,
                lastAt: DateTime.tryParse(last[row['id'].toString()]?['created_at']?.toString() ?? ''),
              );
            }(),
      ]..sort((a, b) {
          if (a.isGroup && !b.isGroup) return -1;
          if (b.isGroup && !a.isGroup) return 1;
          return (b.lastAt ?? DateTime.fromMillisecondsSinceEpoch(0)).compareTo(a.lastAt ?? DateTime.fromMillisecondsSinceEpoch(0));
        });

      return (conversations, unread);
    } catch (_) {
      return (<Conversation>[], 0);
    }
  }

  Future<List<ClassResource>> _resources(Pupil pupil, Map<String, String> subjectNames) async {
    if ((pupil.classCode ?? '').isEmpty) return [];
    try {
      final rows = await _rows(
        _db
            .from('class_resources')
            .select(
              'id, kind, title, body, link_url, file_path, file_name, file_mime, file_size, subject_id, teacher_name, published_at',
            )
            .eq('class_code', pupil.classCode!)
            .eq('stream', pupil.stream ?? '')
            .not('published_at', 'is', null)
            .order('published_at', ascending: false)
            .limit(80),
      );
      final items = <ClassResource>[];
      for (final row in rows) {
        final published = DateTime.tryParse(row['published_at']?.toString() ?? '');
        if (row['id'] == null || published == null) continue;
        final subjectId = row['subject_id']?.toString();
        final path = (row['file_path'] as String?)?.trim();
        String? fileUrl;
        if (path != null && path.isNotEmpty) {
          try {
            fileUrl = await _db.storage.from('class-resources').createSignedUrl(path, 60 * 60 * 6);
          } catch (_) {}
        }
        items.add(
          ClassResource(
            id: row['id'].toString(),
            kind: (row['kind'] as String?) ?? 'note',
            title: (row['title'] as String?) ?? 'Resource',
            body: row['body'] as String?,
            linkUrl: row['link_url'] as String?,
            filePath: path,
            fileName: row['file_name'] as String?,
            fileMime: row['file_mime'] as String?,
            fileSize: row['file_size'] is int ? row['file_size'] as int : int.tryParse('${row['file_size'] ?? ''}'),
            fileUrl: fileUrl,
            subjectName: subjectId == null ? null : subjectNames[subjectId],
            teacherName: row['teacher_name'] as String?,
            publishedAt: published,
          ),
        );
      }
      return items;
    } catch (_) {
      return [];
    }
  }

  bool _campusMatches(String? dateCampus, String? pupilCampus) {
    if (dateCampus == null || dateCampus.trim().isEmpty) return true;
    if (pupilCampus == null || pupilCampus.trim().isEmpty) return true;
    return dateCampus == pupilCampus || RegExp(r'all', caseSensitive: false).hasMatch(dateCampus);
  }

  bool _flag(dynamic value) {
    if (value is bool) return value;
    if (value is String) return value.toLowerCase() == 'true';
    return false;
  }

  String? _textOrNull(dynamic value) {
    if (value == null) return null;
    final text = value.toString().trim();
    return text.isEmpty ? null : text;
  }

  /// Signed storage URLs (preferred) plus site-proxy fallbacks.
  /// Requires supabase/0038 + 0039 so pupils can read classmate photos.
  Future<Map<String, String>> _resolvePhotoUrls(Map<String, String?> pathsById) async {
    PupilPhotoCache.clear();
    final out = <String, String>{};

    // Proxy for every pupil id (server resolves photo_path). Works once kja.ug serves access_token.
    for (final entry in pathsById.entries) {
      final proxy = PupilPhotoUrl.siteProxy(studentId: entry.key, photoPath: entry.value);
      if (proxy != null) out[entry.key] = proxy;
    }

    final entries = pathsById.entries
        .where((entry) => (entry.value ?? '').trim().isNotEmpty)
        .map((entry) => MapEntry(entry.key, entry.value!.trim()))
        .toList();
    if (entries.isEmpty) return out;

    try {
      final results = await _db.storage
          .from('student-photos')
          .createSignedUrlsResult(entries.map((entry) => entry.value).toList(), 60 * 60 * 12)
          .timeout(const Duration(seconds: 6));
      final byPath = <String, String>{};
      for (final result in results) {
        if (result is SignedUrlSuccess && result.signedUrl.isNotEmpty) {
          final key = result.path.trim();
          if (key.isNotEmpty) byPath[key] = result.signedUrl;
        }
      }
      var signedCount = 0;
      for (final entry in entries) {
        final signed = byPath[entry.value] ?? byPath[_photoPathKey(entry.value)];
        if (signed == null || signed.isEmpty) continue;
        out[entry.key] = signed;
        signedCount++;
      }
      assert(() {
        debugPrint('KJA photos signed $signedCount/${entries.length} (proxy fallbacks for the rest)');
        return true;
      }());
    } catch (error) {
      assert(() {
        debugPrint('KJA photo signing failed (using site proxy): $error');
        return true;
      }());
    }

    return out;
  }

  /// Teacher portraits from the teacher-photos bucket (0046) with site-proxy fallback.
  Future<Map<String, String>> _resolveTeacherPhotoUrls(Map<String, String?> pathsById) async {
    final out = <String, String>{};
    if (pathsById.isEmpty) return out;

    for (final entry in pathsById.entries) {
      final proxy = PupilPhotoUrl.teacherProxy(staffId: entry.key, photoPath: entry.value);
      if (proxy != null) out[entry.key] = proxy;
    }

    final entries = pathsById.entries
        .where((entry) => (entry.value ?? '').trim().isNotEmpty)
        .map((entry) => MapEntry(entry.key, entry.value!.trim()))
        .toList();
    if (entries.isEmpty) return out;

    try {
      final results = await _db.storage
          .from('teacher-photos')
          .createSignedUrlsResult(entries.map((entry) => entry.value).toList(), 60 * 60 * 12)
          .timeout(const Duration(seconds: 6));
      final byPath = <String, String>{};
      for (final result in results) {
        if (result is SignedUrlSuccess && result.signedUrl.isNotEmpty) {
          final key = result.path.trim();
          if (key.isNotEmpty) byPath[key] = result.signedUrl;
        }
      }
      var signedCount = 0;
      for (final entry in entries) {
        final signed = byPath[entry.value] ?? byPath[_photoPathKey(entry.value)];
        if (signed == null || signed.isEmpty) continue;
        out[entry.key] = signed;
        signedCount++;
      }
      assert(() {
        debugPrint('KJA teacher photos signed $signedCount/${entries.length}');
        return true;
      }());
    } catch (error) {
      assert(() {
        debugPrint('KJA teacher photo signing failed (using site proxy): $error');
        return true;
      }());
    }

    return out;
  }

  Future<void> _hydratePhotoCache(Map<String, String?> pathsById) async {
    final entries = pathsById.entries
        .where((entry) => (entry.value ?? '').trim().isNotEmpty)
        .map((entry) => MapEntry(entry.key, entry.value!.trim()))
        .toList();
    if (entries.isEmpty) return;

    const chunk = 6;
    for (var i = 0; i < entries.length; i += chunk) {
      final slice = entries.sublist(i, i + chunk > entries.length ? entries.length : i + chunk);
      await Future.wait(slice.map((entry) async {
        final bytes = await _downloadStudentPhoto(entry.key, entry.value);
        if (bytes != null && bytes.isNotEmpty) PupilPhotoCache.put(entry.key, bytes);
      }));
    }
  }

  Future<void> _hydrateTeacherPhotoCache(Map<String, String?> pathsById) async {
    final entries = pathsById.entries
        .where((entry) => (entry.value ?? '').trim().isNotEmpty)
        .map((entry) => MapEntry(entry.key, entry.value!.trim()))
        .toList();
    if (entries.isEmpty) return;

    const chunk = 6;
    for (var i = 0; i < entries.length; i += chunk) {
      final slice = entries.sublist(i, i + chunk > entries.length ? entries.length : i + chunk);
      await Future.wait(slice.map((entry) async {
        try {
          final bytes = await _db.storage.from('teacher-photos').download(entry.value).timeout(const Duration(seconds: 5));
          if (bytes.isNotEmpty) PupilPhotoCache.put(entry.key, bytes);
        } catch (error) {
          PupilPhotoUrl.debugFail(entry.key, error);
        }
      }));
    }
  }

  Future<Uint8List?> _downloadStudentPhoto(String studentId, String path) async {
    try {
      final bytes = await _db.storage.from('student-photos').download(path).timeout(const Duration(seconds: 5));
      if (bytes.isNotEmpty) return bytes;
    } catch (error) {
      PupilPhotoUrl.debugFail(studentId, error);
    }

    // Legacy / mismatched path: try files under the student id folder.
    try {
      final listed = await _db.storage.from('student-photos').list(path: studentId).timeout(const Duration(seconds: 4));
      for (final obj in listed) {
        final name = obj.name.trim();
        if (name.isEmpty || name.endsWith('/')) continue;
        final candidate = '$studentId/$name';
        try {
          final bytes = await _db.storage.from('student-photos').download(candidate).timeout(const Duration(seconds: 5));
          if (bytes.isNotEmpty) return bytes;
        } catch (_) {}
      }
    } catch (error) {
      PupilPhotoUrl.debugFail(studentId, error);
    }
    return null;
  }

  String _photoPathKey(String path) {
    final trimmed = path.trim();
    if (trimmed.startsWith('/')) return trimmed.substring(1);
    return trimmed;
  }

  Pupil _pupil(Map<String, dynamic> row) {
    return Pupil(
      id: row['id'].toString(),
      fullName: (row['full_name'] as String?) ?? 'Student',
      preferredName: row['preferred_name'] as String?,
      classCode: row['class_code'] as String?,
      stream: row['stream'] as String?,
      campus: row['campus'] as String?,
      studentNumber: (row['student_number'] as String?) ?? '',
      photoPath: row['photo_path'] as String?,
      status: (row['status'] as String?) ?? 'active',
      house: row['house'] as String?,
      sex: row['sex'] as String?,
    );
  }

  Classmate _classmate(Map<String, dynamic> row) {
    return Classmate(
      id: row['id'].toString(),
      fullName: (row['full_name'] as String?) ?? 'Classmate',
      preferredName: row['preferred_name'] as String?,
      house: row['house'] as String?,
      profileId: row['profile_id'] as String?,
      photoPath: row['photo_path'] as String?,
    );
  }

  ChatMessage? _message(Map<String, dynamic> row) {
    final created = DateTime.tryParse(row['created_at']?.toString() ?? '');
    if (row['id'] == null || created == null) return null;
    if (row['hidden'] == true) return null;
    return ChatMessage(
      id: row['id'].toString(),
      conversationId: row['conversation_id'].toString(),
      senderStudentId: row['sender_student_id'].toString(),
      body: (row['body'] as String?) ?? '',
      flagged: row['flagged'] == true,
      createdAt: created,
    );
  }

  String? _termLabel(dynamic value) {
    if (value is Map) return value['label'] as String?;
    if (value is List && value.isNotEmpty && value.first is Map) return value.first['label'] as String?;
    return null;
  }

  int? _int(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    if (value is String) return int.tryParse(value);
    return null;
  }

  double? _double(dynamic value) {
    if (value is double) return value;
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  Future<List<Map<String, dynamic>>> _rows(dynamic query) async {
    try {
      final data = await query;
      if (data is! List) return [];
      return data.map((row) => Map<String, dynamic>.from(row as Map)).toList();
    } catch (error) {
      assert(() {
        debugPrint('KJA query failed: $error');
        return true;
      }());
      return [];
    }
  }

  Future<Map<String, dynamic>?> _maybeMap(dynamic query) async {
    try {
      final data = await query;
      if (data is Map) return Map<String, dynamic>.from(data);
      return null;
    } catch (_) {
      return null;
    }
  }
}
