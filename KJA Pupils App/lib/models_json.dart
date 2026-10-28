import 'models.dart';

extension PupilJson on Pupil {
  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'preferredName': preferredName,
        'classCode': classCode,
        'stream': stream,
        'campus': campus,
        'studentNumber': studentNumber,
        'photoPath': photoPath,
        'status': status,
        'house': house,
        'sex': sex,
      };

  static Pupil fromJson(Map<String, dynamic> json) => Pupil(
        id: '${json['id'] ?? ''}',
        fullName: '${json['fullName'] ?? 'Student'}',
        preferredName: _s(json['preferredName']),
        classCode: _s(json['classCode']),
        stream: _s(json['stream']),
        campus: _s(json['campus']),
        studentNumber: '${json['studentNumber'] ?? ''}',
        photoPath: _s(json['photoPath']),
        status: '${json['status'] ?? 'active'}',
        house: _s(json['house']),
        sex: _s(json['sex']),
      );
}

extension ClassmateJson on Classmate {
  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'preferredName': preferredName,
        'house': house,
        'profileId': profileId,
        'photoPath': photoPath,
        'photoUrl': photoUrl,
      };

  static Classmate fromJson(Map<String, dynamic> json) => Classmate(
        id: '${json['id'] ?? ''}',
        fullName: '${json['fullName'] ?? 'Classmate'}',
        preferredName: _s(json['preferredName']),
        house: _s(json['house']),
        profileId: _s(json['profileId']),
        photoPath: _s(json['photoPath']),
        photoUrl: _s(json['photoUrl']),
      );
}

extension HomeworkItemJson on HomeworkItem {
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'instructions': instructions,
        'dueOn': dueOn,
        'subjectName': subjectName,
        'done': done,
        'doneAt': doneAt,
      };

  static HomeworkItem fromJson(Map<String, dynamic> json) => HomeworkItem(
        id: '${json['id'] ?? ''}',
        title: '${json['title'] ?? ''}',
        instructions: _s(json['instructions']),
        dueOn: '${json['dueOn'] ?? ''}',
        subjectName: _s(json['subjectName']),
        done: json['done'] == true,
        doneAt: _s(json['doneAt']),
      );
}

extension NoticeJson on Notice {
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'body': body,
        'href': href,
        'kind': kind,
        'read': read,
        'createdAt': createdAt,
      };

  static Notice fromJson(Map<String, dynamic> json) => Notice(
        id: '${json['id'] ?? ''}',
        title: '${json['title'] ?? ''}',
        body: _s(json['body']),
        href: _s(json['href']),
        kind: _s(json['kind']),
        read: json['read'] == true,
        createdAt: '${json['createdAt'] ?? ''}',
      );
}

extension LessonJson on Lesson {
  Map<String, dynamic> toJson() => {
        'id': id,
        'weekday': weekday,
        'period': period,
        'startsAt': startsAt,
        'endsAt': endsAt,
        'subjectName': subjectName,
        'room': room,
        'teacherName': teacherName,
      };

  static Lesson fromJson(Map<String, dynamic> json) => Lesson(
        id: '${json['id'] ?? ''}',
        weekday: _i(json['weekday']) ?? 1,
        period: _i(json['period']) ?? 1,
        startsAt: _s(json['startsAt']),
        endsAt: _s(json['endsAt']),
        subjectName: '${json['subjectName'] ?? 'Subject'}',
        room: _s(json['room']),
        teacherName: _s(json['teacherName']),
      );
}

extension AttendanceDayJson on AttendanceDay {
  Map<String, dynamic> toJson() => {'attendedOn': attendedOn, 'status': status};

  static AttendanceDay fromJson(Map<String, dynamic> json) => AttendanceDay(
        attendedOn: '${json['attendedOn'] ?? ''}',
        status: '${json['status'] ?? 'present'}',
      );
}

extension AttendanceSummaryJson on AttendanceSummary {
  Map<String, dynamic> toJson() => {
        'present': present,
        'late': late,
        'absent': absent,
        'excused': excused,
        'total': total,
        'percent': percent,
        'recent': recent.map((row) => row.toJson()).toList(),
      };

  static AttendanceSummary fromJson(Map<String, dynamic> json) => AttendanceSummary(
        present: _i(json['present']) ?? 0,
        late: _i(json['late']) ?? 0,
        absent: _i(json['absent']) ?? 0,
        excused: _i(json['excused']) ?? 0,
        total: _i(json['total']) ?? 0,
        percent: _i(json['percent']) ?? 0,
        recent: _list(json['recent']).map(AttendanceDayJson.fromJson).toList(),
      );
}

extension ClubMembershipJson on ClubMembership {
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'campus': campus,
        'meeting': meeting,
        'description': description,
        'paid': paid,
      };

  static ClubMembership fromJson(Map<String, dynamic> json) => ClubMembership(
        id: '${json['id'] ?? ''}',
        title: '${json['title'] ?? 'Club'}',
        campus: _s(json['campus']),
        meeting: _s(json['meeting']),
        description: _s(json['description']),
        paid: json['paid'] == true,
      );
}

extension TeacherJson on Teacher {
  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'title': title,
        'subjectName': subjectName,
        'role': role,
        'photoPath': photoPath,
        'photoUrl': photoUrl,
      };

  static Teacher fromJson(Map<String, dynamic> json) => Teacher(
        id: '${json['id'] ?? ''}',
        fullName: '${json['fullName'] ?? 'Teacher'}',
        title: _s(json['title']),
        subjectName: _s(json['subjectName']),
        role: '${json['role'] ?? 'teacher'}',
        photoPath: _s(json['photoPath']),
        photoUrl: _s(json['photoUrl']),
      );
}

extension AcademicDateJson on AcademicDate {
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'kind': kind,
        'startsOn': startsOn,
        'endsOn': endsOn,
        'campus': campus,
        'note': note,
      };

  static AcademicDate fromJson(Map<String, dynamic> json) => AcademicDate(
        id: '${json['id'] ?? ''}',
        title: '${json['title'] ?? ''}',
        kind: '${json['kind'] ?? ''}',
        startsOn: '${json['startsOn'] ?? ''}',
        endsOn: _s(json['endsOn']),
        campus: _s(json['campus']),
        note: _s(json['note']),
      );
}

extension SchoolEventJson on SchoolEvent {
  Map<String, dynamic> toJson() => {
        'slug': slug,
        'title': title,
        'startsOn': startsOn,
        'location': location,
      };

  static SchoolEvent fromJson(Map<String, dynamic> json) => SchoolEvent(
        slug: '${json['slug'] ?? ''}',
        title: '${json['title'] ?? ''}',
        startsOn: '${json['startsOn'] ?? ''}',
        location: _s(json['location']),
      );
}

extension ReportPartJson on ReportPart {
  Map<String, dynamic> toJson() => {
        'label': label,
        'share': share,
        'score': score,
        'sortOrder': sortOrder,
      };

  static ReportPart fromJson(Map<String, dynamic> json) => ReportPart(
        label: '${json['label'] ?? ''}',
        share: _d(json['share']) ?? 0,
        score: _d(json['score']),
        sortOrder: _i(json['sortOrder']) ?? 0,
      );
}

extension ReportLineJson on ReportLine {
  Map<String, dynamic> toJson() => {
        'subjectName': subjectName,
        'score': score,
        'maxScore': maxScore,
        'grade': grade,
        'points': points,
        'position': position,
        'comment': comment,
        'parts': parts.map((row) => row.toJson()).toList(),
      };

  static ReportLine fromJson(Map<String, dynamic> json) => ReportLine(
        subjectName: '${json['subjectName'] ?? ''}',
        score: _d(json['score']),
        maxScore: _d(json['maxScore']),
        grade: _s(json['grade']),
        points: _i(json['points']),
        position: _i(json['position']),
        comment: _s(json['comment']),
        parts: _list(json['parts']).map(ReportPartJson.fromJson).toList(),
      );
}

extension ReportCardJson on ReportCard {
  Map<String, dynamic> toJson() => {
        'id': id,
        'term': term,
        'classLabel': classLabel,
        'publishedAt': publishedAt,
        'overallScore': overallScore,
        'overallPosition': overallPosition,
        'overallAggregate': overallAggregate,
        'overallGrade': overallGrade,
        'classTeacherName': classTeacherName,
        'classTeacherComment': classTeacherComment,
        'headComment': headComment,
        'conduct': conduct,
        'daysPresent': daysPresent,
        'daysOpened': daysOpened,
        'lines': lines.map((row) => row.toJson()).toList(),
      };

  static ReportCard fromJson(Map<String, dynamic> json) => ReportCard(
        id: '${json['id'] ?? ''}',
        term: '${json['term'] ?? ''}',
        classLabel: '${json['classLabel'] ?? ''}',
        publishedAt: _s(json['publishedAt']),
        overallScore: _d(json['overallScore']),
        overallPosition: _i(json['overallPosition']),
        overallAggregate: _i(json['overallAggregate']),
        overallGrade: _s(json['overallGrade']),
        classTeacherName: _s(json['classTeacherName']),
        classTeacherComment: _s(json['classTeacherComment']),
        headComment: _s(json['headComment']),
        conduct: _s(json['conduct']),
        daysPresent: _i(json['daysPresent']),
        daysOpened: _i(json['daysOpened']),
        lines: _list(json['lines']).map(ReportLineJson.fromJson).toList(),
      );
}

extension ConversationJson on Conversation {
  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'title': title,
        'peerId': peerId,
        'house': house,
        'lastBody': lastBody,
        'lastAt': lastAt?.toUtc().toIso8601String(),
        'memberCount': memberCount,
      };

  static Conversation fromJson(Map<String, dynamic> json) => Conversation(
        id: '${json['id'] ?? ''}',
        kind: '${json['kind'] ?? 'direct'}',
        title: '${json['title'] ?? ''}',
        peerId: _s(json['peerId']),
        house: _s(json['house']),
        lastBody: _s(json['lastBody']),
        lastAt: _dt(json['lastAt']),
        memberCount: _i(json['memberCount']) ?? 0,
      );
}

extension ClassResourceJson on ClassResource {
  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'title': title,
        'body': body,
        'linkUrl': linkUrl,
        'filePath': filePath,
        'fileName': fileName,
        'fileMime': fileMime,
        'fileSize': fileSize,
        'fileUrl': fileUrl,
        'subjectName': subjectName,
        'teacherName': teacherName,
        'publishedAt': publishedAt.toUtc().toIso8601String(),
      };

  static ClassResource fromJson(Map<String, dynamic> json) => ClassResource(
        id: '${json['id'] ?? ''}',
        kind: '${json['kind'] ?? 'note'}',
        title: '${json['title'] ?? ''}',
        body: _s(json['body']),
        linkUrl: _s(json['linkUrl']),
        filePath: _s(json['filePath']),
        fileName: _s(json['fileName']),
        fileMime: _s(json['fileMime']),
        fileSize: _i(json['fileSize']),
        fileUrl: _s(json['fileUrl']),
        subjectName: _s(json['subjectName']),
        teacherName: _s(json['teacherName']),
        publishedAt: _dt(json['publishedAt']) ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      );
}

extension PointAwardJson on PointAward {
  Map<String, dynamic> toJson() => {
        'id': id,
        'points': points,
        'reasonLabel': reasonLabel,
        'teacherName': teacherName,
        'createdAt': createdAt,
      };

  static PointAward fromJson(Map<String, dynamic> json) => PointAward(
        id: '${json['id'] ?? ''}',
        points: _i(json['points']) ?? 0,
        reasonLabel: '${json['reasonLabel'] ?? ''}',
        teacherName: '${json['teacherName'] ?? ''}',
        createdAt: '${json['createdAt'] ?? ''}',
      );
}

extension PortalSnapshotJson on PortalSnapshot {
  Map<String, dynamic> toJson() => {
        'displayName': displayName,
        'classLabel': classLabel,
        'email': email,
        'mustResetPassword': mustResetPassword,
        'preview': preview,
        'pupil': pupil?.toJson(),
        'photoUrl': photoUrl,
        'photoUrls': photoUrls,
        'termLabel': termLabel,
        'classTeacher': classTeacher?.toJson(),
        'homework': homework.map((row) => row.toJson()).toList(),
        'notices': notices.map((row) => row.toJson()).toList(),
        'lessonsToday': lessonsToday.map((row) => row.toJson()).toList(),
        'timetable': timetable.map((row) => row.toJson()).toList(),
        'attendance': attendance.toJson(),
        'clubs': clubs.map((row) => row.toJson()).toList(),
        'teachers': teachers.map((row) => row.toJson()).toList(),
        'classmates': classmates.map((row) => row.toJson()).toList(),
        'academicDates': academicDates.map((row) => row.toJson()).toList(),
        'events': events.map((row) => row.toJson()).toList(),
        'reports': reports.map((row) => row.toJson()).toList(),
        'conversations': conversations.map((row) => row.toJson()).toList(),
        'resources': resources.map((row) => row.toJson()).toList(),
        'points': points.map((row) => row.toJson()).toList(),
        'unreadMessages': unreadMessages,
      };

  static PortalSnapshot fromJson(Map<String, dynamic> json) {
    final pupilMap = json['pupil'];
    final teacherMap = json['classTeacher'];
    final urlsRaw = json['photoUrls'];
    final photoUrls = <String, String>{};
    if (urlsRaw is Map) {
      for (final entry in urlsRaw.entries) {
        final value = '${entry.value}'.trim();
        if (value.isNotEmpty) photoUrls['${entry.key}'] = value;
      }
    }
    return PortalSnapshot(
      displayName: '${json['displayName'] ?? 'Student'}',
      classLabel: '${json['classLabel'] ?? ''}',
      email: '${json['email'] ?? ''}',
      mustResetPassword: json['mustResetPassword'] == true,
      preview: json['preview'] == true,
      pupil: pupilMap is Map ? PupilJson.fromJson(Map<String, dynamic>.from(pupilMap)) : null,
      photoUrl: _s(json['photoUrl']),
      photoUrls: photoUrls,
      termLabel: _s(json['termLabel']),
      classTeacher: teacherMap is Map ? TeacherJson.fromJson(Map<String, dynamic>.from(teacherMap)) : null,
      homework: _list(json['homework']).map(HomeworkItemJson.fromJson).toList(),
      notices: _list(json['notices']).map(NoticeJson.fromJson).toList(),
      lessonsToday: _list(json['lessonsToday']).map(LessonJson.fromJson).toList(),
      timetable: _list(json['timetable']).map(LessonJson.fromJson).toList(),
      attendance: json['attendance'] is Map
          ? AttendanceSummaryJson.fromJson(Map<String, dynamic>.from(json['attendance'] as Map))
          : AttendanceSummary.empty,
      clubs: _list(json['clubs']).map(ClubMembershipJson.fromJson).toList(),
      teachers: _list(json['teachers']).map(TeacherJson.fromJson).toList(),
      classmates: _list(json['classmates']).map(ClassmateJson.fromJson).toList(),
      academicDates: _list(json['academicDates']).map(AcademicDateJson.fromJson).toList(),
      events: _list(json['events']).map(SchoolEventJson.fromJson).toList(),
      reports: _list(json['reports']).map(ReportCardJson.fromJson).toList(),
      conversations: _list(json['conversations']).map(ConversationJson.fromJson).toList(),
      resources: _list(json['resources']).map(ClassResourceJson.fromJson).toList(),
      points: _list(json['points']).map(PointAwardJson.fromJson).toList(),
      unreadMessages: _i(json['unreadMessages']) ?? 0,
    );
  }
}

String? _s(dynamic value) {
  if (value == null) return null;
  final text = '$value'.trim();
  return text.isEmpty ? null : text;
}

double? _d(dynamic value) {
  if (value == null) return null;
  if (value is double) return value;
  if (value is num) return value.toDouble();
  return double.tryParse('$value');
}

int? _i(dynamic value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse('$value');
}

DateTime? _dt(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value.toUtc();
  return DateTime.tryParse('$value')?.toUtc();
}

List<Map<String, dynamic>> _list(dynamic value) {
  if (value is! List) return const [];
  return [
    for (final row in value)
      if (row is Map) Map<String, dynamic>.from(row),
  ];
}
