import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

/// In-memory portraits. Notifies listeners when a photo arrives so faces refresh.
class PupilPhotoCache extends ChangeNotifier {
  PupilPhotoCache._();
  static final PupilPhotoCache instance = PupilPhotoCache._();

  final Map<String, Uint8List> _bytesByStudentId = {};

  static Uint8List? bytes(String? studentId) => instance._bytes(studentId);

  static void put(String studentId, Uint8List bytes) => instance._put(studentId, bytes);

  static void clear() => instance._clear();

  Uint8List? _bytes(String? studentId) {
    if (studentId == null || studentId.isEmpty) return null;
    return _bytesByStudentId[studentId];
  }

  void _put(String studentId, Uint8List bytes) {
    if (studentId.isEmpty || bytes.isEmpty) return;
    _bytesByStudentId[studentId] = bytes;
    notifyListeners();
  }

  void _clear() {
    if (_bytesByStudentId.isEmpty) return;
    _bytesByStudentId.clear();
    notifyListeners();
  }
}

/// Builds portrait URLs for the Pupils app.
///
/// Prefer Supabase signed storage URLs (set during portal load). The site proxy
/// is a fallback when signing is unavailable.
class PupilPhotoUrl {
  static const defaultSite = 'https://kja.ug';

  static String siteBase() {
    final configured = AppConfig.siteUrl.trim();
    var base = configured.isNotEmpty ? configured : defaultSite;
    // Flutter web / phones cannot reliably reach a developer machine's localhost.
    if (kIsWeb && RegExp(r'^https?://(localhost|127\.0\.0\.1)(:\d+)?/?$', caseSensitive: false).hasMatch(base)) {
      base = defaultSite;
    }
    return base.replaceAll(RegExp(r'/+$'), '');
  }

  /// Website proxy URL with the current session token in the query string.
  /// [photoPath] is optional (cache-bust only); the server looks up the path.
  static String? siteProxy({required String studentId, String? photoPath}) {
    final id = studentId.trim();
    if (id.isEmpty) return null;
    final token = Supabase.instance.client.auth.currentSession?.accessToken.trim() ?? '';
    if (token.isEmpty) return null;
    final access = Uri.encodeQueryComponent(token);
    final path = photoPath?.trim() ?? '';
    if (path.isEmpty) {
      return '${siteBase()}/student-photo/$id?access_token=$access';
    }
    final v = Uri.encodeQueryComponent(path);
    return '${siteBase()}/student-photo/$id?access_token=$access&v=$v';
  }

  /// Teacher portrait via the website proxy (`/teacher-photo/:id`).
  static String? teacherProxy({required String staffId, String? photoPath}) {
    final id = staffId.trim();
    if (id.isEmpty) return null;
    final token = Supabase.instance.client.auth.currentSession?.accessToken.trim() ?? '';
    if (token.isEmpty) return null;
    final access = Uri.encodeQueryComponent(token);
    final path = photoPath?.trim() ?? '';
    if (path.isEmpty) {
      return '${siteBase()}/teacher-photo/$id?access_token=$access';
    }
    final v = Uri.encodeQueryComponent(path);
    return '${siteBase()}/teacher-photo/$id?access_token=$access&v=$v';
  }

  static void debugFail(String studentId, Object error) {
    assert(() {
      debugPrint('KJA photo failed for $studentId: $error');
      return true;
    }());
  }
}
