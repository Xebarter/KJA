import 'format.dart';

class Pupil {
  const Pupil({
    required this.id,
    required this.fullName,
    required this.studentNumber,
    required this.status,
    this.preferredName,
    this.classCode,
    this.stream,
    this.campus,
    this.photoPath,
    this.house,
    this.sex,
  });

  final String id;
  final String fullName;
  final String? preferredName;
  final String? classCode;
  final String? stream;
  final String? campus;
  final String studentNumber;
  final String? photoPath;
  final String status;
  final String? house;
  final String? sex;

  String get displayName {
    final preferred = preferredName?.trim() ?? '';
    if (preferred.isNotEmpty) return preferred;
    final full = fullName.trim();
    return full.isEmpty ? 'Student' : full;
  }

  String get classLabel => classLabelOf(classCode, stream);
}

class Classmate {
  const Classmate({
    required this.id,
    required this.fullName,
    this.preferredName,
    this.house,
    this.profileId,
    this.photoPath,
    this.photoUrl,
  });

  final String id;
  final String fullName;
  final String? preferredName;
  final String? house;
  final String? profileId;
  final String? photoPath;
  final String? photoUrl;

  String get displayName {
    final preferred = preferredName?.trim() ?? '';
    if (preferred.isNotEmpty) return preferred;
    return fullName.trim().isEmpty ? 'Classmate' : fullName.trim();
  }

  Classmate withPhotoUrl(String? url) => Classmate(
        id: id,
        fullName: fullName,
        preferredName: preferredName,
        house: house,
        profileId: profileId,
        photoPath: photoPath,
        photoUrl: url,
      );
}

class HomeworkItem {
  const HomeworkItem({
    required this.id,
    required this.title,
    required this.dueOn,
    required this.done,
    this.instructions,
    this.subjectName,
    this.doneAt,
  });

  final String id;
  final String title;
  final String? instructions;
  final String dueOn;
  final String? subjectName;
  final bool done;
  final String? doneAt;

  HomeworkItem marked(bool nextDone) {
    return HomeworkItem(
      id: id,
      title: title,
      dueOn: dueOn,
      instructions: instructions,
      subjectName: subjectName,
      done: nextDone,
      doneAt: nextDone ? DateTime.now().toUtc().toIso8601String() : null,
    );
  }
}

class Notice {
  const Notice({
    required this.id,
    required this.title,
    required this.read,
    required this.createdAt,
    this.body,
    this.href,
    this.kind,
  });

  final String id;
  final String title;
  final String? body;
  final String? href;
  final String? kind;
  final bool read;
  final String createdAt;

  Notice copyWith({bool? read}) {
    return Notice(
      id: id,
      title: title,
      read: read ?? this.read,
      createdAt: createdAt,
      body: body,
      href: href,
      kind: kind,
    );
  }
}

class Lesson {
  const Lesson({
    required this.id,
    required this.weekday,
    required this.period,
    required this.subjectName,
    this.startsAt,
    this.endsAt,
    this.room,
    this.teacherName,
  });

  final String id;
  final int weekday;
  final int period;
  final String? startsAt;
  final String? endsAt;
  final String subjectName;
  final String? room;
  final String? teacherName;

  String get when {
    final start = clock(startsAt);
    final end = clock(endsAt);
    if (start.isEmpty) return 'Period $period';
    if (end.isEmpty) return start;
    return '$start – $end';
  }
}

class AttendanceDay {
  const AttendanceDay({required this.attendedOn, required this.status});

  final String attendedOn;
  final String status;
}

class AttendanceSummary {
  const AttendanceSummary({
    required this.present,
    required this.late,
    required this.absent,
    required this.excused,
    required this.total,
    required this.percent,
    required this.recent,
  });

  final int present;
  final int late;
  final int absent;
  final int excused;
  final int total;
  final int percent;
  final List<AttendanceDay> recent;

  static const empty = AttendanceSummary(
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    total: 0,
    percent: 0,
    recent: [],
  );

  factory AttendanceSummary.fromDays(List<AttendanceDay> days) {
    final present = days.where((day) => day.status == 'present').length;
    final late = days.where((day) => day.status == 'late').length;
    final absent = days.where((day) => day.status == 'absent').length;
    final excused = days.where((day) => day.status == 'excused').length;
    final total = days.length;
    final percent = total == 0 ? 0 : (((present + late) / total) * 100).round();
    final recent = [...days]..sort((a, b) => b.attendedOn.compareTo(a.attendedOn));
    return AttendanceSummary(
      present: present,
      late: late,
      absent: absent,
      excused: excused,
      total: total,
      percent: percent,
      recent: recent.take(14).toList(),
    );
  }
}

class ClubMembership {
  const ClubMembership({
    required this.id,
    required this.title,
    required this.paid,
    this.campus,
    this.meeting,
    this.description,
  });

  final String id;
  final String title;
  final String? campus;
  final String? meeting;
  final String? description;
  final bool paid;
}

class Teacher {
  const Teacher({
    required this.id,
    required this.fullName,
    required this.role,
    this.title,
    this.subjectName,
    this.photoPath,
    this.photoUrl,
  });

  final String id;
  final String fullName;
  final String? title;
  final String? subjectName;
  final String role;
  final String? photoPath;
  final String? photoUrl;

  /// teaching_staff id (subject rows use `staffId:subjectId` as [id]).
  String get staffId {
    final colon = id.indexOf(':');
    return colon == -1 ? id : id.substring(0, colon);
  }

  String get label {
    final honour = title?.trim() ?? '';
    if (honour.isEmpty) return fullName;
    return '$honour $fullName';
  }

  Teacher withPhotoUrl(String? url) => Teacher(
        id: id,
        fullName: fullName,
        role: role,
        title: title,
        subjectName: subjectName,
        photoPath: photoPath,
        photoUrl: url,
      );
}

class AcademicDate {
  const AcademicDate({
    required this.id,
    required this.title,
    required this.kind,
    required this.startsOn,
    this.endsOn,
    this.campus,
    this.note,
  });

  final String id;
  final String title;
  final String kind;
  final String startsOn;
  final String? endsOn;
  final String? campus;
  final String? note;
}

class SchoolEvent {
  const SchoolEvent({
    required this.slug,
    required this.title,
    required this.startsOn,
    this.location,
  });

  final String slug;
  final String title;
  final String startsOn;
  final String? location;
}

class ReportLine {
  const ReportLine({
    required this.subjectName,
    this.score,
    this.maxScore,
    this.grade,
    this.points,
    this.position,
    this.comment,
    this.parts = const [],
  });

  final String subjectName;
  final double? score;
  final double? maxScore;
  final String? grade;
  final int? points;
  final int? position;
  final String? comment;
  final List<ReportPart> parts;

  double? get percent {
    if (score == null) return null;
    final max = maxScore;
    if (max != null && max > 0) return (score! / max) * 100;
    if (score! <= 100) return score;
    return null;
  }
}

class ReportPart {
  const ReportPart({
    required this.label,
    required this.share,
    this.score,
    this.sortOrder = 0,
  });

  final String label;
  final double share;
  final double? score;
  final int sortOrder;
}

class ReportCard {
  const ReportCard({
    required this.id,
    required this.term,
    required this.classLabel,
    this.publishedAt,
    this.overallScore,
    this.overallPosition,
    this.overallAggregate,
    this.overallGrade,
    this.classTeacherName,
    this.classTeacherComment,
    this.headComment,
    this.conduct,
    this.daysPresent,
    this.daysOpened,
    this.lines = const [],
  });

  final String id;
  final String term;
  final String classLabel;
  final String? publishedAt;
  final double? overallScore;
  final int? overallPosition;
  final int? overallAggregate;
  final String? overallGrade;
  final String? classTeacherName;
  final String? classTeacherComment;
  final String? headComment;
  final String? conduct;
  final int? daysPresent;
  final int? daysOpened;
  final List<ReportLine> lines;

  double? get percent {
    if (overallScore != null && overallScore! <= 100) return overallScore;
    final scored = lines.where((line) => line.percent != null).toList();
    if (scored.isEmpty) return overallScore;
    final sum = scored.fold<double>(0, (total, line) => total + line.percent!);
    return sum / scored.length;
  }
}

class Conversation {
  const Conversation({
    required this.id,
    required this.kind,
    required this.title,
    this.peerId,
    this.house,
    this.lastBody,
    this.lastAt,
    this.memberCount = 0,
  });

  final String id;
  final String kind;
  final String title;
  final String? peerId;
  final String? house;
  final String? lastBody;
  final DateTime? lastAt;
  final int memberCount;

  bool get isGroup => kind == 'class_group';
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderStudentId,
    required this.body,
    required this.flagged,
    required this.createdAt,
  });

  final String id;
  final String conversationId;
  final String senderStudentId;
  final String body;
  final bool flagged;
  final DateTime createdAt;
}

class ClassResource {
  const ClassResource({
    required this.id,
    required this.kind,
    required this.title,
    required this.publishedAt,
    this.body,
    this.linkUrl,
    this.filePath,
    this.fileName,
    this.fileMime,
    this.fileSize,
    this.fileUrl,
    this.subjectName,
    this.teacherName,
  });

  final String id;
  /// note | file | image | link
  final String kind;
  final String title;
  final String? body;
  final String? linkUrl;
  final String? filePath;
  final String? fileName;
  final String? fileMime;
  final int? fileSize;
  final String? fileUrl;
  final String? subjectName;
  final String? teacherName;
  final DateTime publishedAt;

  bool get isNote => kind == 'note';
  bool get isImage => kind == 'image';
  bool get isFile => kind == 'file';
  bool get isLink => kind == 'link';

  ClassResource withFileUrl(String? url) => ClassResource(
        id: id,
        kind: kind,
        title: title,
        body: body,
        linkUrl: linkUrl,
        filePath: filePath,
        fileName: fileName,
        fileMime: fileMime,
        fileSize: fileSize,
        fileUrl: url,
        subjectName: subjectName,
        teacherName: teacherName,
        publishedAt: publishedAt,
      );
}

class PointAward {
  const PointAward({
    required this.id,
    required this.points,
    required this.reasonLabel,
    required this.teacherName,
    required this.createdAt,
  });

  final String id;
  final int points;
  final String reasonLabel;
  final String teacherName;
  final String createdAt;
}

class PortalSnapshot {
  const PortalSnapshot({
    required this.displayName,
    required this.classLabel,
    required this.email,
    required this.mustResetPassword,
    required this.preview,
    this.pupil,
    this.photoUrl,
    this.photoUrls = const {},
    this.termLabel,
    this.classTeacher,
    this.homework = const [],
    this.notices = const [],
    this.lessonsToday = const [],
    this.timetable = const [],
    this.attendance = AttendanceSummary.empty,
    this.clubs = const [],
    this.teachers = const [],
    this.classmates = const [],
    this.academicDates = const [],
    this.events = const [],
    this.reports = const [],
    this.conversations = const [],
    this.resources = const [],
    this.points = const [],
    this.unreadMessages = 0,
  });

  final String displayName;
  final String classLabel;
  final String email;
  final bool mustResetPassword;
  final bool preview;
  final Pupil? pupil;
  /// Signed URL for the signed-in pupil portrait when storage allows it.
  final String? photoUrl;
  /// Signed portrait URLs keyed by student id (self + classmates).
  final Map<String, String> photoUrls;
  final String? termLabel;
  final Teacher? classTeacher;
  final List<HomeworkItem> homework;
  final List<Notice> notices;
  final List<Lesson> lessonsToday;
  final List<Lesson> timetable;
  final AttendanceSummary attendance;
  final List<ClubMembership> clubs;
  final List<Teacher> teachers;
  final List<Classmate> classmates;
  final List<AcademicDate> academicDates;
  final List<SchoolEvent> events;
  final List<ReportCard> reports;
  final List<Conversation> conversations;
  final List<ClassResource> resources;
  final List<PointAward> points;
  final int unreadMessages;

  int get unreadNotices => notices.where((notice) => !notice.read).length;

  String? faceUrl(String? studentId) {
    if (studentId == null || studentId.isEmpty) return null;
    return photoUrls[studentId] ?? (pupil?.id == studentId ? photoUrl : null);
  }

  PortalSnapshot copyWith({
    bool? mustResetPassword,
    List<HomeworkItem>? homework,
    List<Notice>? notices,
    List<Conversation>? conversations,
    int? unreadMessages,
    String? photoUrl,
    Map<String, String>? photoUrls,
    List<ClubMembership>? clubs,
    List<AcademicDate>? academicDates,
    List<SchoolEvent>? events,
    List<ReportCard>? reports,
    List<ClassResource>? resources,
    List<PointAward>? points,
  }) {
    return PortalSnapshot(
      displayName: displayName,
      classLabel: classLabel,
      email: email,
      mustResetPassword: mustResetPassword ?? this.mustResetPassword,
      preview: preview,
      pupil: pupil,
      photoUrl: photoUrl ?? this.photoUrl,
      photoUrls: photoUrls ?? this.photoUrls,
      termLabel: termLabel,
      classTeacher: classTeacher,
      homework: homework ?? this.homework,
      notices: notices ?? this.notices,
      lessonsToday: lessonsToday,
      timetable: timetable,
      attendance: attendance,
      clubs: clubs ?? this.clubs,
      teachers: teachers,
      classmates: classmates,
      academicDates: academicDates ?? this.academicDates,
      events: events ?? this.events,
      reports: reports ?? this.reports,
      conversations: conversations ?? this.conversations,
      resources: resources ?? this.resources,
      points: points ?? this.points,
      unreadMessages: unreadMessages ?? this.unreadMessages,
    );
  }
}
