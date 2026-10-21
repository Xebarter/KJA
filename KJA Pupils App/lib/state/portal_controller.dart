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

  Future<void> boot() async {
    final config = await AppConfig.load();
    configured = config.isReady;
    if (configured) {
      await _start(config.url, config.anonKey);
      if (_supabaseReady && Supabase.instance.client.auth.currentSession != null) {
        await _load(quiet: true);
      }
    }
    booting = false;
    notifyListeners();
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
      return 'Saved. Close and reopen KJA Pupils so the new connection is used.';
    }
    final error = await _start(next.url, next.anonKey);
    configured = _supabaseReady;
    notifyListeners();
    return error;
  }

  Future<String?> signIn(String email, String password) async {
    if (!_supabaseReady) return 'Connect the app to the school first.';
    try {
      await Supabase.instance.client.auth.signInWithPassword(email: email.trim(), password: password);
      preview = false;
      final error = await _load(quiet: true);
      notifyListeners();
      return error;
    } on AuthException catch (error) {
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
    if (_supabaseReady) {
      try {
        await Supabase.instance.client.auth.signOut();
      } catch (_) {}
    }
    notifyListeners();
  }

  Future<String?> setHomeworkDone(HomeworkItem item, bool done) async {
    final current = snapshot;
    final pupil = current?.pupil;
    if (current == null || pupil == null) return 'Your pupil record is not linked yet.';
    final previous = current.homework;
    snapshot = current.copyWith(
      homework: [
        for (final row in current.homework)
          if (row.id == item.id) row.marked(done) else row,
      ],
    );
    notifyListeners();
    if (preview) return null;
    final error = await _repository.setHomeworkDone(assignmentId: item.id, studentId: pupil.id, done: done);
    if (error != null) {
      snapshot = current.copyWith(homework: previous);
      notifyListeners();
    }
    return error;
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

  Future<void> replaceConversations(List<Conversation> conversations) async {
    if (snapshot == null) return;
    snapshot = snapshot!.copyWith(conversations: conversations);
    notifyListeners();
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

  Future<String?> _load({required bool quiet}) async {
    try {
      final next = await _repository.load();
      snapshot = next;
      preview = false;
      banner = null;
      if (!quiet) notifyListeners();
      return null;
    } on PortalException catch (error) {
      if (snapshot == null) {
        try {
          await Supabase.instance.client.auth.signOut();
        } catch (_) {}
      }
      banner = error.message;
      if (!quiet) notifyListeners();
      return error.message;
    } catch (_) {
      const message = 'Could not load your school record.';
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
