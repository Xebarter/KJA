import 'models.dart';

extension ParentChildJson on ParentChild {
  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'campus': campus,
        'classCode': classCode,
        'stream': stream,
        'grade': grade,
        'dateOfBirth': dateOfBirth,
        'studentCode': studentCode,
        'status': status,
        'photoPath': photoPath,
        'photoUrl': photoUrl,
        'portalEnabled': portalEnabled,
        'feeOutstanding': feeOutstanding,
        'reportCount': reportCount,
        'clubCount': clubCount,
      };

  static ParentChild fromJson(Map<String, dynamic> json) => ParentChild(
        id: '${json['id'] ?? ''}',
        fullName: '${json['fullName'] ?? 'Pupil'}',
        campus: _s(json['campus']),
        classCode: _s(json['classCode']),
        stream: _s(json['stream']),
        grade: _s(json['grade']),
        dateOfBirth: _s(json['dateOfBirth']),
        studentCode: _s(json['studentCode']),
        status: _s(json['status']),
        photoPath: _s(json['photoPath']),
        photoUrl: _s(json['photoUrl']),
        portalEnabled: json['portalEnabled'] == true,
        feeOutstanding: _n(json['feeOutstanding']),
        reportCount: _i(json['reportCount']) ?? 0,
        clubCount: _i(json['clubCount']) ?? 0,
      );
}

extension FeeBalanceJson on FeeBalance {
  Map<String, dynamic> toJson() => {
        'id': id,
        'childId': childId,
        'termId': termId,
        'term': term,
        'description': description,
        'amountDue': amountDue,
        'amountPaid': amountPaid,
        'dueOn': dueOn,
      };

  static FeeBalance fromJson(Map<String, dynamic> json) => FeeBalance(
        id: '${json['id'] ?? ''}',
        childId: '${json['childId'] ?? ''}',
        termId: _s(json['termId']),
        term: '${json['term'] ?? 'Term'}',
        description: _s(json['description']),
        amountDue: _n(json['amountDue']),
        amountPaid: _n(json['amountPaid']),
        dueOn: _s(json['dueOn']),
      );
}

extension FeeReceiptJson on FeeReceipt {
  Map<String, dynamic> toJson() => {
        'id': id,
        'childId': childId,
        'receiptNo': receiptNo,
        'amount': amount,
        'paidOn': paidOn,
        'method': method,
      };

  static FeeReceipt fromJson(Map<String, dynamic> json) => FeeReceipt(
        id: '${json['id'] ?? ''}',
        childId: '${json['childId'] ?? ''}',
        receiptNo: '${json['receiptNo'] ?? ''}',
        amount: _n(json['amount']),
        paidOn: '${json['paidOn'] ?? ''}',
        method: '${json['method'] ?? ''}',
      );
}

extension PublishedReportJson on PublishedReport {
  Map<String, dynamic> toJson() => {
        'id': id,
        'studentId': studentId,
        'pupilName': pupilName,
        'term': term,
        'classLabel': classLabel,
        'publishedAt': publishedAt,
      };

  static PublishedReport fromJson(Map<String, dynamic> json) => PublishedReport(
        id: '${json['id'] ?? ''}',
        studentId: '${json['studentId'] ?? ''}',
        pupilName: '${json['pupilName'] ?? 'Pupil'}',
        term: '${json['term'] ?? 'Term'}',
        classLabel: '${json['classLabel'] ?? ''}',
        publishedAt: _s(json['publishedAt']),
      );
}

extension ParentMessageJson on ParentMessage {
  Map<String, dynamic> toJson() => {
        'id': id,
        'subject': subject,
        'body': body,
        'direction': direction,
        'read': read,
        'createdAt': createdAt,
        'threadId': threadId,
        'familyId': familyId,
        'audience': audience,
      };

  static ParentMessage fromJson(Map<String, dynamic> json) => ParentMessage(
        id: '${json['id'] ?? ''}',
        subject: '${json['subject'] ?? ''}',
        body: '${json['body'] ?? ''}',
        direction: '${json['direction'] ?? 'in'}',
        read: json['read'] == true,
        createdAt: '${json['createdAt'] ?? ''}',
        threadId: _s(json['threadId']),
        familyId: _s(json['familyId']),
        audience: _s(json['audience']),
      );
}

extension NoticeJson on Notice {
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'body': body,
        'href': href,
        'read': read,
        'createdAt': createdAt,
      };

  static Notice fromJson(Map<String, dynamic> json) => Notice(
        id: '${json['id'] ?? ''}',
        title: '${json['title'] ?? ''}',
        body: _s(json['body']),
        href: _s(json['href']),
        read: json['read'] == true,
        createdAt: '${json['createdAt'] ?? ''}',
      );
}

extension ClubOfferJson on ClubOffer {
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'campus': campus,
        'meeting': meeting,
        'description': description,
        'category': category,
        'section': section,
        'feeAmount': feeAmount,
        'active': active,
      };

  static ClubOffer fromJson(Map<String, dynamic> json) => ClubOffer(
        id: '${json['id'] ?? ''}',
        title: '${json['title'] ?? 'Club'}',
        campus: _s(json['campus']),
        meeting: _s(json['meeting']),
        description: _s(json['description']),
        category: _s(json['category']),
        section: '${json['section'] ?? 'both'}',
        feeAmount: _n(json['feeAmount']),
        active: json['active'] != false,
      );
}

extension ClubConsentJson on ClubConsent {
  Map<String, dynamic> toJson() => {
        'id': id,
        'clubId': clubId,
        'studentId': studentId,
        'withdrawnAt': withdrawnAt,
      };

  static ClubConsent fromJson(Map<String, dynamic> json) => ClubConsent(
        id: '${json['id'] ?? ''}',
        clubId: '${json['clubId'] ?? ''}',
        studentId: '${json['studentId'] ?? ''}',
        withdrawnAt: _s(json['withdrawnAt']),
      );
}

extension ClubPaymentRecordJson on ClubPaymentRecord {
  Map<String, dynamic> toJson() => {
        'studentId': studentId,
        'clubId': clubId,
        'receiptNo': receiptNo,
      };

  static ClubPaymentRecord fromJson(Map<String, dynamic> json) => ClubPaymentRecord(
        studentId: '${json['studentId'] ?? ''}',
        clubId: '${json['clubId'] ?? ''}',
        receiptNo: _s(json['receiptNo']),
      );
}

extension ApplicationItemJson on ApplicationItem {
  Map<String, dynamic> toJson() => {
        'id': id,
        'childName': childName,
        'status': status,
        'createdAt': createdAt,
        'parentName': parentName,
        'email': email,
        'campus': campus,
        'grade': grade,
      };

  static ApplicationItem fromJson(Map<String, dynamic> json) => ApplicationItem(
        id: '${json['id'] ?? ''}',
        childName: '${json['childName'] ?? 'Child'}',
        status: '${json['status'] ?? 'submitted'}',
        createdAt: '${json['createdAt'] ?? ''}',
        parentName: _s(json['parentName']),
        email: _s(json['email']),
        campus: _s(json['campus']),
        grade: _s(json['grade']),
      );
}

extension SchoolEventJson on SchoolEvent {
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'startsOn': startsOn,
        'endsOn': endsOn,
        'summary': summary,
        'location': location,
      };

  static SchoolEvent fromJson(Map<String, dynamic> json) => SchoolEvent(
        id: '${json['id'] ?? ''}',
        title: '${json['title'] ?? 'Event'}',
        startsOn: _s(json['startsOn']),
        endsOn: _s(json['endsOn']),
        summary: _s(json['summary']),
        location: _s(json['location']),
      );
}

extension ParentProfileJson on ParentProfile {
  Map<String, dynamic> toJson() => {
        'id': id,
        'role': role,
        'fullName': fullName,
        'email': email,
        'phone': phone,
        'address': address,
      };

  static ParentProfile fromJson(Map<String, dynamic> json) => ParentProfile(
        id: '${json['id'] ?? ''}',
        role: '${json['role'] ?? 'parent'}',
        fullName: _s(json['fullName']),
        email: _s(json['email']),
        phone: _s(json['phone']),
        address: _s(json['address']),
      );
}

extension PointAwardJson on PointAward {
  Map<String, dynamic> toJson() => {
        'id': id,
        'studentId': studentId,
        'points': points,
        'reasonLabel': reasonLabel,
        'teacherName': teacherName,
        'createdAt': createdAt,
      };

  static PointAward fromJson(Map<String, dynamic> json) => PointAward(
        id: '${json['id'] ?? ''}',
        studentId: '${json['studentId'] ?? ''}',
        points: _i(json['points']) ?? 0,
        reasonLabel: '${json['reasonLabel'] ?? ''}',
        teacherName: '${json['teacherName'] ?? ''}',
        createdAt: '${json['createdAt'] ?? ''}',
      );
}

extension PortalSnapshotJson on PortalSnapshot {
  Map<String, dynamic> toJson() => {
        'displayName': displayName,
        'email': email,
        'profile': profile.toJson(),
        'familyId': familyId,
        'children': children.map((row) => row.toJson()).toList(),
        'fees': fees.map((row) => row.toJson()).toList(),
        'receipts': receipts.map((row) => row.toJson()).toList(),
        'reports': reports.map((row) => row.toJson()).toList(),
        'messages': messages.map((row) => row.toJson()).toList(),
        'notices': notices.map((row) => row.toJson()).toList(),
        'clubs': clubs.map((row) => row.toJson()).toList(),
        'consents': consents.map((row) => row.toJson()).toList(),
        'clubPayments': clubPayments.map((row) => row.toJson()).toList(),
        'applications': applications.map((row) => row.toJson()).toList(),
        'events': events.map((row) => row.toJson()).toList(),
        'points': points.map((row) => row.toJson()).toList(),
        'mustResetPassword': mustResetPassword,
        'preview': preview,
        'unavailable': unavailable,
      };

  static PortalSnapshot fromJson(Map<String, dynamic> json) => PortalSnapshot(
        displayName: '${json['displayName'] ?? 'Parent'}',
        email: '${json['email'] ?? ''}',
        profile: ParentProfileJson.fromJson(_map(json['profile'])),
        familyId: _s(json['familyId']),
        children: _list(json['children']).map(ParentChildJson.fromJson).toList(),
        fees: _list(json['fees']).map(FeeBalanceJson.fromJson).toList(),
        receipts: _list(json['receipts']).map(FeeReceiptJson.fromJson).toList(),
        reports: _list(json['reports']).map(PublishedReportJson.fromJson).toList(),
        messages: _list(json['messages']).map(ParentMessageJson.fromJson).toList(),
        notices: _list(json['notices']).map(NoticeJson.fromJson).toList(),
        clubs: _list(json['clubs']).map(ClubOfferJson.fromJson).toList(),
        consents: _list(json['consents']).map(ClubConsentJson.fromJson).toList(),
        clubPayments: _list(json['clubPayments']).map(ClubPaymentRecordJson.fromJson).toList(),
        applications: _list(json['applications']).map(ApplicationItemJson.fromJson).toList(),
        events: _list(json['events']).map(SchoolEventJson.fromJson).toList(),
        points: _list(json['points']).map(PointAwardJson.fromJson).toList(),
        mustResetPassword: json['mustResetPassword'] == true,
        preview: json['preview'] == true,
        unavailable: json['unavailable'] == true,
      );
}

String? _s(dynamic value) {
  if (value == null) return null;
  final text = '$value'.trim();
  return text.isEmpty ? null : text;
}

num _n(dynamic value) {
  if (value is num) return value;
  return num.tryParse('$value') ?? 0;
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
