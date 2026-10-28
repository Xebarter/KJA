import 'format.dart';
import 'models.dart';

extension TermInfoJson on TermInfo {
  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'startsOn': startsOn,
        'endsOn': endsOn,
      };

  static TermInfo fromJson(Map<String, dynamic> json) => TermInfo(
        id: '${json['id'] ?? ''}',
        label: '${json['label'] ?? ''}',
        startsOn: _s(json['startsOn']),
        endsOn: _s(json['endsOn']),
      );
}

extension StaffProfileJson on StaffProfile {
  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'title': title,
        'campus': campus,
        'email': email,
        'initials': initials,
        'photoUrl': photoUrl,
        'photoPath': photoPath,
      };

  static StaffProfile fromJson(Map<String, dynamic> json) => StaffProfile(
        id: '${json['id'] ?? ''}',
        fullName: '${json['fullName'] ?? 'Teacher'}',
        title: _s(json['title']),
        campus: _s(json['campus']),
        email: _s(json['email']),
        initials: _s(json['initials']),
        photoUrl: _s(json['photoUrl']),
        photoPath: _s(json['photoPath']),
      );
}

extension ClassPostJson on ClassPost {
  Map<String, dynamic> toJson() => {
        'classCode': classCode,
        'stream': stream,
        'label': label,
      };

  static ClassPost fromJson(Map<String, dynamic> json) => ClassPost(
        classCode: '${json['classCode'] ?? ''}',
        stream: '${json['stream'] ?? ''}',
        label: '${json['label'] ?? ''}',
      );
}

extension SubjectPostJson on SubjectPost {
  Map<String, dynamic> toJson() => {
        'classCode': classCode,
        'stream': stream,
        'subjectId': subjectId,
        'subjectName': subjectName,
        'label': label,
      };

  static SubjectPost fromJson(Map<String, dynamic> json) => SubjectPost(
        classCode: '${json['classCode'] ?? ''}',
        stream: '${json['stream'] ?? ''}',
        subjectId: '${json['subjectId'] ?? ''}',
        subjectName: '${json['subjectName'] ?? ''}',
        label: '${json['label'] ?? ''}',
      );
}

extension PupilJson on Pupil {
  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'classCode': classCode,
        'stream': stream,
        'studentNumber': studentNumber,
        'profileId': profileId,
        'photoPath': photoPath,
        'photoUrl': photoUrl,
      };

  static Pupil fromJson(Map<String, dynamic> json) => Pupil(
        id: '${json['id'] ?? ''}',
        fullName: '${json['fullName'] ?? 'Pupil'}',
        classCode: '${json['classCode'] ?? ''}',
        stream: '${json['stream'] ?? ''}',
        studentNumber: _s(json['studentNumber']),
        profileId: _s(json['profileId']),
        photoPath: _s(json['photoPath']),
        photoUrl: _s(json['photoUrl']),
      );
}

extension PaperJson on Paper {
  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'classCode': classCode,
        'stream': stream,
        'subjectId': subjectId,
        'subjectName': subjectName,
        'kind': kind,
        'maxScore': maxScore,
        'status': status,
        'heldOn': heldOn,
      };

  static Paper fromJson(Map<String, dynamic> json) => Paper(
        id: '${json['id'] ?? ''}',
        name: '${json['name'] ?? 'Markbook'}',
        classCode: '${json['classCode'] ?? ''}',
        stream: '${json['stream'] ?? ''}',
        subjectId: '${json['subjectId'] ?? ''}',
        subjectName: '${json['subjectName'] ?? ''}',
        kind: '${json['kind'] ?? 'test'}',
        maxScore: _d(json['maxScore']) ?? 100,
        status: '${json['status'] ?? 'open'}',
        heldOn: _s(json['heldOn']),
      );
}

extension ScoreJson on Score {
  Map<String, dynamic> toJson() => {
        'assessmentId': assessmentId,
        'studentId': studentId,
        'score': score,
        'missed': missed,
      };

  static Score fromJson(Map<String, dynamic> json) => Score(
        assessmentId: '${json['assessmentId'] ?? ''}',
        studentId: '${json['studentId'] ?? ''}',
        score: _d(json['score']),
        missed: json['missed'] == true,
      );
}

extension HomeworkItemJson on HomeworkItem {
  Map<String, dynamic> toJson() => {
        'id': id,
        'classCode': classCode,
        'stream': stream,
        'subjectId': subjectId,
        'subjectName': subjectName,
        'title': title,
        'instructions': instructions,
        'dueOn': dueOn,
        'published': published,
        'doneCount': doneCount,
      };

  static HomeworkItem fromJson(Map<String, dynamic> json) => HomeworkItem(
        id: '${json['id'] ?? ''}',
        classCode: '${json['classCode'] ?? ''}',
        stream: '${json['stream'] ?? ''}',
        subjectId: '${json['subjectId'] ?? ''}',
        subjectName: '${json['subjectName'] ?? ''}',
        title: '${json['title'] ?? ''}',
        instructions: _s(json['instructions']),
        dueOn: '${json['dueOn'] ?? ''}',
        published: json['published'] == true,
        doneCount: _i(json['doneCount']) ?? 0,
      );
}

extension ResourceItemJson on ResourceItem {
  Map<String, dynamic> toJson() => {
        'id': id,
        'classCode': classCode,
        'stream': stream,
        'subjectId': subjectId,
        'subjectName': subjectName,
        'kind': kind,
        'title': title,
        'body': body,
        'linkUrl': linkUrl,
        'filePath': filePath,
        'fileName': fileName,
        'published': published,
      };

  static ResourceItem fromJson(Map<String, dynamic> json) => ResourceItem(
        id: '${json['id'] ?? ''}',
        classCode: '${json['classCode'] ?? ''}',
        stream: '${json['stream'] ?? ''}',
        subjectId: '${json['subjectId'] ?? ''}',
        subjectName: '${json['subjectName'] ?? ''}',
        kind: '${json['kind'] ?? 'note'}',
        title: '${json['title'] ?? ''}',
        body: _s(json['body']),
        linkUrl: _s(json['linkUrl']),
        filePath: _s(json['filePath']),
        fileName: _s(json['fileName']),
        published: json['published'] == true,
      );
}

extension AttendanceMarkJson on AttendanceMark {
  Map<String, dynamic> toJson() => {
        'studentId': studentId,
        'status': status,
        'note': note,
      };

  static AttendanceMark fromJson(Map<String, dynamic> json) => AttendanceMark(
        studentId: '${json['studentId'] ?? ''}',
        status: '${json['status'] ?? 'present'}',
        note: _s(json['note']),
      );
}

extension RegisterClosureJson on RegisterClosure {
  Map<String, dynamic> toJson() => {
        'classCode': classCode,
        'stream': stream,
      };

  static RegisterClosure fromJson(Map<String, dynamic> json) => RegisterClosure(
        classCode: '${json['classCode'] ?? ''}',
        stream: '${json['stream'] ?? ''}',
      );
}

extension SchoolDateJson on SchoolDate {
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'kind': kind,
        'startsOn': startsOn,
        'endsOn': endsOn,
        'note': note,
        'classCode': classCode,
        'stream': stream,
      };

  static SchoolDate fromJson(Map<String, dynamic> json) => SchoolDate(
        id: '${json['id'] ?? ''}',
        title: '${json['title'] ?? ''}',
        kind: '${json['kind'] ?? 'event'}',
        startsOn: '${json['startsOn'] ?? ''}',
        endsOn: _s(json['endsOn']),
        note: _s(json['note']),
        classCode: _s(json['classCode']),
        stream: _s(json['stream']),
      );
}

extension ClassNoticeJson on ClassNotice {
  Map<String, dynamic> toJson() => {
        'id': id,
        'classCode': classCode,
        'stream': stream,
        'title': title,
        'body': body,
        'createdAt': createdAt,
      };

  static ClassNotice fromJson(Map<String, dynamic> json) => ClassNotice(
        id: '${json['id'] ?? ''}',
        classCode: '${json['classCode'] ?? ''}',
        stream: '${json['stream'] ?? ''}',
        title: '${json['title'] ?? ''}',
        body: _s(json['body']),
        createdAt: '${json['createdAt'] ?? ''}',
      );
}

extension ChatThreadJson on ChatThread {
  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'title': title,
        'classCode': classCode,
        'stream': stream,
        'preview': preview,
        'previewAt': previewAt,
        'flagged': flagged,
        'hasHidden': hasHidden,
      };

  static ChatThread fromJson(Map<String, dynamic> json) => ChatThread(
        id: '${json['id'] ?? ''}',
        kind: '${json['kind'] ?? 'pupil'}',
        title: '${json['title'] ?? 'Chat'}',
        classCode: '${json['classCode'] ?? ''}',
        stream: '${json['stream'] ?? ''}',
        preview: _s(json['preview']),
        previewAt: _s(json['previewAt']),
        flagged: json['flagged'] == true,
        hasHidden: json['hasHidden'] == true,
      );
}

extension ChatMessageJson on ChatMessage {
  Map<String, dynamic> toJson() => {
        'id': id,
        'conversationId': conversationId,
        'body': body,
        'createdAt': createdAt,
        'flagged': flagged,
        'hidden': hidden,
        'senderName': senderName,
      };

  static ChatMessage fromJson(Map<String, dynamic> json) => ChatMessage(
        id: '${json['id'] ?? ''}',
        conversationId: '${json['conversationId'] ?? ''}',
        body: '${json['body'] ?? ''}',
        createdAt: '${json['createdAt'] ?? ''}',
        flagged: json['flagged'] == true,
        hidden: json['hidden'] == true,
        senderName: _s(json['senderName']),
      );
}

extension GradeBandJson on GradeBand {
  Map<String, dynamic> toJson() => {
        'id': id,
        'section': section,
        'label': label,
        'minScore': minScore,
        'maxScore': maxScore,
        'sortOrder': sortOrder,
      };

  static GradeBand fromJson(Map<String, dynamic> json) => GradeBand(
        id: '${json['id'] ?? ''}',
        section: '${json['section'] ?? 'primary'}',
        label: '${json['label'] ?? ''}',
        minScore: _d(json['minScore']) ?? 0,
        maxScore: _d(json['maxScore']) ?? 0,
        sortOrder: _i(json['sortOrder']) ?? 0,
      );
}

extension PointReasonJson on PointReason {
  Map<String, dynamic> toJson() => {
        'id': id,
        'polarity': polarity,
        'label': label,
        'sortOrder': sortOrder,
      };

  static PointReason fromJson(Map<String, dynamic> json) => PointReason(
        id: '${json['id'] ?? ''}',
        polarity: '${json['polarity'] ?? ''}',
        label: '${json['label'] ?? ''}',
        sortOrder: _i(json['sortOrder']) ?? 0,
      );
}

extension PointAwardJson on PointAward {
  Map<String, dynamic> toJson() => {
        'id': id,
        'studentId': studentId,
        'points': points,
        'reasonId': reasonId,
        'reasonLabel': reasonLabel,
        'teacherName': teacherName,
        'createdAt': createdAt,
        'voided': voided,
      };

  static PointAward fromJson(Map<String, dynamic> json) => PointAward(
        id: '${json['id'] ?? ''}',
        studentId: '${json['studentId'] ?? ''}',
        points: _i(json['points']) ?? 0,
        reasonId: _s(json['reasonId']),
        reasonLabel: '${json['reasonLabel'] ?? ''}',
        teacherName: '${json['teacherName'] ?? 'Teacher'}',
        createdAt: '${json['createdAt'] ?? ''}',
        voided: json['voided'] == true,
      );
}

extension TeacherSnapshotJson on TeacherSnapshot {
  Map<String, dynamic> toJson() => {
        'unavailable': unavailable,
        'unavailableMessage': unavailableMessage,
        'mustResetPassword': mustResetPassword,
        'staff': staff.toJson(),
        'term': term?.toJson(),
        'classes': classes.map((row) => row.toJson()).toList(),
        'subjects': subjects.map((row) => row.toJson()).toList(),
        'pupils': pupils.map((row) => row.toJson()).toList(),
        'papers': papers.map((row) => row.toJson()).toList(),
        'scores': scores.map((row) => row.toJson()).toList(),
        'homework': homework.map((row) => row.toJson()).toList(),
        'resources': resources.map((row) => row.toJson()).toList(),
        'marks': marks.map((row) => row.toJson()).toList(),
        'closures': closures.map((row) => row.toJson()).toList(),
        'dates': dates.map((row) => row.toJson()).toList(),
        'notices': notices.map((row) => row.toJson()).toList(),
        'threads': threads.map((row) => row.toJson()).toList(),
        'bands': bands.map((row) => row.toJson()).toList(),
        'today': today,
        'flaggedMessages': flaggedMessages,
        'pointReasons': pointReasons.map((row) => row.toJson()).toList(),
        'pointAwards': pointAwards.map((row) => row.toJson()).toList(),
      };

  static TeacherSnapshot fromJson(Map<String, dynamic> json) {
    return TeacherSnapshot(
      unavailable: json['unavailable'] == true,
      unavailableMessage: _s(json['unavailableMessage']),
      mustResetPassword: json['mustResetPassword'] == true,
      staff: StaffProfileJson.fromJson(_map(json['staff'])),
      term: json['term'] is Map
          ? TermInfoJson.fromJson(_map(json['term']))
          : null,
      classes: _list(json['classes']).map(ClassPostJson.fromJson).toList(),
      subjects: _list(json['subjects']).map(SubjectPostJson.fromJson).toList(),
      pupils: _list(json['pupils']).map(PupilJson.fromJson).toList(),
      papers: _list(json['papers']).map(PaperJson.fromJson).toList(),
      scores: _list(json['scores']).map(ScoreJson.fromJson).toList(),
      homework: _list(json['homework']).map(HomeworkItemJson.fromJson).toList(),
      resources: _list(json['resources']).map(ResourceItemJson.fromJson).toList(),
      marks: _list(json['marks']).map(AttendanceMarkJson.fromJson).toList(),
      closures: _list(json['closures']).map(RegisterClosureJson.fromJson).toList(),
      dates: _list(json['dates']).map(SchoolDateJson.fromJson).toList(),
      notices: _list(json['notices']).map(ClassNoticeJson.fromJson).toList(),
      threads: _list(json['threads']).map(ChatThreadJson.fromJson).toList(),
      bands: _list(json['bands']).map(GradeBandJson.fromJson).toList(),
      today: '${json['today'] ?? kampalaToday()}',
      flaggedMessages: _i(json['flaggedMessages']) ?? 0,
      pointReasons: _list(json['pointReasons']).map(PointReasonJson.fromJson).toList(),
      pointAwards: _list(json['pointAwards']).map(PointAwardJson.fromJson).toList(),
    );
  }

  TeacherSnapshot copyWith({
    List<Score>? scores,
    List<AttendanceMark>? marks,
    List<RegisterClosure>? closures,
    List<HomeworkItem>? homework,
    List<ResourceItem>? resources,
    List<SchoolDate>? dates,
    List<ClassNotice>? notices,
    List<Paper>? papers,
    List<Pupil>? pupils,
    List<ChatThread>? threads,
    StaffProfile? staff,
    int? flaggedMessages,
    List<PointAward>? pointAwards,
    List<PointReason>? pointReasons,
  }) {
    return TeacherSnapshot(
      unavailable: unavailable,
      unavailableMessage: unavailableMessage,
      mustResetPassword: mustResetPassword,
      staff: staff ?? this.staff,
      term: term,
      classes: classes,
      subjects: subjects,
      pupils: pupils ?? this.pupils,
      papers: papers ?? this.papers,
      scores: scores ?? this.scores,
      homework: homework ?? this.homework,
      resources: resources ?? this.resources,
      marks: marks ?? this.marks,
      closures: closures ?? this.closures,
      dates: dates ?? this.dates,
      notices: notices ?? this.notices,
      threads: threads ?? this.threads,
      bands: bands,
      today: today,
      flaggedMessages: flaggedMessages ?? this.flaggedMessages,
      pointReasons: pointReasons ?? this.pointReasons,
      pointAwards: pointAwards ?? this.pointAwards,
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
  if (value is num) return value.toDouble();
  return double.tryParse('$value');
}

int? _i(dynamic value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse('$value');
}

Map<String, dynamic> _map(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return const {};
}

List<Map<String, dynamic>> _list(dynamic value) {
  if (value is! List) return const [];
  return [
    for (final row in value)
      if (row is Map) Map<String, dynamic>.from(row),
  ];
}
