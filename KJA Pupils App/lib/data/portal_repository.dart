import 'package:supabase_flutter/supabase_flutter.dart';

import '../chat_filter.dart';
import '../format.dart';
import '../models.dart';

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
    try {
      final row = await _db.from('profiles').select('id, role, full_name, email').eq('id', user.id).maybeSingle();
      profile = row ?? {'id': user.id, 'role': 'student', 'full_name': user.userMetadata?['full_name'], 'email': user.email};
    } catch (_) {
      throw PortalException('Could not reach the school. Check your connection and try again.');
    }

    final role = profile['role'] as String?;
    if (role != null && role.isNotEmpty && role != 'student') {
      throw PortalException('This account is not a pupil login. Use the email the office created for you.');
    }

    final pupil = await _loadPupil(user.id);
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

    final term = await _maybeMap(
      _db.from('fee_terms').select('id, label').eq('is_current', true).maybeSingle(),
    );
    final termId = term?['id'] as String?;
    final termLabel = term?['label'] as String?;

    final subjectRows = await _rows(_db.from('subjects').select('id, name'));
    final subjectNames = <String, String>{
      for (final row in subjectRows)
        if (row['id'] != null) row['id'].toString(): (row['name'] as String?) ?? 'Subject',
    };

    final classmatesRaw = await _classmates();
    final homework = await _homework(pupil, termId, subjectNames);
    final notices = await _notices(user.id);
    final timetable = await _timetable(pupil, termId, subjectNames);
    final attendance = await _attendance(pupil.id, termId);
    final clubs = await _clubs(pupil.id, termId);
    final staff = await _teachers(pupil, termId, subjectNames);
    final dates = await _academicDates(pupil, termId);
    final events = await _events();
    final reports = await _reports(pupil.id);
    final photoPaths = <String, String?>{
      pupil.id: pupil.photoPath,
      for (final mate in classmatesRaw) mate.id: mate.photoPath,
    };
    final photoUrls = await _photoUrls(photoPaths);
    final classmates = [
      for (final mate in classmatesRaw) mate.withPhotoUrl(photoUrls[mate.id]),
    ];
    final inbox = await _conversations(pupil, classmates);
    final weekday = kampalaWeekday();
    final lessonsToday = weekday >= 1 && weekday <= 5
        ? timetable.where((lesson) => lesson.weekday == weekday).toList()
        : <Lesson>[];

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
      classTeacher: staff.$1,
      homework: homework,
      notices: notices,
      lessonsToday: lessonsToday,
      timetable: timetable,
      attendance: attendance,
      clubs: clubs,
      teachers: staff.$2,
      classmates: classmates,
      academicDates: dates,
      events: events,
      reports: reports,
      conversations: inbox.$1,
      unreadMessages: inbox.$2,
    );
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

  Future<List<ClubMembership>> _clubs(String studentId, String? termId) async {
    try {
      final consents = await _rows(
        _db.from('club_consents').select('id, club_id, consented_at').eq('student_id', studentId).isFilter('withdrawn_at', null),
      );
      if (consents.isEmpty) return [];
      final clubs = await _rows(_db.from('clubs').select('id, title, campus, meeting, description').eq('published', true));
      final payments = termId == null
          ? <Map<String, dynamic>>[]
          : await _rows(
              _db
                  .from('club_payments')
                  .select('club_id')
                  .eq('student_id', studentId)
                  .eq('term_id', termId)
                  .isFilter('voided_at', null),
            );
      final byId = {for (final club in clubs) club['id'].toString(): club};
      final paid = payments.map((row) => row['club_id'].toString()).toSet();
      return [
        for (final consent in consents)
          if (byId[consent['club_id'].toString()] != null)
            ClubMembership(
              id: consent['id'].toString(),
              title: (byId[consent['club_id'].toString()]!['title'] as String?) ?? 'Club',
              campus: byId[consent['club_id'].toString()]!['campus'] as String?,
              meeting: byId[consent['club_id'].toString()]!['meeting'] as String?,
              description: byId[consent['club_id'].toString()]!['description'] as String?,
              paid: paid.contains(consent['club_id'].toString()),
            ),
      ];
    } catch (_) {
      return [];
    }
  }

  Future<(Teacher?, List<Teacher>)> _teachers(Pupil pupil, String? termId, Map<String, String> subjectNames) async {
    if (termId == null || (pupil.classCode ?? '').isEmpty) return (null, <Teacher>[]);
    try {
      final classRows = await _rows(
        _db
            .from('class_teachers')
            .select('staff_id')
            .eq('term_id', termId)
            .eq('class_code', pupil.classCode!)
            .eq('stream', pupil.stream ?? ''),
      );
      final subjectRows = await _rows(
        _db
            .from('subject_teachers')
            .select('staff_id, subject_id')
            .eq('term_id', termId)
            .eq('class_code', pupil.classCode!)
            .eq('stream', pupil.stream ?? ''),
      );
      final ids = {
        ...classRows.map((row) => row['staff_id'].toString()),
        ...subjectRows.map((row) => row['staff_id'].toString()),
      }.where((id) => id.isNotEmpty).toList();
      if (ids.isEmpty) return (null, <Teacher>[]);
      final staff = await _rows(
        _db.from('teaching_staff').select('id, full_name, title').inFilter('id', ids).eq('active', true),
      );
      final byId = {for (final row in staff) row['id'].toString(): row};
      Teacher? classTeacher;
      final classStaff = classRows.isEmpty ? null : byId[classRows.first['staff_id'].toString()];
      if (classStaff != null) {
        classTeacher = Teacher(
          id: classStaff['id'].toString(),
          fullName: (classStaff['full_name'] as String?) ?? 'Teacher',
          title: classStaff['title'] as String?,
          role: 'class',
        );
      }
      final teachers = <Teacher>[
        for (final row in subjectRows)
          if (byId[row['staff_id'].toString()] != null)
            Teacher(
              id: '${row['staff_id']}:${row['subject_id']}',
              fullName: (byId[row['staff_id'].toString()]!['full_name'] as String?) ?? 'Teacher',
              title: byId[row['staff_id'].toString()]!['title'] as String?,
              subjectName: subjectNames[row['subject_id']?.toString()] ?? 'Subject',
              role: 'subject',
            ),
      ];
      return (classTeacher, teachers);
    } catch (_) {
      return (null, <Teacher>[]);
    }
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
      String? groupId;
      try {
        final ensured = await _db.rpc('ensure_my_class_group');
        if (ensured != null) groupId = ensured.toString();
      } catch (_) {}

      final dms = await _rows(
        _db
            .from('student_conversations')
            .select('id, kind, student_low_id, student_high_id, class_code, stream')
            .eq('kind', 'dm')
            .or('student_low_id.eq.${pupil.id},student_high_id.eq.${pupil.id}'),
      );
      final groups = groupId == null
          ? await _rows(
              (pupil.classCode ?? '').isEmpty
                  ? _db.from('student_conversations').select('id').limit(0)
                  : _db
                      .from('student_conversations')
                      .select('id, kind, student_low_id, student_high_id, class_code, stream')
                      .eq('kind', 'class_group')
                      .eq('class_code', pupil.classCode!)
                      .eq('stream', pupil.stream ?? ''),
            )
          : await _rows(
              _db
                  .from('student_conversations')
                  .select('id, kind, student_low_id, student_high_id, class_code, stream')
                  .eq('id', groupId),
            );
      final convs = [...groups, ...dms];
      if (convs.isEmpty) return (<Conversation>[], 0);
      final ids = convs.map((row) => row['id'].toString()).toList();
      final recent = await _rows(
        _db
            .from('student_messages')
            .select('conversation_id, body, created_at, sender_student_id')
            .inFilter('conversation_id', ids)
            .eq('hidden', false)
            .order('created_at', ascending: false)
            .limit(400),
      );
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

      final since = DateTime.now().toUtc().subtract(const Duration(days: 7)).toIso8601String();
      final unread = await _db
          .from('student_messages')
          .count()
          .inFilter('conversation_id', ids)
          .neq('sender_student_id', pupil.id)
          .eq('hidden', false)
          .gte('created_at', since);
      return (conversations, unread);
    } catch (_) {
      return (<Conversation>[], 0);
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

  Future<Map<String, String>> _photoUrls(Map<String, String?> pathsById) async {
    final entries = pathsById.entries
        .where((entry) => (entry.value ?? '').trim().isNotEmpty)
        .map((entry) => MapEntry(entry.key, entry.value!.trim()))
        .toList();
    if (entries.isEmpty) return {};

    final out = <String, String>{};
    try {
      final signed = await _db.storage.from('student-photos').createSignedUrlsResult(
            entries.map((entry) => entry.value).toList(),
            60 * 60 * 12,
          );
      for (var i = 0; i < entries.length && i < signed.length; i++) {
        final result = signed[i];
        if (result is SignedUrlSuccess && result.signedUrl.isNotEmpty) {
          out[entries[i].key] = result.signedUrl;
        }
      }
      if (out.isNotEmpty) return out;
    } catch (_) {
      /* Fall through to one-by-one signing. */
    }

    for (final entry in entries) {
      try {
        final url = await _db.storage.from('student-photos').createSignedUrl(entry.value, 60 * 60 * 12);
        if (url.isNotEmpty) out[entry.key] = url;
      } catch (_) {
        /* Skip photos the pupil cannot read yet. */
      }
    }
    return out;
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
    } catch (_) {
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
