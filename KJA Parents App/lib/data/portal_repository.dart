import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../config.dart';
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
  static const _uuid = Uuid();

  Future<PortalSnapshot> load() async {
    final user = _db.auth.currentUser;
    if (user == null) throw PortalException('Sign in to continue.');

    Map<String, dynamic>? profileRow;
    // Profile + claim RPCs in parallel — sequential round-trips were the slow boot path.
    await Future.wait<void>([
      () async {
        try {
          await _db.from('profiles').upsert({
            'id': user.id,
            'role': 'parent',
            'email': user.email,
            'full_name': user.userMetadata?['full_name'] ?? user.userMetadata?['name'],
          }, onConflict: 'id', ignoreDuplicates: true);
          profileRow = await _one(_db.from('profiles').select('*').eq('id', user.id).limit(1));
        } catch (_) {}
      }(),
      () async {
        try {
          await _db.rpc('claim_guardian_links');
        } catch (_) {}
      }(),
      () async {
        try {
          await _db.rpc('claim_application_links');
        } catch (_) {}
      }(),
    ]);

    final role = (profileRow?['role'] as String?)?.trim();
    if (role == 'student') {
      throw PortalException('This account is a pupil login. Use the KJA Pupils app instead.');
    }

    final allowed = await _isParentGuardian(user.id, role);
    if (!allowed) {
      final name = (profileRow?['full_name'] as String?)?.trim();
      return PortalSnapshot(
        displayName: (name == null || name.isEmpty) ? 'Parent' : name,
        email: (profileRow?['email'] as String?) ?? user.email ?? '',
        profile: ParentProfile(
          id: user.id,
          role: role ?? 'parent',
          fullName: profileRow?['full_name'] as String?,
          email: (profileRow?['email'] as String?) ?? user.email,
          phone: profileRow?['phone'] as String?,
          address: profileRow?['address'] as String?,
        ),
        unavailable: true,
        mustResetPassword: _flag(user.userMetadata?['must_reset_password']),
      );
    }

    final studentIds = await _myStudentIds();
    final students = studentIds.isEmpty ? <Map<String, dynamic>>[] : await _loadStudents(studentIds);

    final settled = await Future.wait<Object?>([
      _rows(_db.from('parent_messages').select('*').eq('user_id', user.id).order('created_at', ascending: false)),
      _rows(_db.from('notifications').select('*').eq('user_id', user.id).order('created_at', ascending: false)),
      _rows(_db.from('clubs').select('*').eq('published', true).order('title')),
      _rows(_db.from('applications').select('*').eq('user_id', user.id).order('created_at', ascending: false)),
      _familyId(user.id),
      studentIds.isEmpty
          ? Future.value(<Map<String, dynamic>>[])
          : _rows(
              _db
                  .from('club_consents')
                  .select('id, club_id, student_id, withdrawn_at')
                  .inFilter('student_id', studentIds)
                  .isFilter('withdrawn_at', null),
            ),
      studentIds.isEmpty
          ? Future.value(<Map<String, dynamic>>[])
          : _rows(
              _db
                  .from('report_cards')
                  .select('id, student_id, class_code, stream, published_at, fee_terms(label)')
                  .eq('status', 'published')
                  .inFilter('student_id', studentIds)
                  .order('published_at', ascending: false),
            ),
      studentIds.isEmpty
          ? Future.value(<Map<String, dynamic>>[])
          : _rows(_db.from('fee_terms').select('id, label, is_current')),
      studentIds.isEmpty
          ? Future.value(<Map<String, dynamic>>[])
          : _rows(
              _db
                  .from('student_term_balances')
                  .select('student_id, term_id, invoiced, paid, balance, due_on')
                  .inFilter('student_id', studentIds),
            ),
      studentIds.isEmpty
          ? Future.value(<Map<String, dynamic>>[])
          : _rows(
              _db
                  .from('payments')
                  .select('id, receipt_no, student_id, amount, method, paid_on')
                  .inFilter('student_id', studentIds)
                  .isFilter('voided_at', null)
                  .order('paid_on', ascending: false),
            ),
      _one(_db.from('fee_terms').select('id').eq('is_current', true).limit(1)),
    ]);

    final messageRows = settled[0] as List<Map<String, dynamic>>;
    final noticeRows = settled[1] as List<Map<String, dynamic>>;
    final clubRows = settled[2] as List<Map<String, dynamic>>;
    final appRows = settled[3] as List<Map<String, dynamic>>;
    final familyId = settled[4] as String?;
    final consentRows = settled[5] as List<Map<String, dynamic>>;
    final cardRows = settled[6] as List<Map<String, dynamic>>;
    final termRows = settled[7] as List<Map<String, dynamic>>;
    final balanceRows = settled[8] as List<Map<String, dynamic>>;
    final paymentRows = settled[9] as List<Map<String, dynamic>>;
    final currentTerm = settled[10] as Map<String, dynamic>?;
    final currentTermId = currentTerm?['id']?.toString();

    final photoPaths = <String, String?>{
      for (final s in students) s['id'].toString(): s['photo_path'] as String?,
    };

    final extras = await Future.wait<Object?>([
      (studentIds.isEmpty || currentTermId == null)
          ? Future.value(<Map<String, dynamic>>[])
          : _rows(
              _db
                  .from('club_payments')
                  .select('student_id, club_id, receipt_no')
                  .eq('term_id', currentTermId)
                  .isFilter('voided_at', null)
                  .inFilter('student_id', studentIds),
            ),
      _resolvePhotoUrls(photoPaths),
      _loadPointAwards(studentIds),
      _loadFamilyEvents(students, currentTermId),
    ]);
    final clubPaymentRows = extras[0] as List<Map<String, dynamic>>;
    final photoUrls = extras[1] as Map<String, String>;
    final pointAwards = extras[2] as List<PointAward>;
    final familyEvents = extras[3] as List<SchoolEvent>;

    final termLabel = <String, String>{
      for (final row in termRows)
        if (row['id'] != null) row['id'].toString(): (row['label'] as String?) ?? 'Term',
    };
    final pupilName = <String, String>{
      for (final s in students) s['id'].toString(): (s['full_name'] as String?) ?? 'Pupil',
    };

    final fees = balanceRows
        .where((row) => (_num(row['invoiced']) > 0) || (_num(row['paid']) > 0))
        .map(
          (row) => FeeBalance(
            id: '${row['student_id']}:${row['term_id']}',
            childId: row['student_id'].toString(),
            termId: row['term_id']?.toString(),
            term: termLabel[row['term_id']?.toString()] ?? 'Term',
            amountDue: _num(row['invoiced']),
            amountPaid: _num(row['paid']),
            dueOn: row['due_on'] as String?,
          ),
        )
        .toList();

    final outstandingByChild = <String, num>{};
    for (final fee in fees) {
      if (fee.balance > 0) {
        outstandingByChild[fee.childId] = (outstandingByChild[fee.childId] ?? 0) + fee.balance;
      }
    }
    final reportCountByChild = <String, int>{};
    for (final card in cardRows) {
      final sid = card['student_id']?.toString() ?? '';
      if (sid.isEmpty) continue;
      reportCountByChild[sid] = (reportCountByChild[sid] ?? 0) + 1;
    }
    final clubCountByChild = <String, int>{};
    for (final consent in consentRows) {
      final sid = consent['student_id']?.toString() ?? '';
      if (sid.isEmpty) continue;
      clubCountByChild[sid] = (clubCountByChild[sid] ?? 0) + 1;
    }

    final children = students.map((s) {
      final id = s['id'].toString();
      return ParentChild(
        id: id,
        fullName: (s['full_name'] as String?) ?? 'Pupil',
        campus: s['campus'] as String?,
        classCode: s['class_code'] as String?,
        stream: s['stream'] as String?,
        grade: classLabelOf(s['class_code'] as String?, s['stream'] as String?),
        dateOfBirth: s['date_of_birth'] as String?,
        studentCode: s['student_number'] as String?,
        status: s['status'] as String?,
        photoPath: s['photo_path'] as String?,
        photoUrl: photoUrls[id] ?? PupilPhotoUrl.siteProxy(studentId: id, photoPath: s['photo_path'] as String?),
        portalEnabled: s['profile_id'] != null,
        feeOutstanding: outstandingByChild[id] ?? 0,
        reportCount: reportCountByChild[id] ?? 0,
        clubCount: clubCountByChild[id] ?? 0,
      );
    }).toList()
      ..sort((a, b) {
        final active = (a.isActive ? 0 : 1).compareTo(b.isActive ? 0 : 1);
        if (active != 0) return active;
        return a.fullName.compareTo(b.fullName);
      });

    final reports = cardRows.map((card) {
      final termRaw = card['fee_terms'];
      String term = 'Term';
      if (termRaw is Map) {
        term = (termRaw['label'] as String?) ?? 'Term';
      } else if (termRaw is List && termRaw.isNotEmpty) {
        final first = termRaw.first;
        if (first is Map) term = (first['label'] as String?) ?? 'Term';
      }
      final sid = card['student_id'].toString();
      return PublishedReport(
        id: card['id'].toString(),
        studentId: sid,
        pupilName: pupilName[sid] ?? 'Pupil',
        term: term,
        classLabel: classLabelOf(card['class_code'] as String?, card['stream'] as String?),
        publishedAt: card['published_at'] as String?,
      );
    }).toList();

    final name = (profileRow?['full_name'] as String?)?.trim();
    return PortalSnapshot(
      displayName: (name == null || name.isEmpty) ? 'Parent' : name,
      email: (profileRow?['email'] as String?) ?? user.email ?? '',
      profile: ParentProfile(
        id: user.id,
        role: role ?? 'parent',
        fullName: profileRow?['full_name'] as String?,
        email: (profileRow?['email'] as String?) ?? user.email,
        phone: profileRow?['phone'] as String?,
        address: profileRow?['address'] as String?,
      ),
      familyId: familyId,
      children: children,
      fees: fees,
      receipts: paymentRows
          .map(
            (p) => FeeReceipt(
              id: p['id'].toString(),
              childId: p['student_id'].toString(),
              receiptNo: (p['receipt_no'] as String?) ?? '',
              amount: _num(p['amount']),
              paidOn: (p['paid_on'] as String?) ?? '',
              method: _methodLabel(p['method'] as String?),
            ),
          )
          .toList(),
      reports: reports,
      messages: messageRows.map(_message).toList(),
      notices: noticeRows.map(_notice).toList(),
      clubs: clubRows
          .where((c) => c['active'] != false)
          .map(
            (c) => ClubOffer(
              id: c['id'].toString(),
              title: (c['title'] as String?) ?? 'Club',
              campus: c['campus'] as String?,
              meeting: c['meeting'] as String?,
              description: c['description'] as String?,
              category: c['category'] as String?,
              section: (c['section'] as String?) ?? 'both',
              feeAmount: _num(c['fee_amount']),
              active: c['active'] != false,
            ),
          )
          .toList(),
      consents: consentRows
          .map(
            (c) => ClubConsent(
              id: c['id'].toString(),
              clubId: c['club_id'].toString(),
              studentId: c['student_id'].toString(),
              withdrawnAt: c['withdrawn_at'] as String?,
            ),
          )
          .toList(),
      clubPayments: clubPaymentRows
          .map(
            (c) => ClubPaymentRecord(
              studentId: c['student_id'].toString(),
              clubId: c['club_id'].toString(),
              receiptNo: c['receipt_no'] as String?,
            ),
          )
          .toList(),
      applications: appRows
          .map(
            (a) => ApplicationItem(
              id: a['id'].toString(),
              childName: (a['child_name'] as String?) ?? 'Child',
              status: (a['status'] as String?) ?? 'submitted',
              createdAt: (a['created_at'] as String?) ?? '',
              parentName: a['parent_name'] as String?,
              email: a['email'] as String?,
              campus: a['campus'] as String?,
              grade: a['grade'] as String? ?? a['class_applied'] as String?,
            ),
          )
          .toList(),
      events: familyEvents,
      points: pointAwards,
      mustResetPassword: _flag(user.userMetadata?['must_reset_password']),
    );
  }

  Future<List<SchoolEvent>> _loadFamilyEvents(
    List<Map<String, dynamic>> students,
    String? currentTermId,
  ) async {
    final siteRows = await _rows(
      _db
          .from('events')
          .select('id, title, starts_on, ends_on, excerpt, location')
          .eq('published', true)
          .order('starts_on'),
    );
    final academicRows = currentTermId == null
        ? <SchoolEvent>[]
        : await _loadFamilyAcademicDates(currentTermId, students);

    final events = <SchoolEvent>[
      ...siteRows
          .where((row) => (row['starts_on'] as String?)?.isNotEmpty == true)
          .map(
            (row) => SchoolEvent(
              id: row['id'].toString(),
              title: (row['title'] as String?) ?? 'Event',
              startsOn: row['starts_on'] as String?,
              endsOn: row['ends_on'] as String?,
              summary: row['excerpt'] as String?,
              location: row['location'] as String?,
            ),
          ),
      ...academicRows,
    ]..sort((a, b) => (a.startsOn ?? '').compareTo(b.startsOn ?? ''));
    return events;
  }

  Future<List<SchoolEvent>> _loadFamilyAcademicDates(
    String termId,
    List<Map<String, dynamic>> students,
  ) async {
    List<Map<String, dynamic>> rows;
    try {
      rows = await _rows(
        _db
            .from('academic_dates')
            .select('id, title, kind, starts_on, ends_on, campus, note, class_code, stream')
            .eq('term_id', termId)
            .order('starts_on'),
      );
    } catch (_) {
      try {
        rows = await _rows(
          _db
              .from('academic_dates')
              .select('id, title, kind, starts_on, ends_on, campus, note')
              .eq('term_id', termId)
              .order('starts_on'),
        );
      } catch (_) {
        return const [];
      }
    }

    final classes = <String>{
      for (final student in students)
        if ((student['class_code'] as String?)?.isNotEmpty == true)
          '${student['class_code']}|${student['stream'] ?? ''}',
    };
    final campuses = <String>{
      for (final student in students)
        if ((student['campus'] as String?)?.trim().isNotEmpty == true) (student['campus'] as String).trim(),
    };

    final visible = rows.where((row) {
      final classCode = row['class_code'] as String?;
      final stream = row['stream'] as String?;
      if (classCode != null && classCode.isNotEmpty && !classes.contains('$classCode|${stream ?? ''}')) {
        return false;
      }
      final campus = (row['campus'] as String?)?.trim() ?? '';
      if (campus.isEmpty || RegExp(r'all', caseSensitive: false).hasMatch(campus)) return true;
      if (campuses.isEmpty) return true;
      return campuses.contains(campus);
    });

    final byId = <String, Map<String, dynamic>>{};
    for (final row in visible) {
      final id = row['id']?.toString();
      if (id == null || byId.containsKey(id)) continue;
      byId[id] = row;
    }

    final byContent = <String, Map<String, dynamic>>{};
    final ordered = byId.values.toList()
      ..sort((a, b) {
        final aOffice = (a['class_code'] as String?)?.isNotEmpty == true ? 1 : 0;
        final bOffice = (b['class_code'] as String?)?.isNotEmpty == true ? 1 : 0;
        return aOffice - bOffice;
      });
    for (final row in ordered) {
      final key = [
        ((row['title'] as String?) ?? '').trim().toLowerCase(),
        row['kind'] ?? '',
        row['starts_on'] ?? '',
        row['ends_on'] ?? row['starts_on'] ?? '',
        ((row['campus'] as String?) ?? '').trim().toLowerCase(),
      ].join('|');
      byContent.putIfAbsent(key, () => row);
    }

    return byContent.values.map((row) {
      final kind = row['kind'] as String?;
      final note = row['note'] as String?;
      final summary = [
        _academicKindLabel(kind),
        if (note != null && note.trim().isNotEmpty) note.trim(),
      ].whereType<String>().where((s) => s.isNotEmpty).join(' · ');
      return SchoolEvent(
        id: 'academic-${row['id']}',
        title: (row['title'] as String?) ?? 'School date',
        startsOn: row['starts_on'] as String?,
        endsOn: row['ends_on'] as String?,
        summary: summary.isEmpty ? null : summary,
        location: row['campus'] as String?,
      );
    }).toList();
  }

  String _academicKindLabel(String? kind) {
    switch (kind) {
      case 'exam':
        return 'Test day';
      case 'reporting':
        return 'Reports go home';
      case 'deadline':
        return 'Deadline';
      case 'meeting':
        return 'School meeting';
      default:
        return 'School date';
    }
  }

  Future<ReportDetail?> loadReportDetail(PublishedReport card) async {
    try {
      final lines = await _rows(
        _db.from('report_lines').select('subject, grade, remark, teacher_name').eq('report_card_id', card.id).order('sort_order'),
      );
      final extras = await _maybeMap(_db.from('report_cards').select('closing_comment').eq('id', card.id).maybeSingle());
      List<String> activities = [];
      try {
        final actRows = await _rows(_db.from('report_activities').select('title').eq('report_card_id', card.id));
        activities = actRows.map((r) => (r['title'] as String?) ?? '').where((t) => t.isNotEmpty).toList();
      } catch (_) {}
      return ReportDetail(
        card: card,
        lines: lines
            .map(
              (l) => ReportLine(
                subject: (l['subject'] as String?) ?? 'Subject',
                grade: l['grade'] as String?,
                remark: l['remark'] as String?,
                teacher: l['teacher_name'] as String?,
              ),
            )
            .toList(),
        closingComment: extras?['closing_comment'] as String?,
        activities: activities,
      );
    } catch (error) {
      debugPrint('report detail: $error');
      return ReportDetail(card: card);
    }
  }

  Future<String?> updateProfile({
    required String fullName,
    String? phone,
    String? address,
  }) async {
    final user = _db.auth.currentUser;
    if (user == null) return 'Sign in to continue.';
    try {
      await _db.from('profiles').upsert({
        'id': user.id,
        'full_name': fullName.trim(),
        'phone': phone?.trim(),
        'address': address?.trim(),
        'email': user.email,
        'role': 'parent',
      });
      return null;
    } on PostgrestException catch (error) {
      return error.message;
    } catch (_) {
      return 'Could not save your details.';
    }
  }

  Future<String?> sendMessage({
    required String subject,
    required String body,
    String? threadId,
    String? familyId,
  }) async {
    final user = _db.auth.currentUser;
    if (user == null) return 'Sign in to continue.';
    final cleanBody = body.trim();
    final cleanSub = subject.trim();
    if (cleanSub.isEmpty || cleanBody.isEmpty) return 'Add a subject and message.';
    final tid = (threadId != null && threadId.trim().isNotEmpty) ? threadId.trim() : _uuid.v4();
    try {
      await _db.from('parent_messages').insert({
        'user_id': user.id,
        'subject': cleanSub,
        'body': cleanBody,
        'direction': 'out',
        'read': true,
        'thread_id': tid,
        if (familyId != null && familyId.isNotEmpty) 'family_id': familyId,
        'audience': 'direct',
        'created_by': user.id,
      });
      return null;
    } on PostgrestException catch (error) {
      return error.message;
    } catch (_) {
      return 'Could not send your message.';
    }
  }

  Future<String?> markMessagesRead(List<String> ids) async {
    if (ids.isEmpty) return null;
    final user = _db.auth.currentUser;
    if (user == null) return 'Sign in to continue.';
    try {
      await _db.from('parent_messages').update({'read': true}).eq('user_id', user.id).eq('direction', 'in').inFilter('id', ids);
      return null;
    } on PostgrestException catch (error) {
      return error.message;
    } catch (_) {
      return 'Could not mark messages read.';
    }
  }

  Future<String?> markNoticesRead(List<String> ids, String userId) async {
    if (ids.isEmpty) return null;
    try {
      await _db.from('notifications').update({'read': true}).eq('user_id', userId).inFilter('id', ids);
      return null;
    } on PostgrestException catch (error) {
      return error.message;
    } catch (_) {
      return 'Could not update notices.';
    }
  }

  Future<String?> consentToClub({required String clubId, required String studentId}) async {
    final user = _db.auth.currentUser;
    if (user == null) return 'Sign in to continue.';
    try {
      await _db.from('club_consents').insert({
        'club_id': clubId,
        'student_id': studentId,
        'user_id': user.id,
      });
      return null;
    } on PostgrestException catch (error) {
      if (error.code == '23505') return 'You have already consented to this club.';
      return error.message;
    } catch (_) {
      return 'Could not save club consent.';
    }
  }

  Future<String?> withdrawClubConsent(String consentId) async {
    try {
      await _db.from('club_consents').update({
        'withdrawn_at': DateTime.now().toUtc().toIso8601String(),
      }).eq('id', consentId);
      return null;
    } on PostgrestException catch (error) {
      return error.message;
    } catch (_) {
      return 'Could not withdraw consent.';
    }
  }

  Future<Map<String, dynamic>> startClubPayment({
    required String phone,
    required List<ClubCartLine> items,
  }) async {
    final session = _db.auth.currentSession;
    final token = session?.accessToken;
    if (token == null || token.isEmpty) return {'error': 'Sign in to pay for a club.'};
    if (items.isEmpty) return {'error': 'Choose at least one club.'};

    final uri = Uri.parse(AppConfig.sitePath('/api/parents/clubs/pay'));
    try {
      final response = await http
          .post(
            uri,
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'phone': phone,
              'items': [
                for (final item in items) {'studentId': item.studentId, 'clubId': item.clubId},
              ],
            }),
          )
          .timeout(const Duration(seconds: 45));
      final body = _jsonMap(response.body);
      if (response.statusCode >= 400) {
        return {'error': (body['error'] as String?) ?? 'Could not start the payment.'};
      }
      return body;
    } catch (_) {
      return {'error': 'Could not reach the school payment service. Try again shortly.'};
    }
  }

  Future<Map<String, dynamic>> checkClubPayment(String collectionId) async {
    final session = _db.auth.currentSession;
    final token = session?.accessToken;
    if (token == null || token.isEmpty) return {'error': 'Sign in to check this payment.'};

    final uri = Uri.parse(AppConfig.sitePath('/api/parents/clubs/pay')).replace(queryParameters: {'id': collectionId});
    try {
      final response = await http
          .get(
            uri,
            headers: {
              'Authorization': 'Bearer $token',
              'Accept': 'application/json',
            },
          )
          .timeout(const Duration(seconds: 30));
      final body = _jsonMap(response.body);
      if (response.statusCode >= 400) {
        return {'error': (body['error'] as String?) ?? 'Could not check this payment.'};
      }
      return body;
    } catch (_) {
      return {'error': 'Could not check the payment status right now.'};
    }
  }

  Future<List<({String campus, int fee})>> loadAdmissionFees() async {
    final session = _db.auth.currentSession;
    final token = session?.accessToken;
    if (token == null || token.isEmpty) return const [];
    final uri = Uri.parse(AppConfig.sitePath('/api/parents/applications/pay'));
    try {
      final response = await http
          .get(
            uri,
            headers: {
              'Authorization': 'Bearer $token',
              'Accept': 'application/json',
            },
          )
          .timeout(const Duration(seconds: 30));
      final body = _jsonMap(response.body);
      final fees = body['fees'];
      if (fees is! List) return const [];
      return [
        for (final row in fees)
          if (row is Map)
            (
              campus: '${row['campus'] ?? ''}',
              fee: ((row['fee'] as num?)?.round() ?? 0),
            ),
      ].where((row) => row.campus.isNotEmpty && row.fee > 0).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<Map<String, dynamic>> startAdmissionPayment({
    required String childName,
    String? childDob,
    required String campus,
    String? grade,
    String? message,
    String? phone,
    required String payPhone,
  }) async {
    final session = _db.auth.currentSession;
    final token = session?.accessToken;
    if (token == null || token.isEmpty) return {'error': 'Sign in to apply.'};

    final uri = Uri.parse(AppConfig.sitePath('/api/parents/applications/pay'));
    try {
      final response = await http
          .post(
            uri,
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'childName': childName,
              'childDob': childDob,
              'campus': campus,
              'grade': grade,
              'message': message,
              'phone': phone,
              'payPhone': payPhone,
            }),
          )
          .timeout(const Duration(seconds: 45));
      final body = _jsonMap(response.body);
      if (response.statusCode >= 400) {
        return {'error': (body['error'] as String?) ?? 'Could not start the admission payment.'};
      }
      return body;
    } catch (_) {
      return {'error': 'Could not reach the school payment service. Try again shortly.'};
    }
  }

  Future<Map<String, dynamic>> checkAdmissionPayment({
    required String paymentId,
    required String token,
  }) async {
    final session = _db.auth.currentSession;
    final access = session?.accessToken;
    if (access == null || access.isEmpty) return {'error': 'Sign in to check this payment.'};

    final uri = Uri.parse(AppConfig.sitePath('/api/parents/applications/pay')).replace(
      queryParameters: {'id': paymentId, 'token': token},
    );
    try {
      final response = await http
          .get(
            uri,
            headers: {
              'Authorization': 'Bearer $access',
              'Accept': 'application/json',
            },
          )
          .timeout(const Duration(seconds: 30));
      final body = _jsonMap(response.body);
      if (response.statusCode >= 400) {
        return {'error': (body['error'] as String?) ?? 'Could not check this payment.'};
      }
      return body;
    } catch (_) {
      return {'error': 'Could not check the payment status right now.'};
    }
  }

  Future<Map<String, dynamic>> startFeePayment({
    required String studentId,
    required String termId,
    required num amount,
    required String phone,
  }) async {
    final session = _db.auth.currentSession;
    final token = session?.accessToken;
    if (token == null || token.isEmpty) return {'error': 'Sign in to pay school fees.'};

    final uri = Uri.parse(AppConfig.sitePath('/api/parents/fees/pay'));
    try {
      final response = await http
          .post(
            uri,
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'studentId': studentId,
              'termId': termId,
              'amount': amount,
              'phone': phone,
            }),
          )
          .timeout(const Duration(seconds: 45));
      final body = _jsonMap(response.body);
      if (response.statusCode >= 400) {
        return {'error': (body['error'] as String?) ?? 'Could not start the payment.'};
      }
      return body;
    } catch (_) {
      return {'error': 'Could not reach the school payment service. Try again shortly.'};
    }
  }

  Future<Map<String, dynamic>> checkFeePayment(String collectionId) async {
    final session = _db.auth.currentSession;
    final token = session?.accessToken;
    if (token == null || token.isEmpty) return {'error': 'Sign in to check this payment.'};

    final uri = Uri.parse(AppConfig.sitePath('/api/parents/fees/pay')).replace(queryParameters: {'id': collectionId});
    try {
      final response = await http
          .get(
            uri,
            headers: {
              'Authorization': 'Bearer $token',
              'Accept': 'application/json',
            },
          )
          .timeout(const Duration(seconds: 30));
      final body = _jsonMap(response.body);
      if (response.statusCode >= 400) {
        return {'error': (body['error'] as String?) ?? 'Could not check this payment.'};
      }
      return body;
    } catch (_) {
      return {'error': 'Could not check the payment status right now.'};
    }
  }

  Map<String, dynamic> _jsonMap(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {}
    return {};
  }

  Future<String?> changePassword(String password) async {
    try {
      await _db.auth.updateUser(UserAttributes(password: password));
      return null;
    } on AuthException catch (error) {
      return error.message;
    } catch (_) {
      return 'Could not update password.';
    }
  }

  Future<bool> _isParentGuardian(String userId, String? role) async {
    if (role == 'student') return false;
    if (role == null || role.isEmpty || role == 'parent') return true;
    try {
      final guardian = await _maybeMap(_db.from('guardians').select('id').eq('user_id', userId).limit(1).maybeSingle());
      if (guardian != null) return true;
    } catch (_) {}
    try {
      final child = await _maybeMap(_db.from('children').select('id').eq('user_id', userId).limit(1).maybeSingle());
      if (child != null) return true;
    } catch (_) {}
    final ids = await _myStudentIds();
    return ids.isNotEmpty;
  }

  Future<List<String>> _myStudentIds() async {
    try {
      final linked = await _db.rpc('my_student_ids');
      return _parseStudentIds(linked);
    } catch (_) {
      return [];
    }
  }

  List<String> _parseStudentIds(dynamic value) {
    if (value is! List) return [];
    return value
        .map((row) {
          if (row is String) return row;
          if (row is Map && row.containsKey('my_student_ids')) return '${row['my_student_ids']}';
          return '';
        })
        .where((id) => id.isNotEmpty)
        .toList();
  }

  Future<List<Map<String, dynamic>>> _loadStudents(List<String> ids) async {
    try {
      return await _rows(
        _db
            .from('students')
            .select('id, full_name, class_code, stream, campus, student_number, date_of_birth, status, photo_path, profile_id')
            .inFilter('id', ids)
            .order('full_name'),
      );
    } on PostgrestException catch (error) {
      if (RegExp(r'profile_id|photo_path', caseSensitive: false).hasMatch(error.message)) {
        return _rows(
          _db
              .from('students')
              .select('id, full_name, class_code, stream, campus, student_number, date_of_birth, status')
              .inFilter('id', ids)
              .order('full_name'),
        );
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  Future<String?> _familyId(String userId) async {
    try {
      final row = await _maybeMap(_db.from('guardians').select('family_id').eq('user_id', userId).limit(1).maybeSingle());
      return row?['family_id']?.toString();
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, String>> _resolvePhotoUrls(Map<String, String?> paths) async {
    if (paths.isEmpty) return const {};
    final entries = paths.entries.toList();
    final resolved = await Future.wait(entries.map((entry) async {
      final proxy = PupilPhotoUrl.siteProxy(studentId: entry.key, photoPath: entry.value);
      final path = entry.value?.trim() ?? '';
      if (path.isEmpty) {
        return MapEntry(entry.key, proxy);
      }
      try {
        final signed = await _db.storage.from('student-photos').createSignedUrl(path, 60 * 60 * 12);
        if (signed.isNotEmpty) return MapEntry(entry.key, signed);
      } catch (_) {}
      return MapEntry(entry.key, proxy);
    }));
    return {
      for (final entry in resolved)
        if (entry.value != null && entry.value!.isNotEmpty) entry.key: entry.value!,
    };
  }

  ParentMessage _message(Map<String, dynamic> row) => ParentMessage(
        id: row['id'].toString(),
        subject: (row['subject'] as String?) ?? 'Message',
        body: (row['body'] as String?) ?? '',
        direction: (row['direction'] as String?) ?? 'in',
        read: row['read'] == true,
        createdAt: (row['created_at'] as String?) ?? '',
        threadId: row['thread_id'] as String?,
        familyId: row['family_id'] as String?,
        audience: row['audience'] as String?,
      );

  Notice _notice(Map<String, dynamic> row) => Notice(
        id: row['id'].toString(),
        title: (row['title'] as String?) ?? 'Notice',
        body: row['body'] as String?,
        href: row['href'] as String?,
        read: row['read'] == true,
        createdAt: (row['created_at'] as String?) ?? '',
      );

  String _methodLabel(String? method) {
    switch ((method ?? '').toLowerCase()) {
      case 'momo':
      case 'mtn':
      case 'airtel':
        return 'Mobile money';
      case 'cash':
        return 'Cash';
      case 'bank':
        return 'Bank';
      default:
        return method?.isNotEmpty == true ? method! : 'Payment';
    }
  }

  num _num(dynamic value) {
    if (value is num) return value;
    return num.tryParse('$value') ?? 0;
  }

  bool _flag(dynamic value) => value == true || value == 'true' || value == 1;

  Future<Map<String, dynamic>?> _one(dynamic query) async {
    try {
      final result = await query;
      if (result == null) return null;
      if (result is List) {
        if (result.isEmpty) return null;
        return Map<String, dynamic>.from(result.first as Map);
      }
      if (result is Map) return Map<String, dynamic>.from(result);
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> _maybeMap(dynamic query) async {
    try {
      final data = await query;
      if (data is Map<String, dynamic>) return data;
      if (data is Map) return Map<String, dynamic>.from(data);
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<List<PointAward>> _loadPointAwards(List<String> studentIds) async {
    if (studentIds.isEmpty) return [];
    try {
      final data = await _db
          .from('point_awards')
          .select('id, student_id, points, reason_label, teacher_name, created_at')
          .inFilter('student_id', studentIds)
          .isFilter('voided_at', null)
          .order('created_at', ascending: false);
      return data.map((row) {
        final map = Map<String, dynamic>.from(row as Map);
        return PointAward(
          id: map['id'].toString(),
          studentId: map['student_id'].toString(),
          points: (map['points'] as num?)?.toInt() ?? 0,
          reasonLabel: (map['reason_label'] as String?) ?? '',
          teacherName: (map['teacher_name'] as String?) ?? 'Teacher',
          createdAt: (map['created_at'] as String?) ?? '',
        );
      }).toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> _rows(dynamic query) async {
    try {
      final data = await query;
      if (data is! List) return [];
      return data.map((row) => Map<String, dynamic>.from(row as Map)).toList();
    } on PostgrestException {
      rethrow;
    } catch (_) {
      return [];
    }
  }
}
