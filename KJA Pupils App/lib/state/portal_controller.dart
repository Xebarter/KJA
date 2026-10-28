import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import '../data/portal_repository.dart';
import '../data/portal_store.dart';
import '../data/sample_portal.dart';
import '../models.dart';

class PortalController extends ChangeNotifier {
  PortalController({PortalRepository? repository, PortalStore? store})
      : _repository = repository ?? PortalRepository(),
        _store = store ?? PortalStore();

  final PortalRepository _repository;
  final PortalStore _store;
  StreamSubscription<AuthState>? _authSub;

  bool booting = true;
  bool configured = false;
  bool refreshing = false;
  bool preview = false;
  String? banner;
  PortalSnapshot? snapshot;
  bool _supabaseReady = false;

  Future<void> boot() async {
    try {
      final config = await AppConfig.load();
      configured = config.isReady;
      if (configured) {
        await _start(config.url, config.anonKey);
        final userId = _supabaseReady ? Supabase.instance.client.auth.currentUser?.id : null;
        if (userId != null) {
          // Reopen from the last saved portal so splash is not blocked on the network.
          final cached = await _store.loadPortal(userId);
          if (cached != null && !cached.preview) {
            snapshot = cached;
            preview = false;
            booting = false;
            notifyListeners();
            unawaited(_refreshInBackground());
            return;
          }
          // First open after install (or cleared cache): leave splash as soon as
          // Supabase is ready, then fill the portal in the background.
          final metaName = Supabase.instance.client.auth.currentUser?.userMetadata?['full_name'];
          final email = Supabase.instance.client.auth.currentUser?.email ?? '';
          snapshot = PortalSnapshot(
            displayName: (metaName is String && metaName.trim().isNotEmpty) ? metaName.trim() : 'Student',
            classLabel: '',
            email: email,
            mustResetPassword: false,
            preview: false,
          );
          booting = false;
          notifyListeners();
          unawaited(_refreshInBackground());
          return;
        }
      }
    } catch (_) {
      banner ??= 'Could not finish starting the app.';
    } finally {
      if (booting) {
        booting = false;
        notifyListeners();
      }
    }
  }

  Future<void> _refreshInBackground() async {
    refreshing = true;
    notifyListeners();
    final stubOnly = snapshot != null && snapshot!.pupil == null && !snapshot!.preview;
    await _load(quiet: false, signOutOnFailure: stubOnly);
    refreshing = false;
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
    final trimmedEmail = email.trim();
    if (trimmedEmail.isEmpty || password.isEmpty) {
      return 'Enter the email and password from the office.';
    }
    try {
      await Supabase.instance.client.auth.signInWithPassword(email: trimmedEmail, password: password);
      preview = false;
      banner = null;
      // Load before notifying so we do not flash Login → Shell → Login.
      final error = await _load(quiet: true, signOutOnFailure: true);
      notifyListeners();
      return error;
    } on AuthException catch (error) {
      final message = error.message.toLowerCase();
      if (message.contains('invalid login') || message.contains('invalid credentials')) {
        return 'Wrong email or password. Check the details from the office, or ask them to reset it.';
      }
      if (message.contains('banned') || message.contains('disabled')) {
        return 'This login was revoked. Ask the office to issue a new sign-in.';
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
    final userId = _supabaseReady ? Supabase.instance.client.auth.currentUser?.id : null;
    preview = false;
    snapshot = null;
    banner = null;
    if (userId != null) {
      try {
        await _store.clearPortal(userId);
      } catch (_) {}
    }
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
    } else {
      unawaited(_persistSnapshot());
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
    if (error != null) {
      banner = error;
    } else {
      unawaited(_persistSnapshot());
    }
  }

  Future<String?> changePassword(String password, String confirm) async {
    if (preview) return 'Preview mode cannot change a password.';
    if (password.length < 6) return 'Use at least 6 characters.';
    if (password != confirm) return 'Passwords do not match.';
    final error = await _repository.changePassword(password);
    if (error == null && snapshot != null) {
      snapshot = snapshot!.copyWith(mustResetPassword: false);
      notifyListeners();
      unawaited(_persistSnapshot());
    }
    return error;
  }

  Future<void> replaceConversations(List<Conversation> conversations) async {
    if (snapshot == null) return;
    snapshot = snapshot!.copyWith(conversations: conversations);
    notifyListeners();
    unawaited(_persistSnapshot());
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
      unawaited(_persistSnapshot());
      unawaited(_enrichInBackground());
      return null;
    } on PortalException catch (error) {
      final wrongAccount = error.message.contains('not a pupil login');
      final emptyShell = snapshot == null || snapshot!.pupil == null;
      // Only drop the session for a wrong role at first sign-in / cold restore.
      // Network blips should not force another password attempt.
      if (signOutOnFailure && emptyShell && (wrongAccount || error.message.contains('Sign in to continue'))) {
        snapshot = null;
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

  Future<void> _persistSnapshot() async {
    final current = snapshot;
    final userId = _supabaseReady ? Supabase.instance.client.auth.currentUser?.id : null;
    if (current == null || userId == null || preview) return;
    try {
      await _store.savePortal(userId, current);
    } catch (_) {}
  }

  Future<void> _enrichInBackground() async {
    final current = snapshot;
    if (current == null || preview || !_supabaseReady) return;
    try {
      final next = await _repository.enrichExtras(current);
      if (snapshot == null || preview) return;
      // Keep homework/notices the user may have updated while extras were loading.
      snapshot = next.copyWith(homework: snapshot!.homework, notices: snapshot!.notices);
      notifyListeners();
      unawaited(_persistSnapshot());
    } catch (_) {}
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }
}
