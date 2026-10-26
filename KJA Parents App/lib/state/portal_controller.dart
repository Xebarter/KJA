import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import '../data/portal_repository.dart';
import '../data/sample_portal.dart';
import '../models.dart';

class PortalController extends ChangeNotifier {
  PortalController({PortalRepository? repository}) : _repository = repository ?? PortalRepository();

  final PortalRepository _repository;
  StreamSubscription<AuthState>? _authSub;

  bool booting = true;
  bool configured = false;
  bool refreshing = false;
  bool preview = false;
  String? banner;
  PortalSnapshot? snapshot;
  bool _supabaseReady = false;

  /// Cross-child club checkout cart (session-persistent while signed in).
  final List<ClubCartLine> clubCart = [];

  bool clubInCart(String studentId, String clubId) {
    for (final line in clubCart) {
      if (line.studentId == studentId && line.clubId == clubId) return true;
    }
    return false;
  }

  void addClubToCart(String studentId, String clubId) {
    if (clubInCart(studentId, clubId)) return;
    clubCart.add(ClubCartLine(studentId: studentId, clubId: clubId));
    notifyListeners();
  }

  void removeClubFromCart(String studentId, String clubId) {
    final before = clubCart.length;
    clubCart.removeWhere((line) => line.studentId == studentId && line.clubId == clubId);
    if (clubCart.length != before) notifyListeners();
  }

  void clearClubCart() {
    if (clubCart.isEmpty) return;
    clubCart.clear();
    notifyListeners();
  }

  Future<void> boot() async {
    try {
      final config = await AppConfig.load();
      configured = config.isReady;
      if (configured) {
        await _start(config.url, config.anonKey);
        if (_supabaseReady && Supabase.instance.client.auth.currentSession != null) {
          await _load(quiet: true);
        }
      }
    } catch (_) {
      banner ??= 'Could not finish starting the app.';
    } finally {
      booting = false;
      notifyListeners();
    }
  }

  Future<String?> saveConnection(String url, String anonKey) async {
    final next = AppConfig(url: url.trim(), anonKey: anonKey.trim());
    if (!next.isReady) {
      return 'Enter the school project URL and the anon key from the website setup.';
    }
    await AppConfig.save(next.url, next.anonKey);
    if (_supabaseReady) {
      configured = true;
      notifyListeners();
      return 'Saved. Close and reopen KJA Parents so the new connection is used.';
    }
    final error = await _start(next.url, next.anonKey);
    configured = _supabaseReady;
    notifyListeners();
    return error;
  }

  Future<String?> signIn(String email, String password) async {
    if (!_supabaseReady) return 'Connect the app to the school first.';
    final trimmedEmail = email.trim();
    if (trimmedEmail.isEmpty || password.isEmpty) {
      return 'Enter your email and password.';
    }
    try {
      await Supabase.instance.client.auth.signInWithPassword(email: trimmedEmail, password: password);
      preview = false;
      banner = null;
      final error = await _load(quiet: true, signOutOnFailure: true);
      notifyListeners();
      return error;
    } on AuthException catch (error) {
      final message = error.message.toLowerCase();
      if (message.contains('invalid login') || message.contains('invalid credentials')) {
        return 'Wrong email or password. Check your details, or use Reset password on the school website.';
      }
      return error.message;
    } catch (error) {
      return error is PortalException ? error.message : 'Could not sign in. Try again.';
    }
  }

  Future<void> enterPreview() async {
    preview = true;
    banner = null;
    snapshot = samplePortal();
    booting = false;
    notifyListeners();
  }

  Future<void> refresh() async {
    if (preview || snapshot == null || !_supabaseReady) return;
    refreshing = true;
    banner = null;
    notifyListeners();
    await _load(quiet: false);
    refreshing = false;
    notifyListeners();
  }

  void dismissBanner() {
    if (banner == null) return;
    banner = null;
    notifyListeners();
  }

  Future<void> signOut() async {
    preview = false;
    snapshot = null;
    banner = null;
    clubCart.clear();
    if (_supabaseReady) {
      try {
        await Supabase.instance.client.auth.signOut();
      } catch (_) {}
    }
    notifyListeners();
  }

  Future<void> markNoticesRead(List<String> ids) async {
    final current = snapshot;
    if (current == null || ids.isEmpty) return;
    final userId = _supabaseReady ? Supabase.instance.client.auth.currentUser?.id : null;
    snapshot = current.copyWith(
      notices: [
        for (final notice in current.notices)
          if (ids.contains(notice.id)) notice.copyWith(read: true) else notice,
      ],
    );
    notifyListeners();
    if (preview || userId == null) return;
    final error = await _repository.markNoticesRead(ids, userId);
    if (error != null) banner = error;
  }

  Future<void> markMessagesRead(List<String> ids) async {
    final current = snapshot;
    if (current == null || ids.isEmpty) return;
    snapshot = current.copyWith(
      messages: [
        for (final message in current.messages)
          if (ids.contains(message.id)) message.copyWith(read: true) else message,
      ],
    );
    notifyListeners();
    if (preview) return;
    final error = await _repository.markMessagesRead(ids);
    if (error != null) banner = error;
  }

  Future<String?> sendMessage({
    required String subject,
    required String body,
    String? threadId,
  }) async {
    final current = snapshot;
    if (current == null) return 'Sign in to continue.';
    if (preview) {
      final now = DateTime.now().toUtc().toIso8601String();
      final tid = threadId ?? 'preview-${DateTime.now().millisecondsSinceEpoch}';
      snapshot = current.copyWith(
        messages: [
          ParentMessage(
            id: 'local-$now',
            subject: subject,
            body: body,
            direction: 'out',
            read: true,
            createdAt: now,
            threadId: tid,
            familyId: current.familyId,
          ),
          ...current.messages,
        ],
      );
      notifyListeners();
      return null;
    }
    final error = await _repository.sendMessage(
      subject: subject,
      body: body,
      threadId: threadId,
      familyId: current.familyId,
    );
    if (error == null) await refresh();
    return error;
  }

  Future<String?> updateProfile({
    required String fullName,
    String? phone,
    String? address,
  }) async {
    final current = snapshot;
    if (current == null) return 'Sign in to continue.';
    if (preview) {
      snapshot = current.copyWith(
        displayName: fullName.trim().isEmpty ? current.displayName : fullName.trim(),
        profile: ParentProfile(
          id: current.profile.id,
          role: current.profile.role,
          fullName: fullName,
          email: current.profile.email,
          phone: phone,
          address: address,
        ),
      );
      notifyListeners();
      return null;
    }
    final error = await _repository.updateProfile(fullName: fullName, phone: phone, address: address);
    if (error == null) await refresh();
    return error;
  }

  Future<String?> changePassword(String password, String confirm) async {
    if (preview) return 'Preview mode cannot change a password.';
    if (password.length < 6) return 'Use at least 6 characters.';
    if (password != confirm) return 'Passwords do not match.';
    final error = await _repository.changePassword(password);
    if (error == null && snapshot != null) {
      snapshot = snapshot!.copyWith(mustResetPassword: false);
      notifyListeners();
    }
    return error;
  }

  Future<String?> consentToClub({required String clubId, required String studentId}) async {
    if (preview) {
      final current = snapshot;
      if (current == null) return null;
      snapshot = current.copyWith(
        consents: [
          ...current.consents,
          ClubConsent(id: 'local-$clubId-$studentId', clubId: clubId, studentId: studentId),
        ],
      );
      notifyListeners();
      return null;
    }
    final error = await _repository.consentToClub(clubId: clubId, studentId: studentId);
    if (error == null) await refresh();
    return error;
  }

  Future<String?> withdrawClubConsent(String consentId) async {
    if (preview) {
      final current = snapshot;
      if (current == null) return null;
      snapshot = current.copyWith(
        consents: current.consents.where((c) => c.id != consentId).toList(),
      );
      notifyListeners();
      return null;
    }
    final error = await _repository.withdrawClubConsent(consentId);
    if (error == null) await refresh();
    return error;
  }

  Future<Map<String, dynamic>> startClubPayment({
    required String phone,
    List<ClubCartLine>? items,
  }) async {
    final cart = items ?? List<ClubCartLine>.from(clubCart);
    if (preview) {
      return {
        'payment': {
          'id': 'preview-pay',
          'status': 'paid',
          'amount': 0,
          'lines': [
            for (final line in cart) {'id': line.clubId, 'title': 'Club', 'amount': 0, 'receiptNo': 'PREVIEW'},
          ],
        },
      };
    }
    final result = await _repository.startClubPayment(phone: phone, items: cart);
    final payment = result['payment'];
    if (payment is Map && payment['status']?.toString() == 'paid') {
      clearClubCart();
      await refresh();
    }
    return result;
  }

  Future<Map<String, dynamic>> checkClubPayment(String collectionId) async {
    if (preview) {
      return {
        'payment': {'id': collectionId, 'status': 'paid', 'lines': <Map<String, dynamic>>[]},
      };
    }
    return _repository.checkClubPayment(collectionId);
  }

  Future<Map<String, dynamic>> startFeePayment({
    required String studentId,
    required String termId,
    required num amount,
    required String phone,
  }) async {
    if (preview) {
      return {
        'payment': {
          'id': 'preview-fee',
          'status': 'paid',
          'amount': amount,
          'child': 'Preview',
          'term': 'Term',
          'receiptNo': 'PREVIEW',
        },
      };
    }
    return _repository.startFeePayment(
      studentId: studentId,
      termId: termId,
      amount: amount,
      phone: phone,
    );
  }

  Future<Map<String, dynamic>> checkFeePayment(String collectionId) async {
    if (preview) {
      return {
        'payment': {'id': collectionId, 'status': 'paid', 'receiptNo': 'PREVIEW'},
      };
    }
    return _repository.checkFeePayment(collectionId);
  }

  Future<List<({String campus, int fee})>> loadAdmissionFees() {
    if (preview) {
      return Future.value(const [
        (campus: 'Bukoto', fee: 50000),
        (campus: 'Naalya', fee: 50000),
      ]);
    }
    return _repository.loadAdmissionFees();
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
    if (preview) {
      return {
        'payment': {
          'id': 'preview-admission',
          'token': 'preview',
          'status': 'paid',
          'amount': 50000,
          'campus': campus,
          'child': childName,
          'phone': payPhone,
          'network': 'MTN Mobile Money',
          'receiptNo': 'PREVIEW',
        },
      };
    }
    return _repository.startAdmissionPayment(
      childName: childName,
      childDob: childDob,
      campus: campus,
      grade: grade,
      message: message,
      phone: phone,
      payPhone: payPhone,
    );
  }

  Future<Map<String, dynamic>> checkAdmissionPayment({
    required String paymentId,
    required String token,
  }) async {
    if (preview) {
      return {
        'payment': {
          'id': paymentId,
          'token': token,
          'status': 'paid',
          'receiptNo': 'PREVIEW',
        },
      };
    }
    return _repository.checkAdmissionPayment(paymentId: paymentId, token: token);
  }

  Future<ReportDetail?> loadReportDetail(PublishedReport card) {
    if (preview) {
      return Future.value(
        ReportDetail(
          card: card,
          lines: const [
            ReportLine(subject: 'English', grade: 'A', remark: 'Confident reader.'),
            ReportLine(subject: 'Mathematics', grade: 'B+', remark: 'Steady progress.'),
          ],
          closingComment: 'A pleasure to teach this term.',
          activities: const ['Football', 'Choir'],
        ),
      );
    }
    return _repository.loadReportDetail(card);
  }

  PortalRepository get repository => _repository;

  bool get hasSession => _supabaseReady && Supabase.instance.client.auth.currentSession != null;

  Future<String?> retry() async {
    refreshing = true;
    notifyListeners();
    final error = await _load(quiet: true);
    refreshing = false;
    notifyListeners();
    return error;
  }

  Future<String?> _start(String url, String anonKey) async {
    try {
      await Supabase.initialize(url: url, publishableKey: anonKey);
      _supabaseReady = true;
      _authSub ??= Supabase.instance.client.auth.onAuthStateChange.listen((state) {
        if (state.event == AuthChangeEvent.signedOut && !preview) {
          snapshot = null;
          notifyListeners();
        }
      });
      return null;
    } catch (_) {
      _supabaseReady = false;
      return 'Could not connect. Check the project URL and anon key.';
    }
  }

  Future<String?> _load({required bool quiet, bool signOutOnFailure = false}) async {
    try {
      final next = await _repository.load();
      snapshot = next;
      preview = false;
      banner = null;
      if (!quiet) notifyListeners();
      return null;
    } on PortalException catch (error) {
      final wrongAccount = error.message.contains('pupil login');
      if (signOutOnFailure && snapshot == null && wrongAccount) {
        try {
          await Supabase.instance.client.auth.signOut();
        } catch (_) {}
      } else if (signOutOnFailure && snapshot == null && error.message.contains('Sign in to continue')) {
        try {
          await Supabase.instance.client.auth.signOut();
        } catch (_) {}
      }
      banner = error.message;
      if (!quiet) notifyListeners();
      return error.message;
    } catch (_) {
      const message = 'Could not load your family record.';
      banner = message;
      if (!quiet) notifyListeners();
      return message;
    }
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }
}
