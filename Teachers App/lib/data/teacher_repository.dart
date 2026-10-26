import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../format.dart';
import '../models.dart';

class TeacherRepository {
  SupabaseClient get _db => Supabase.instance.client;

  Future<TeacherSnapshot> load() async {
    final user = _db.auth.currentUser;
    if (user == null) {
      throw TeacherException('Your session has expired. Sign in again.');
    }

    Map<String, dynamic>? staff;
    try {
      final staffRows = await _db
          .from('teaching_staff')
          .select(
            'id, full_name, title, campus, email, initials, photo_path, active, profile_id',
          )
          .eq('profile_id', user.id)
          .eq('active', true)
          .limit(1);
      staff = _firstMap(staffRows);
    } catch (_) {
      final fallback = await _db
          .from('teaching_staff')
          .select(
            'id, full_name, title, campus, email, photo_path, active, profile_id',
          )
          .eq('profile_id', user.id)
          .eq('active', true)
          .limit(1);
      staff = _firstMap(fallback);
    }
    if (staff == null) {
      return TeacherSnapshot.unavailable(
        'This login is not linked to a teacher. Ask the academics office to open your desk.',
      );
    }

    final profileRows = await _db
        .from('profiles')
        .select('role, full_name, email')
        .eq('id', user.id)
        .limit(1);
    final profile = _firstMap(profileRows);
    final role = asText(profile?['role']);
    if (role != 'staff') {
      return TeacherSnapshot.unavailable(
        'Your teacher login is not fully linked. Ask the academics office to open your desk once on the website.',
      );
    }

    final meta = user.userMetadata ?? const <String, dynamic>{};
    final mustReset = meta['must_reset_password'] == true;
    final staffId = asText(staff['id']);
    final name = asText(
      staff['full_name'],
      asText(profile?['full_name'], 'Teacher'),
    );
    String? photoUrl;
    final photoPath = _nullable(staff['photo_path']);
    if (photoPath != null) {
      try {
        photoUrl = await _db.storage
            .from('teacher-photos')
            .createSignedUrl(photoPath, 60 * 60);
      } catch (_) {}
    }

    final termRows = await _db
        .from('fee_terms')
        .select('id, label, starts_on, ends_on, is_current')
        .eq('is_current', true)
        .limit(1);
    final termRow = _firstMap(termRows);
    final term = termRow == null
        ? null
        : TermInfo(
            id: asText(termRow['id']),
            label: asText(termRow['label'], 'This term'),
            startsOn: _nullable(termRow['starts_on']),
            endsOn: _nullable(termRow['ends_on']),
          );

    final classes = <ClassPost>[];
    final subjects = <SubjectPost>[];
    if (term != null) {
      final classRows = await _db
          .from('class_teachers')
          .select('class_code, stream')
          .eq('term_id', term.id)
          .eq('staff_id', staffId);
      for (final row in _maps(classRows)) {
        final code = asText(row['class_code']);
        final stream = asText(row['stream']);
        classes.add(
          ClassPost(
            classCode: code,
            stream: stream,
            label: classLabelOf(code, stream),
          ),
        );
      }
      classes.sort((a, b) => a.label.compareTo(b.label));

      final subjectRows = await _db
          .from('subject_teachers')
          .select('class_code, stream, subject_id, subjects(name)')
          .eq('term_id', term.id)
          .eq('staff_id', staffId);
      for (final row in _maps(subjectRows)) {
        final code = asText(row['class_code']);
        final stream = asText(row['stream']);
        final subjectId = asText(row['subject_id']);
        final subjectName = embedName(row['subjects']);
        subjects.add(
          SubjectPost(
            classCode: code,
            stream: stream,
            subjectId: subjectId,
            subjectName: subjectName,
            label: '${classLabelOf(code, stream)} · $subjectName',
          ),
        );
      }
      subjects.sort((a, b) => a.label.compareTo(b.label));
    }

    final allowedPosts = {for (final post in subjects) post.key};
    final pupilRows = await _db
        .from('students')
        .select(
          'id, full_name, student_number, class_code, stream, profile_id, photo_path, status',
        )
        .eq('status', 'active')
        .order('full_name');
    final pupils = <Pupil>[
      for (final row in _maps(pupilRows))
        Pupil(
          id: asText(row['id']),
          fullName: asText(row['full_name'], 'Pupil'),
          classCode: asText(row['class_code']),
          stream: asText(row['stream']),
          studentNumber: _nullable(row['student_number']),
          profileId: _nullable(row['profile_id']),
          photoPath: _nullable(row['photo_path']),
        ),
    ];
    final photoUrls = await _signedStudentPhotos(pupils);
    if (photoUrls.isNotEmpty) {
      for (var i = 0; i < pupils.length; i++) {
        final url = photoUrls[pupils[i].id];
        if (url == null) continue;
        final pupil = pupils[i];
        pupils[i] = Pupil(
          id: pupil.id,
          fullName: pupil.fullName,
          classCode: pupil.classCode,
          stream: pupil.stream,
          studentNumber: pupil.studentNumber,
          profileId: pupil.profileId,
          photoPath: pupil.photoPath,
          photoUrl: url,
        );
      }
    }
    final pupilNames = {for (final pupil in pupils) pupil.id: pupil.fullName};

    final papers = <Paper>[];
    final scores = <Score>[];
    final homework = <HomeworkItem>[];
    final resources = <ResourceItem>[];
    final marks = <AttendanceMark>[];
    final closures = <RegisterClosure>[];
    final dates = <SchoolDate>[];
    final notices = <ClassNotice>[];
    final threads = <ChatThread>[];
    final bands = <GradeBand>[];
    var flaggedMessages = 0;
    final today = kampalaToday();

    if (term != null) {
      final paperRows = await _db
          .from('assessments')
          .select(
            'id, class_code, stream, subject_id, name, kind, max_score, status, held_on, subjects(name)',
          )
          .eq('term_id', term.id);
      for (final row in _maps(paperRows)) {
        final code = asText(row['class_code']);
        final stream = asText(row['stream']);
        final subjectId = asText(row['subject_id']);
        if (!allowedPosts.contains(postKey(code, stream, subjectId))) continue;
        papers.add(
          Paper(
            id: asText(row['id']),
            name: asText(row['name'], 'Markbook'),
            classCode: code,
            stream: stream,
            subjectId: subjectId,
            subjectName: embedName(row['subjects']),
            kind: asText(row['kind'], 'test'),
            maxScore: asDouble(row['max_score']) ?? 100,
            status: asText(row['status'], 'open'),
            heldOn: _nullable(row['held_on']),
          ),
        );
      }
      papers.sort((a, b) {
        final statusOrder = (a.open ? 0 : 1).compareTo(b.open ? 0 : 1);
        if (statusOrder != 0) return statusOrder;
        return (b.heldOn ?? '').compareTo(a.heldOn ?? '');
      });

      if (papers.isNotEmpty) {
        final scoreRows = await _db
            .from('assessment_scores')
            .select('assessment_id, student_id, score, missed');
        final paperIds = {for (final paper in papers) paper.id};
        for (final row in _maps(scoreRows)) {
          final assessmentId = asText(row['assessment_id']);
          if (!paperIds.contains(assessmentId)) continue;
          scores.add(
            Score(
              assessmentId: assessmentId,
              studentId: asText(row['student_id']),
              score: asDouble(row['score']),
              missed: row['missed'] == true,
            ),
          );
        }
      }

      final subjectNames = {
        for (final post in subjects) post.subjectId: post.subjectName,
      };
      final homeworkRows = await _db
          .from('homework_assignments')
          .select(
            'id, class_code, stream, subject_id, title, instructions, due_on, published_at',
          )
          .eq('term_id', term.id)
          .order('due_on', ascending: false);
      final homeworkIds = <String>[];
      for (final row in _maps(homeworkRows)) {
        final code = asText(row['class_code']);
        final stream = asText(row['stream']);
        final subjectId = asText(row['subject_id']);
        if (!allowedPosts.contains(postKey(code, stream, subjectId))) continue;
        final id = asText(row['id']);
        homeworkIds.add(id);
        homework.add(
          HomeworkItem(
            id: id,
            classCode: code,
            stream: stream,
            subjectId: subjectId,
            subjectName: subjectNames[subjectId] ?? 'Subject',
            title: asText(row['title'], 'Homework'),
            instructions: _nullable(row['instructions']),
            dueOn: asText(row['due_on']).length >= 10
                ? asText(row['due_on']).substring(0, 10)
                : asText(row['due_on']),
            published: row['published_at'] != null,
          ),
        );
      }

      if (homeworkIds.isNotEmpty) {
        try {
          final doneRows = await _db
              .from('homework_completions')
              .select('assignment_id');
          final counts = <String, int>{};
          for (final row in _maps(doneRows)) {
            final id = asText(row['assignment_id']);
            if (!homeworkIds.contains(id)) continue;
            counts[id] = (counts[id] ?? 0) + 1;
          }
          if (counts.isNotEmpty) {
            for (var i = 0; i < homework.length; i++) {
              final count = counts[homework[i].id];
              if (count == null) continue;
              final item = homework[i];
              homework[i] = HomeworkItem(
                id: item.id,
                classCode: item.classCode,
                stream: item.stream,
                subjectId: item.subjectId,
                subjectName: item.subjectName,
                title: item.title,
                instructions: item.instructions,
                dueOn: item.dueOn,
                published: item.published,
                doneCount: count,
              );
            }
          }
        } catch (_) {}
      }

      final resourceRows = await _db
          .from('class_resources')
          .select(
            'id, class_code, stream, subject_id, kind, title, body, link_url, file_path, file_name, published_at, teacher_staff_id',
          )
          .order('created_at', ascending: false)
          .limit(200);
      for (final row in _maps(resourceRows)) {
        final code = asText(row['class_code']);
        final stream = asText(row['stream']);
        final subjectId = asText(row['subject_id']);
        final mine = asText(row['teacher_staff_id']) == staffId;
        if (!mine && !allowedPosts.contains(postKey(code, stream, subjectId))) {
          continue;
        }
        resources.add(
          ResourceItem(
            id: asText(row['id']),
            classCode: code,
            stream: stream,
            subjectId: subjectId,
            subjectName: subjectNames[subjectId] ?? 'Subject',
            kind: asText(row['kind'], 'note'),
            title: asText(row['title'], 'Resource'),
            body: _nullable(row['body']),
            linkUrl: _nullable(row['link_url']),
            filePath: _nullable(row['file_path']),
            fileName: _nullable(row['file_name']),
            published: row['published_at'] != null,
          ),
        );
      }

      final markRows = await _db
          .from('attendance')
          .select('student_id, status, note')
          .eq('attended_on', today);
      for (final row in _maps(markRows)) {
        marks.add(
          AttendanceMark(
            studentId: asText(row['student_id']),
            status: asText(row['status'], 'present'),
            note: _nullable(row['note']),
          ),
        );
      }
      final closureRows = await _db
          .from('attendance_closures')
          .select('class_code, stream')
          .eq('attended_on', today);
      for (final row in _maps(closureRows)) {
        closures.add(
          RegisterClosure(
            classCode: asText(row['class_code']),
            stream: asText(row['stream']),
          ),
        );
      }

      final dateRows = await _db
          .from('academic_dates')
          .select(
            'id, title, kind, starts_on, ends_on, note, class_code, stream',
          )
          .eq('term_id', term.id)
          .order('starts_on');
      for (final row in _maps(dateRows)) {
        dates.add(
          SchoolDate(
            id: asText(row['id']),
            title: asText(row['title'], 'Date'),
            kind: asText(row['kind'], 'deadline'),
            startsOn: asText(row['starts_on']).length >= 10
                ? asText(row['starts_on']).substring(0, 10)
                : asText(row['starts_on']),
            endsOn: _dateOrNull(row['ends_on']),
            note: _nullable(row['note']),
            classCode: _nullable(row['class_code']),
            stream: _nullable(row['stream']),
          ),
        );
      }

      if (classes.isNotEmpty) {
        final noticeRows = await _db
            .from('class_notices')
            .select('id, class_code, stream, title, body, created_at')
            .eq('term_id', term.id)
            .order('created_at', ascending: false)
            .limit(40);
        for (final row in _maps(noticeRows)) {
          notices.add(
            ClassNotice(
              id: asText(row['id']),
              classCode: asText(row['class_code']),
              stream: asText(row['stream']),
              title: asText(row['title']),
              body: _nullable(row['body']),
              createdAt: asText(row['created_at']),
            ),
          );
        }

        final conversationRows = await _db
            .from('student_conversations')
            .select(
              'id, kind, class_code, stream, student_low_id, student_high_id, created_at',
            );
        final recentRows = await _db
            .from('student_messages')
            .select('conversation_id, body, created_at, flagged, hidden')
            .order('created_at', ascending: false)
            .limit(400);
        final previews = <String, Map<String, dynamic>>{};
        final flaggedIds = <String>{};
        final hiddenIds = <String>{};
        for (final row in _maps(recentRows)) {
          final id = asText(row['conversation_id']);
          previews.putIfAbsent(id, () => row);
          if (row['flagged'] == true && row['hidden'] != true) {
            flaggedIds.add(id);
          }
          if (row['hidden'] == true) hiddenIds.add(id);
        }
        flaggedMessages = flaggedIds.length;

        for (final row in _maps(conversationRows)) {
          final kind = asText(row['kind'], 'dm');
          final id = asText(row['id']);
          String code = asText(row['class_code']);
          String stream = asText(row['stream']);
          String title;
          if (kind == 'class_group') {
            title = 'Class chat · ${classLabelOf(code, stream)}';
          } else {
            final lowId = asText(row['student_low_id']);
            final highId = asText(row['student_high_id']);
            Pupil? lowPupil;
            for (final pupil in pupils) {
              if (pupil.id == lowId) lowPupil = pupil;
            }
            if (lowPupil != null) {
              code = lowPupil.classCode;
              stream = lowPupil.stream;
            }
            title = [
              pupilNames[lowId],
              pupilNames[highId],
            ].whereType<String>().join(' & ');
            if (title.isEmpty) title = 'Direct chat';
          }
          final preview = previews[id];
          threads.add(
            ChatThread(
              id: id,
              kind: kind,
              title: title,
              classCode: code,
              stream: stream,
              preview: _nullable(preview?['body']),
              previewAt: _nullable(preview?['created_at']),
              flagged: flaggedIds.contains(id),
              hasHidden: hiddenIds.contains(id),
            ),
          );
        }
        threads.sort(
          (a, b) => (b.previewAt ?? '').compareTo(a.previewAt ?? ''),
        );
      }
    }

    final bandRows = await _db
        .from('grade_bands')
        .select('id, section, label, min_score, max_score, sort_order');
    for (final row in _maps(bandRows)) {
      bands.add(
        GradeBand(
          id: asText(row['id']),
          section: asText(row['section'], 'primary'),
          label: asText(row['label']),
          minScore: asDouble(row['min_score']) ?? 0,
          maxScore: asDouble(row['max_score']) ?? 0,
          sortOrder: asInt(row['sort_order']) ?? 0,
        ),
      );
    }
    bands.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    final pointReasons = <PointReason>[];
    final pointAwards = <PointAward>[];
    try {
      final reasonRows = await _db
          .from('point_reasons')
          .select('id, polarity, label, sort_order')
          .eq('active', true)
          .order('sort_order');
      for (final row in _maps(reasonRows)) {
        final polarity = asText(row['polarity']);
        if (polarity != 'positive' && polarity != 'negative') continue;
        pointReasons.add(
          PointReason(
            id: asText(row['id']),
            polarity: polarity,
            label: asText(row['label']),
            sortOrder: asInt(row['sort_order']) ?? 0,
          ),
        );
      }
      if (term != null) {
        for (final row in await _paged(
          (from, to) => _db
              .from('point_awards')
              .select('id, student_id, points, reason_id, reason_label, teacher_name, created_at, voided_at')
              .eq('term_id', term.id)
              .order('id')
              .range(from, to),
        )) {
          pointAwards.add(
            PointAward(
              id: asText(row['id']),
              studentId: asText(row['student_id']),
              points: asInt(row['points']) ?? 0,
              reasonId: _nullable(row['reason_id']),
              reasonLabel: asText(row['reason_label']),
              teacherName: asText(row['teacher_name'], 'Teacher'),
              createdAt: asText(row['created_at']),
              voided: row['voided_at'] != null,
            ),
          );
        }
      }
    } catch (_) {}

    return TeacherSnapshot(
      unavailable: false,
      mustResetPassword: mustReset,
      staff: StaffProfile(
        id: staffId,
        fullName: name,
        title: _nullable(staff['title']),
        campus: _nullable(staff['campus']),
        email: _nullable(staff['email']) ?? user.email,
        initials: _nullable(staff['initials']),
        photoUrl: photoUrl,
        photoPath: photoPath,
      ),
      term: term,
      classes: classes,
      subjects: subjects,
      pupils: pupils,
      papers: papers,
      scores: scores,
      homework: homework,
      resources: resources,
      marks: marks,
      closures: closures,
      dates: dates,
      notices: notices,
      threads: threads,
      bands: bands,
      today: today,
      flaggedMessages: flaggedMessages,
      pointReasons: pointReasons,
      pointAwards: pointAwards,
    );
  }

  Future<void> awardPoints({
    required TeacherSnapshot snapshot,
    required List<Map<String, dynamic>> entries,
  }) async {
    _guard(snapshot);
    if (snapshot.term == null) {
      throw TeacherException('Set a current term before awarding points.');
    }
    if (entries.isEmpty) {
      throw TeacherException('Choose at least one pupil.');
    }
    await _db.rpc('award_pupil_points', params: {'p_entries': entries});
  }

  Future<List<ChatMessage>> loadMessages(
    String conversationId,
    TeacherSnapshot snapshot,
  ) async {
    final rows = await _db
        .from('student_messages')
        .select(
          'id, conversation_id, sender_student_id, body, flagged, hidden, created_at',
        )
        .eq('conversation_id', conversationId)
        .order('created_at');
    return [
      for (final row in _maps(rows))
        ChatMessage(
          id: asText(row['id']),
          conversationId: asText(row['conversation_id']),
          body: asText(row['body']),
          createdAt: asText(row['created_at']),
          flagged: row['flagged'] == true,
          hidden: row['hidden'] == true,
          senderName: snapshot
              .pupilById(asText(row['sender_student_id']))
              ?.fullName,
        ),
    ];
  }

  Future<void> saveHomework({
    required TeacherSnapshot snapshot,
    required String classCode,
    required String stream,
    required String subjectId,
    required String title,
    required String instructions,
    required String dueOn,
    required bool publish,
  }) async {
    _guard(snapshot);
    if (snapshot.term == null) {
      throw TeacherException('Set a current term before setting homework.');
    }
    if (!snapshot.teachesPost(classCode, stream, subjectId)) {
      throw TeacherException(
        'You can only set homework for a subject you teach.',
      );
    }
    if (title.trim().length < 2 || dueOn.isEmpty) {
      throw TeacherException('Add a title and a due date.');
    }
    final userId = _db.auth.currentUser?.id;
    final publishedAt = publish
        ? DateTime.now().toUtc().toIso8601String()
        : null;
    await _db.from('homework_assignments').insert({
      'term_id': snapshot.term!.id,
      'class_code': classCode,
      'stream': stream,
      'subject_id': subjectId,
      'title': title.trim().length > 160
          ? title.trim().substring(0, 160)
          : title.trim(),
      'instructions': instructions.trim().isEmpty ? null : instructions.trim(),
      'due_on': dueOn,
      'created_by': userId,
      'published_at': publishedAt,
    });
    if (publish) {
      await _notifyClass(
        snapshot,
        classCode,
        stream,
        'New homework',
        title.trim(),
        '/student/homework',
        'homework',
      );
    }
  }

  Future<void> publishHomework(
    TeacherSnapshot snapshot,
    HomeworkItem item,
  ) async {
    _guard(snapshot);
    if (item.published) return;
    await _db
        .from('homework_assignments')
        .update({
          'published_at': DateTime.now().toUtc().toIso8601String(),
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', item.id);
    await _notifyClass(
      snapshot,
      item.classCode,
      item.stream,
      'New homework',
      item.title,
      '/student/homework',
      'homework',
    );
  }

  Future<void> saveResource({
    required TeacherSnapshot snapshot,
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
  }) async {
    _guard(snapshot);
    if (snapshot.term == null) {
      throw TeacherException('Set a current term before posting a resource.');
    }
    if (!snapshot.teachesPost(classCode, stream, subjectId)) {
      throw TeacherException(
        'You can only post a resource for a subject you teach.',
      );
    }
    final cleanTitle = title.trim();
    if (cleanTitle.length < 2) throw TeacherException('Add a title.');
    String? filePath;
    String? storedName;
    if (kind == 'file' || kind == 'image') {
      if (fileBytes == null || fileBytes.isEmpty) {
        throw TeacherException('Choose a file to share.');
      }
      if (fileBytes.length > 15 * 1024 * 1024) {
        throw TeacherException('That file is too large (max 15 MB).');
      }
      final safeName = (fileName ?? 'resource').replaceAll(
        RegExp(r'[^\w.\-()+ ]'),
        '_',
      );
      final clipped = safeName.length > 120
          ? safeName.substring(safeName.length - 120)
          : safeName;
      filePath =
          '$classCode/${stream.isEmpty ? '_' : stream}/${DateTime.now().millisecondsSinceEpoch}-$clipped';
      storedName = clipped;
      await _db.storage
          .from('class-resources')
          .uploadBinary(
            filePath,
            _asBytes(fileBytes),
            fileOptions: FileOptions(
              contentType: fileMime ?? 'application/octet-stream',
              upsert: false,
            ),
          );
    }
    if (kind == 'note' && (body ?? '').trim().isEmpty) {
      throw TeacherException('Write the note.');
    }
    if (kind == 'link' && (linkUrl ?? '').trim().isEmpty) {
      throw TeacherException('Add a link.');
    }
    try {
      await _db.from('class_resources').insert({
        'term_id': snapshot.term!.id,
        'class_code': classCode,
        'stream': stream,
        'subject_id': subjectId,
        'teacher_staff_id': snapshot.staff.id,
        'teacher_name': snapshot.displayName,
        'kind': kind,
        'title': cleanTitle.length > 160
            ? cleanTitle.substring(0, 160)
            : cleanTitle,
        'body': (body ?? '').trim().isEmpty ? null : body!.trim(),
        'link_url': kind == 'link' ? linkUrl!.trim() : null,
        'file_path': filePath,
        'file_name': storedName,
        'file_mime': fileMime,
        'file_size': fileBytes?.length,
        'created_by': _db.auth.currentUser?.id,
        'published_at': publish
            ? DateTime.now().toUtc().toIso8601String()
            : null,
      });
    } catch (error) {
      if (filePath != null) {
        try {
          await _db.storage.from('class-resources').remove([filePath]);
        } catch (_) {}
      }
      rethrow;
    }
    if (publish) {
      await _notifyClass(
        snapshot,
        classCode,
        stream,
        'New class resource',
        cleanTitle,
        '/student',
        'resources',
      );
    }
  }

  Future<void> publishResource(
    TeacherSnapshot snapshot,
    ResourceItem item,
  ) async {
    _guard(snapshot);
    if (item.published) return;
    await _db
        .from('class_resources')
        .update({
          'published_at': DateTime.now().toUtc().toIso8601String(),
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', item.id);
    await _notifyClass(
      snapshot,
      item.classCode,
      item.stream,
      'New class resource',
      item.title,
      '/student',
      'resources',
    );
  }

  Future<String?> resourceLink(String path) async {
    try {
      return await _db.storage
          .from('class-resources')
          .createSignedUrl(path, 60 * 10);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveMarks({
    required TeacherSnapshot snapshot,
    required Paper paper,
    required List<Map<String, dynamic>> rows,
    required bool submit,
  }) async {
    _guard(snapshot);
    if (!snapshot.teachesPost(paper.classCode, paper.stream, paper.subjectId)) {
      throw TeacherException('This markbook is not one of your subjects.');
    }
    if (!paper.open) {
      throw TeacherException(
        'This markbook is locked. Ask the academics office to unlock it.',
      );
    }
    if (rows.isEmpty) {
      if (!submit) return;
      throw TeacherException('There are no pupils on this markbook.');
    }
    if (submit &&
        rows.any((row) => row['missed'] != true && row['score'] == null)) {
      throw TeacherException(
        'Enter a mark, or tick missed, for every pupil before submitting.',
      );
    }
    await _db
        .from('assessment_scores')
        .upsert(rows, onConflict: 'assessment_id,student_id');
    if (submit) {
      await _db
          .from('assessments')
          .update({'status': 'submitted'})
          .eq('id', paper.id)
          .eq('status', 'open');
    }
  }

  Future<void> saveRegister({
    required TeacherSnapshot snapshot,
    required String classCode,
    required String stream,
    required List<Map<String, dynamic>> rows,
  }) async {
    _guard(snapshot);
    if (!snapshot.leadsClass(classCode, stream)) {
      throw TeacherException('You can only mark a class you lead.');
    }
    if (snapshot.term == null) {
      throw TeacherException('Set a current term before taking the register.');
    }
    if (rows.isEmpty) {
      throw TeacherException('There are no pupils on this register.');
    }
    await _db
        .from('attendance')
        .upsert(rows, onConflict: 'student_id,attended_on');
  }

  Future<void> setRegisterClosed({
    required TeacherSnapshot snapshot,
    required String classCode,
    required String stream,
    required bool closed,
  }) async {
    _guard(snapshot);
    if (!snapshot.leadsClass(classCode, stream)) {
      throw TeacherException('You can only change a class you lead.');
    }
    if (closed) {
      await _db.from('attendance_closures').upsert({
        'attended_on': snapshot.today,
        'class_code': classCode,
        'stream': stream,
        'closed_by': _db.auth.currentUser?.id,
      }, onConflict: 'attended_on,class_code,stream');
    } else {
      await _db
          .from('attendance_closures')
          .delete()
          .eq('attended_on', snapshot.today)
          .eq('class_code', classCode)
          .eq('stream', stream);
    }
  }

  Future<void> saveDate({
    required TeacherSnapshot snapshot,
    String? id,
    required String classCode,
    required String stream,
    required String title,
    required String kind,
    required String startsOn,
    String? endsOn,
    String? note,
  }) async {
    _guard(snapshot);
    if (snapshot.term == null) {
      throw TeacherException('Set a current term before adding dates.');
    }
    if (!snapshot.leadsClass(classCode, stream)) {
      throw TeacherException('You can only change dates for a class you lead.');
    }
    if (title.trim().length < 2 || startsOn.isEmpty) {
      throw TeacherException('Add a title and a start date.');
    }
    final payload = {
      'term_id': snapshot.term!.id,
      'class_code': classCode,
      'stream': stream,
      'title': title.trim().length > 160
          ? title.trim().substring(0, 160)
          : title.trim(),
      'kind': kind,
      'starts_on': startsOn,
      'ends_on': (endsOn ?? '').isEmpty ? null : endsOn,
      'note': (note ?? '').trim().isEmpty ? null : note!.trim(),
      'created_by': _db.auth.currentUser?.id,
    };
    if (id == null || id.isEmpty) {
      await _db.from('academic_dates').insert(payload);
    } else {
      await _db.from('academic_dates').update(payload).eq('id', id);
    }
  }

  Future<void> deleteDate(TeacherSnapshot snapshot, SchoolDate date) async {
    _guard(snapshot);
    if (date.schoolWide) {
      throw TeacherException(
        'School dates are updated by the academics office.',
      );
    }
    if (!snapshot.leadsClass(date.classCode ?? '', date.stream ?? '')) {
      throw TeacherException('You can only change dates for a class you lead.');
    }
    await _db.from('academic_dates').delete().eq('id', date.id);
  }

  Future<void> sendNotice({
    required TeacherSnapshot snapshot,
    required String classCode,
    required String stream,
    required String title,
    required String body,
  }) async {
    _guard(snapshot);
    if (!snapshot.leadsClass(classCode, stream)) {
      throw TeacherException('Only the class teacher can notify this class.');
    }
    if (title.trim().length < 2) throw TeacherException('Write a title.');
    await _db.rpc(
      'notify_my_class',
      params: {
        'p_class_code': classCode,
        'p_stream': stream,
        'p_title': title.trim(),
        'p_body': body.trim(),
      },
    );
  }

  Future<void> hideMessage(String id) async {
    await _db.from('student_messages').update({'hidden': true}).eq('id', id);
  }

  Future<void> changePassword(String password, String confirm) async {
    if (password.length < 6) {
      throw TeacherException('Use at least 6 characters.');
    }
    if (password != confirm) throw TeacherException('Passwords do not match.');
    await _db.auth.updateUser(
      UserAttributes(password: password, data: {'must_reset_password': false}),
    );
  }

  Future<void> setPhoto({
    required String staffId,
    String? previousPath,
    required List<int> bytes,
    required String extension,
    required String mime,
  }) async {
    if (bytes.length > 1024 * 1024) {
      throw TeacherException('That photo is too large. Try a smaller one.');
    }
    final path = '$staffId/${DateTime.now().millisecondsSinceEpoch}.$extension';
    await _db.storage
        .from('teacher-photos')
        .uploadBinary(
          path,
          _asBytes(bytes),
          fileOptions: FileOptions(contentType: mime, upsert: false),
        );
    try {
      await _db.rpc('set_my_teacher_photo', params: {'p_path': path});
    } catch (error) {
      try {
        await _db.storage.from('teacher-photos').remove([path]);
      } catch (_) {}
      rethrow;
    }
    if (previousPath != null && previousPath.isNotEmpty) {
      try {
        await _db.storage.from('teacher-photos').remove([previousPath]);
      } catch (_) {}
    }
  }

  Future<void> clearPhoto(String? previousPath) async {
    await _db.rpc('set_my_teacher_photo', params: {'p_path': null});
    if (previousPath != null && previousPath.isNotEmpty) {
      try {
        await _db.storage.from('teacher-photos').remove([previousPath]);
      } catch (_) {}
    }
  }

  Future<void> _notifyClass(
    TeacherSnapshot snapshot,
    String classCode,
    String stream,
    String title,
    String body,
    String href,
    String kind,
  ) async {
    final pupils = snapshot
        .pupilsIn(classCode, stream)
        .where((pupil) => pupil.profileId != null);
    for (final pupil in pupils) {
      try {
        await _db.rpc(
          'notify_user',
          params: {
            'p_user_id': pupil.profileId,
            'p_title': title,
            'p_body': body,
            'p_href': href,
            'p_kind': kind,
          },
        );
      } catch (_) {}
    }
    try {
      await _db.rpc(
        'notify_class_parents',
        params: {
          'p_class_code': classCode,
          'p_stream': stream,
          'p_title': title,
          'p_body': body,
          'p_href': '/account/children',
          'p_kind': kind,
        },
      );
    } catch (_) {}
  }

  Future<Map<String, String>> _signedStudentPhotos(List<Pupil> pupils) async {
    final ready = [
      for (final pupil in pupils)
        if ((pupil.photoPath ?? '').trim().isNotEmpty) pupil,
    ];
    if (ready.isEmpty) return const {};
    final first = await _signStudentPhoto(ready.first.photoPath!);
    if (first == null) return const {};
    final urls = <String, String>{ready.first.id: first};
    await Future.wait(ready.skip(1).map((pupil) async {
      final url = await _signStudentPhoto(pupil.photoPath!);
      if (url != null) urls[pupil.id] = url;
    }));
    return urls;
  }

  Future<String?> _signStudentPhoto(String path) async {
    try {
      final url = await _db.storage.from('student-photos').createSignedUrl(path, 60 * 60 * 6);
      return url.isEmpty ? null : url;
    } catch (_) {
      return null;
    }
  }

  void _guard(TeacherSnapshot snapshot) {
    if (snapshot.mustResetPassword) {
      throw TeacherException('Change your password before continuing.');
    }
  }

  Uint8List _asBytes(List<int> bytes) =>
      bytes is Uint8List ? bytes : Uint8List.fromList(bytes);

  Future<List<Map<String, dynamic>>> _paged(
    dynamic Function(int from, int to) query,
  ) async {
    final rows = <Map<String, dynamic>>[];
    for (var from = 0; from < 5000; from += 1000) {
      final page = _maps(await query(from, from + 999));
      rows.addAll(page);
      if (page.length < 1000) break;
    }
    return rows;
  }
}

String? _nullable(dynamic value) {
  final text = value?.toString().trim() ?? '';
  return text.isEmpty ? null : text;
}

String? _dateOrNull(dynamic value) {
  final text = _nullable(value);
  if (text == null) return null;
  return text.length >= 10 ? text.substring(0, 10) : text;
}

Map<String, dynamic>? _firstMap(dynamic data) {
  final rows = _maps(data);
  return rows.isEmpty ? null : rows.first;
}

List<Map<String, dynamic>> _maps(dynamic data) {
  if (data is! List) return const [];
  return [
    for (final row in data)
      if (row is Map) Map<String, dynamic>.from(row),
  ];
}
