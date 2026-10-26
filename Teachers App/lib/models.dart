import 'format.dart';

class TeacherException implements Exception {
  TeacherException(this.message);
  final String message;

  @override
  String toString() => message;
}

class TermInfo {
  const TermInfo({
    required this.id,
    required this.label,
    this.startsOn,
    this.endsOn,
  });

  final String id;
  final String label;
  final String? startsOn;
  final String? endsOn;
}

class StaffProfile {
  const StaffProfile({
    required this.id,
    required this.fullName,
    this.title,
    this.campus,
    this.email,
    this.initials,
    this.photoUrl,
    this.photoPath,
  });

  final String id;
  final String fullName;
  final String? title;
  final String? campus;
  final String? email;
  final String? initials;
  final String? photoUrl;
  final String? photoPath;
}

class ClassPost {
  const ClassPost({
    required this.classCode,
    required this.stream,
    required this.label,
  });

  final String classCode;
  final String stream;
  final String label;
}

class SubjectPost {
  const SubjectPost({
    required this.classCode,
    required this.stream,
    required this.subjectId,
    required this.subjectName,
    required this.label,
  });

  final String classCode;
  final String stream;
  final String subjectId;
  final String subjectName;
  final String label;

  String get key => postKey(classCode, stream, subjectId);
}

class Pupil {
  const Pupil({
    required this.id,
    required this.fullName,
    required this.classCode,
    required this.stream,
    this.studentNumber,
    this.profileId,
    this.photoPath,
    this.photoUrl,
  });

  final String id;
  final String fullName;
  final String classCode;
  final String stream;
  final String? studentNumber;
  final String? profileId;
  final String? photoPath;
  final String? photoUrl;
}

class Paper {
  const Paper({
    required this.id,
    required this.name,
    required this.classCode,
    required this.stream,
    required this.subjectId,
    required this.subjectName,
    required this.kind,
    required this.maxScore,
    required this.status,
    this.heldOn,
  });

  final String id;
  final String name;
  final String classCode;
  final String stream;
  final String subjectId;
  final String subjectName;
  final String kind;
  final double maxScore;
  final String status;
  final String? heldOn;

  bool get open => status == 'open';
  bool get locked => status == 'submitted' || status == 'approved';
  String get classLabel => classLabelOf(classCode, stream);
}

class Score {
  const Score({
    required this.assessmentId,
    required this.studentId,
    this.score,
    required this.missed,
  });

  final String assessmentId;
  final String studentId;
  final double? score;
  final bool missed;
}

class HomeworkItem {
  const HomeworkItem({
    required this.id,
    required this.classCode,
    required this.stream,
    required this.subjectId,
    required this.subjectName,
    required this.title,
    required this.dueOn,
    required this.published,
    this.instructions,
    this.doneCount = 0,
  });

  final String id;
  final String classCode;
  final String stream;
  final String subjectId;
  final String subjectName;
  final String title;
  final String? instructions;
  final String dueOn;
  final bool published;
  final int doneCount;

  String get classLabel => classLabelOf(classCode, stream);
}

class ResourceItem {
  const ResourceItem({
    required this.id,
    required this.classCode,
    required this.stream,
    required this.subjectId,
    required this.subjectName,
    required this.kind,
    required this.title,
    required this.published,
    this.body,
    this.linkUrl,
    this.filePath,
    this.fileName,
  });

  final String id;
  final String classCode;
  final String stream;
  final String subjectId;
  final String subjectName;
  final String kind;
  final String title;
  final String? body;
  final String? linkUrl;
  final String? filePath;
  final String? fileName;
  final bool published;

  String get classLabel => classLabelOf(classCode, stream);
}

class AttendanceMark {
  const AttendanceMark({
    required this.studentId,
    required this.status,
    this.note,
  });

  final String studentId;
  final String status;
  final String? note;
}

class RegisterClosure {
  const RegisterClosure({required this.classCode, required this.stream});

  final String classCode;
  final String stream;
}

class SchoolDate {
  const SchoolDate({
    required this.id,
    required this.title,
    required this.kind,
    required this.startsOn,
    this.endsOn,
    this.note,
    this.classCode,
    this.stream,
  });

  final String id;
  final String title;
  final String kind;
  final String startsOn;
  final String? endsOn;
  final String? note;
  final String? classCode;
  final String? stream;

  bool get schoolWide => classCode == null || classCode!.isEmpty;
  String get scope => schoolWide ? 'School' : classLabelOf(classCode, stream);
}

class ClassNotice {
  const ClassNotice({
    required this.id,
    required this.classCode,
    required this.stream,
    required this.title,
    required this.createdAt,
    this.body,
  });

  final String id;
  final String classCode;
  final String stream;
  final String title;
  final String? body;
  final String createdAt;

  String get classLabel => classLabelOf(classCode, stream);
}

class ChatThread {
  const ChatThread({
    required this.id,
    required this.kind,
    required this.title,
    required this.classCode,
    required this.stream,
    this.preview,
    this.previewAt,
    this.flagged = false,
    this.hasHidden = false,
  });

  final String id;
  final String kind;
  final String title;
  final String classCode;
  final String stream;
  final String? preview;
  final String? previewAt;
  final bool flagged;
  final bool hasHidden;
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.body,
    required this.createdAt,
    required this.flagged,
    required this.hidden,
    this.senderName,
  });

  final String id;
  final String conversationId;
  final String body;
  final String createdAt;
  final bool flagged;
  final bool hidden;
  final String? senderName;

  ChatMessage copyWith({bool? hidden}) {
    return ChatMessage(
      id: id,
      conversationId: conversationId,
      body: body,
      createdAt: createdAt,
      flagged: flagged,
      hidden: hidden ?? this.hidden,
      senderName: senderName,
    );
  }
}

class GradeBand {
  const GradeBand({
    required this.id,
    required this.section,
    required this.label,
    required this.minScore,
    required this.maxScore,
    required this.sortOrder,
  });

  final String id;
  final String section;
  final String label;
  final double minScore;
  final double maxScore;
  final int sortOrder;

  double get midpoint => (minScore + maxScore) / 2;
}

class PointReason {
  const PointReason({
    required this.id,
    required this.polarity,
    required this.label,
    required this.sortOrder,
  });

  final String id;
  final String polarity;
  final String label;
  final int sortOrder;
}

class PointAward {
  const PointAward({
    required this.id,
    required this.studentId,
    required this.points,
    required this.reasonLabel,
    required this.teacherName,
    required this.createdAt,
    this.reasonId,
    this.voided = false,
  });

  final String id;
  final String studentId;
  final int points;
  final String? reasonId;
  final String reasonLabel;
  final String teacherName;
  final String createdAt;
  final bool voided;
}

class MarkDraft {
  const MarkDraft({this.score, this.bandId, required this.missed});

  final double? score;
  final String? bandId;
  final bool missed;
}

class TeacherSnapshot {
  const TeacherSnapshot({
    required this.unavailable,
    required this.mustResetPassword,
    required this.staff,
    required this.classes,
    required this.subjects,
    required this.pupils,
    required this.papers,
    required this.scores,
    required this.homework,
    required this.resources,
    required this.marks,
    required this.closures,
    required this.dates,
    required this.notices,
    required this.threads,
    required this.bands,
    required this.today,
    this.term,
    this.unavailableMessage,
    this.flaggedMessages = 0,
    this.pointReasons = const [],
    this.pointAwards = const [],
  });

  factory TeacherSnapshot.unavailable(String message) {
    return TeacherSnapshot(
      unavailable: true,
      unavailableMessage: message,
      mustResetPassword: false,
      staff: const StaffProfile(id: '', fullName: 'Teacher'),
      classes: const [],
      subjects: const [],
      pupils: const [],
      papers: const [],
      scores: const [],
      homework: const [],
      resources: const [],
      marks: const [],
      closures: const [],
      dates: const [],
      notices: const [],
      threads: const [],
      bands: const [],
      today: kampalaToday(),
    );
  }

  final bool unavailable;
  final String? unavailableMessage;
  final bool mustResetPassword;
  final StaffProfile staff;
  final TermInfo? term;
  final List<ClassPost> classes;
  final List<SubjectPost> subjects;
  final List<Pupil> pupils;
  final List<Paper> papers;
  final List<Score> scores;
  final List<HomeworkItem> homework;
  final List<ResourceItem> resources;
  final List<AttendanceMark> marks;
  final List<RegisterClosure> closures;
  final List<SchoolDate> dates;
  final List<ClassNotice> notices;
  final List<ChatThread> threads;
  final List<GradeBand> bands;
  final String today;
  final int flaggedMessages;
  final List<PointReason> pointReasons;
  final List<PointAward> pointAwards;

  int pointsFor(String studentId) {
    var total = 0;
    for (final award in pointAwards) {
      if (award.studentId == studentId && !award.voided) total += award.points;
    }
    return total;
  }

  List<ClassPost> get awardClasses {
    final seen = <String, ClassPost>{};
    for (final row in classes) {
      seen['${row.classCode}|${row.stream}'] = row;
    }
    for (final row in subjects) {
      final key = '${row.classCode}|${row.stream}';
      seen.putIfAbsent(
        key,
        () => ClassPost(
          classCode: row.classCode,
          stream: row.stream,
          label: classLabelOf(row.classCode, row.stream),
        ),
      );
    }
    final rows = seen.values.toList();
    rows.sort((a, b) => a.label.compareTo(b.label));
    return rows;
  }

  String get displayName =>
      staff.fullName.trim().isEmpty ? 'Teacher' : staff.fullName;
  bool get classTeacher => classes.isNotEmpty;
  String get roleLabel => classTeacher ? 'Class teacher' : 'Subject teacher';

  bool leadsClass(String classCode, String stream) {
    return classes.any(
      (row) => row.classCode == classCode && row.stream == stream,
    );
  }

  bool teachesPost(String classCode, String stream, String subjectId) {
    return subjects.any(
      (row) =>
          row.classCode == classCode &&
          row.stream == stream &&
          row.subjectId == subjectId,
    );
  }

  List<Pupil> pupilsIn(String classCode, String stream) {
    final rows = pupils
        .where(
          (pupil) => pupil.classCode == classCode && pupil.stream == stream,
        )
        .toList();
    rows.sort((a, b) => a.fullName.compareTo(b.fullName));
    return rows;
  }

  List<Paper> get openPapers => papers.where((paper) => paper.open).toList();

  int get draftCount =>
      homework.where((row) => !row.published).length +
      resources.where((row) => !row.published).length;

  Score? scoreFor(String assessmentId, String studentId) {
    for (final row in scores) {
      if (row.assessmentId == assessmentId && row.studentId == studentId) {
        return row;
      }
    }
    return null;
  }

  AttendanceMark? markFor(String studentId) {
    for (final row in marks) {
      if (row.studentId == studentId) return row;
    }
    return null;
  }

  bool registerClosed(String classCode, String stream) {
    return closures.any(
      (row) => row.classCode == classCode && row.stream == stream,
    );
  }

  Pupil? pupilById(String id) {
    for (final pupil in pupils) {
      if (pupil.id == id) return pupil;
    }
    return null;
  }
}
