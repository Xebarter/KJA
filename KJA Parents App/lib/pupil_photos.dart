import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

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

class PupilPhotoUrl {
  static const defaultSite = 'https://kja.ug';

  static String siteBase() {
    final configured = AppConfig.siteUrl.trim();
    var base = configured.isNotEmpty ? configured : defaultSite;
    if (kIsWeb && RegExp(r'^https?://(localhost|127\.0\.0\.1)(:\d+)?/?$', caseSensitive: false).hasMatch(base)) {
      base = defaultSite;
    }
    return base.replaceAll(RegExp(r'/+$'), '');
  }

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
}
