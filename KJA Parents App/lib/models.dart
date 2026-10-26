import 'format.dart';

class ParentChild {
  const ParentChild({
    required this.id,
    required this.fullName,
    this.campus,
    this.classCode,
    this.stream,
    this.grade,
    this.dateOfBirth,
    this.studentCode,
    this.status,
    this.photoPath,
    this.photoUrl,
    this.portalEnabled = false,
    this.feeOutstanding = 0,
    this.reportCount = 0,
    this.clubCount = 0,
  });

  final String id;
  final String fullName;
  final String? campus;
  final String? classCode;
  final String? stream;
  final String? grade;
  final String? dateOfBirth;
  final String? studentCode;
  final String? status;
  final String? photoPath;
  final String? photoUrl;
  final bool portalEnabled;
  final num feeOutstanding;
  final int reportCount;
  final int clubCount;

  String get classLabel => grade?.trim().isNotEmpty == true ? grade! : classLabelOf(classCode, stream);

  bool get isActive => (status ?? 'active').toLowerCase() == 'active';
}

class FeeBalance {
  const FeeBalance({
    required this.id,
    required this.childId,
    required this.term,
    required this.amountDue,
    required this.amountPaid,
    this.termId,
    this.description,
    this.dueOn,
  });

  final String id;
  final String childId;
  final String? termId;
  final String term;
  final String? description;
  final num amountDue;
  final num amountPaid;
  final String? dueOn;

  num get balance => amountDue - amountPaid;
  bool get hasDue => balance > 0;
}

class FeeReceipt {
  const FeeReceipt({
    required this.id,
    required this.childId,
    required this.receiptNo,
    required this.amount,
    required this.paidOn,
    required this.method,
  });

  final String id;
  final String childId;
  final String receiptNo;
  final num amount;
  final String paidOn;
  final String method;
}

class PublishedReport {
  const PublishedReport({
    required this.id,
    required this.studentId,
    required this.pupilName,
    required this.term,
    required this.classLabel,
    this.publishedAt,
  });

  final String id;
  final String studentId;
  final String pupilName;
  final String term;
  final String classLabel;
  final String? publishedAt;
}

class ReportLine {
  const ReportLine({
    required this.subject,
    this.grade,
    this.remark,
    this.teacher,
  });

  final String subject;
  final String? grade;
  final String? remark;
  final String? teacher;
}

class ReportDetail {
  const ReportDetail({
    required this.card,
    this.lines = const [],
    this.closingComment,
    this.activities = const [],
  });

  final PublishedReport card;
  final List<ReportLine> lines;
  final String? closingComment;
  final List<String> activities;
}

class ParentMessage {
  const ParentMessage({
    required this.id,
    required this.subject,
    required this.body,
    required this.direction,
    required this.read,
    required this.createdAt,
    this.threadId,
    this.familyId,
    this.audience,
  });

  final String id;
  final String subject;
  final String body;
  final String direction; // in | out
  final bool read;
  final String createdAt;
  final String? threadId;
  final String? familyId;
  final String? audience;

  bool get fromSchool => direction == 'in';

  ParentMessage copyWith({bool? read}) => ParentMessage(
        id: id,
        subject: subject,
        body: body,
        direction: direction,
        read: read ?? this.read,
        createdAt: createdAt,
        threadId: threadId,
        familyId: familyId,
        audience: audience,
      );
}

class CommThread {
  const CommThread({
    required this.key,
    required this.subject,
    required this.items,
    required this.last,
    required this.unread,
    required this.awaitingSchool,
    required this.fromSchool,
    this.threadId,
  });

  final String key;
  final String? threadId;
  final String subject;
  final List<ParentMessage> items;
  final ParentMessage last;
  final int unread;
  final bool awaitingSchool;
  final bool fromSchool;
}

class Notice {
  const Notice({
    required this.id,
    required this.title,
    required this.createdAt,
    this.body,
    this.href,
    this.read = false,
  });

  final String id;
  final String title;
  final String? body;
  final String? href;
  final bool read;
  final String createdAt;

  Notice copyWith({bool? read}) => Notice(
        id: id,
        title: title,
        body: body,
        href: href,
        read: read ?? this.read,
        createdAt: createdAt,
      );
}

class ClubOffer {
  const ClubOffer({
    required this.id,
    required this.title,
    this.campus,
    this.meeting,
    this.description,
    this.category,
    this.section = 'both',
    this.feeAmount = 0,
    this.active = true,
  });

  final String id;
  final String title;
  final String? campus;
  final String? meeting;
  final String? description;
  final String? category;
  final String section;
  final num feeAmount;
  final bool active;

  bool get hasFee => feeAmount > 0;
}

class ClubConsent {
  const ClubConsent({
    required this.id,
    required this.clubId,
    required this.studentId,
    this.withdrawnAt,
  });

  final String id;
  final String clubId;
  final String studentId;
  final String? withdrawnAt;

  bool get isOpen => withdrawnAt == null || withdrawnAt!.isEmpty;
}

class ClubPaymentRecord {
  const ClubPaymentRecord({
    required this.studentId,
    required this.clubId,
    this.receiptNo,
  });

  final String studentId;
  final String clubId;
  final String? receiptNo;
}

/// One club fee line in the parent's checkout cart (may span children).
class ClubCartLine {
  const ClubCartLine({required this.studentId, required this.clubId});

  final String studentId;
  final String clubId;

  String get key => '$studentId:$clubId';

  @override
  bool operator ==(Object other) =>
      other is ClubCartLine && other.studentId == studentId && other.clubId == clubId;

  @override
  int get hashCode => Object.hash(studentId, clubId);
}

class ApplicationItem {
  const ApplicationItem({
    required this.id,
    required this.childName,
    required this.status,
    required this.createdAt,
    this.parentName,
    this.email,
    this.campus,
    this.grade,
  });

  final String id;
  final String childName;
  final String status;
  final String createdAt;
  final String? parentName;
  final String? email;
  final String? campus;
  final String? grade;
}

class SchoolEvent {
  const SchoolEvent({
    required this.id,
    required this.title,
    this.startsOn,
    this.endsOn,
    this.summary,
    this.location,
  });

  final String id;
  final String title;
  final String? startsOn;
  final String? endsOn;
  final String? summary;
  final String? location;
}

class ParentProfile {
  const ParentProfile({
    required this.id,
    required this.role,
    this.fullName,
    this.email,
    this.phone,
    this.address,
  });

  final String id;
  final String role;
  final String? fullName;
  final String? email;
  final String? phone;
  final String? address;
}

class PointAward {
  const PointAward({
    required this.id,
    required this.studentId,
    required this.points,
    required this.reasonLabel,
    required this.teacherName,
    required this.createdAt,
  });

  final String id;
  final String studentId;
  final int points;
  final String reasonLabel;
  final String teacherName;
  final String createdAt;
}

class PortalSnapshot {
  const PortalSnapshot({
    required this.displayName,
    required this.email,
    required this.profile,
    this.familyId,
    this.children = const [],
    this.fees = const [],
    this.receipts = const [],
    this.reports = const [],
    this.messages = const [],
    this.notices = const [],
    this.clubs = const [],
    this.consents = const [],
    this.clubPayments = const [],
    this.applications = const [],
    this.events = const [],
    this.points = const [],
    this.mustResetPassword = false,
    this.preview = false,
    this.unavailable = false,
  });

  final String displayName;
  final String email;
  final ParentProfile profile;
  final String? familyId;
  final List<ParentChild> children;
  final List<FeeBalance> fees;
  final List<FeeReceipt> receipts;
  final List<PublishedReport> reports;
  final List<ParentMessage> messages;
  final List<Notice> notices;
  final List<ClubOffer> clubs;
  final List<ClubConsent> consents;
  final List<ClubPaymentRecord> clubPayments;
  final List<ApplicationItem> applications;
  final List<SchoolEvent> events;
  final List<PointAward> points;
  final bool mustResetPassword;
  final bool preview;
  final bool unavailable;

  int get unreadNotices => notices.where((n) => !n.read).length;

  int get unreadMessages => messages.where((m) => m.direction == 'in' && !m.read).length;

  num get totalOutstanding => fees.fold<num>(0, (sum, f) => sum + (f.balance > 0 ? f.balance : 0));

  List<CommThread> get threads {
    final map = <String, List<ParentMessage>>{};
    for (final message in messages) {
      final key = (message.threadId?.trim().isNotEmpty == true) ? message.threadId! : threadKey(message.subject);
      map.putIfAbsent(key, () => []).add(message);
    }
    final threads = map.entries.map((entry) {
      final items = [...entry.value]..sort((a, b) => a.createdAt.compareTo(b.createdAt));
      final last = items.last;
      final hasOut = items.any((m) => m.direction == 'out');
      final hasIn = items.any((m) => m.direction == 'in');
      String? tid;
      for (final m in items) {
        final id = m.threadId?.trim();
        if (id != null && id.isNotEmpty) {
          tid = id;
          break;
        }
      }
      return CommThread(
        key: entry.key,
        threadId: tid,
        subject: cleanSubject(items.first.subject),
        items: items,
        last: last,
        unread: items.where((m) => m.direction == 'in' && !m.read).length,
        awaitingSchool: hasOut && !hasIn,
        fromSchool: hasIn,
      );
    }).toList()
      ..sort((a, b) => b.last.createdAt.compareTo(a.last.createdAt));
    return threads;
  }

  String? faceUrl(String? studentId) {
    if (studentId == null) return null;
    for (final child in children) {
      if (child.id == studentId) return child.photoUrl;
    }
    return null;
  }

  PortalSnapshot copyWith({
    String? displayName,
    String? email,
    ParentProfile? profile,
    String? familyId,
    List<ParentChild>? children,
    List<FeeBalance>? fees,
    List<FeeReceipt>? receipts,
    List<PublishedReport>? reports,
    List<ParentMessage>? messages,
    List<Notice>? notices,
    List<ClubOffer>? clubs,
    List<ClubConsent>? consents,
    List<ClubPaymentRecord>? clubPayments,
    List<ApplicationItem>? applications,
    List<SchoolEvent>? events,
    List<PointAward>? points,
    bool? mustResetPassword,
    bool? preview,
    bool? unavailable,
  }) {
    return PortalSnapshot(
      displayName: displayName ?? this.displayName,
      email: email ?? this.email,
      profile: profile ?? this.profile,
      familyId: familyId ?? this.familyId,
      children: children ?? this.children,
      fees: fees ?? this.fees,
      receipts: receipts ?? this.receipts,
      reports: reports ?? this.reports,
      messages: messages ?? this.messages,
      notices: notices ?? this.notices,
      clubs: clubs ?? this.clubs,
      consents: consents ?? this.consents,
      clubPayments: clubPayments ?? this.clubPayments,
      applications: applications ?? this.applications,
      events: events ?? this.events,
      points: points ?? this.points,
      mustResetPassword: mustResetPassword ?? this.mustResetPassword,
      preview: preview ?? this.preview,
      unavailable: unavailable ?? this.unavailable,
    );
  }
}
