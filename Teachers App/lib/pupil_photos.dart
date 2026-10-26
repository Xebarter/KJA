import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'models.dart';

/// Passport photos kept on this device for offline markbooks and rolls.
class PhotoCache {
  PhotoCache._();
  static final PhotoCache instance = PhotoCache._();

  final Map<String, Uint8List> _bytes = {};

  Uint8List? operator [](String? id) {
    if (id == null || id.isEmpty) return null;
    return _bytes[id];
  }

  void put(String id, List<int> bytes) {
    if (id.isEmpty || bytes.isEmpty) return;
    _bytes[id] = Uint8List.fromList(bytes);
  }

  void putAll(Map<String, Uint8List> rows) => _bytes.addAll(rows);

  void remove(String id) => _bytes.remove(id);

  void clear() => _bytes.clear();
}

/// School photo address. Initials show when there is no photo.
///
/// https://kja.ug is the public WordPress site and does not serve pupil photos.
/// While the teacher app is open in a browser on this computer, the desk at
/// port 3000 does.
String photoSiteBase({bool? web, String? pageHost}) {
  var base = AppConfig.siteUrl.trim();
  if (base.isEmpty) base = 'https://kja.ug';
  base = base.replaceAll(RegExp(r'/+$'), '');
  final onWeb = web ?? kIsWeb;
  final host = pageHost ?? Uri.base.host;
  final wordpress = RegExp(r'^https?://(www\.)?kja\.ug$', caseSensitive: false).hasMatch(base);
  if (onWeb && wordpress && (host == 'localhost' || host == '127.0.0.1')) {
    return 'http://127.0.0.1:3000';
  }
  return base;
}

String? pupilPhotoUrl(Pupil pupil) {
  final path = pupil.photoPath?.trim() ?? '';
  if (pupil.id.isEmpty || path.isEmpty) return null;
  final direct = pupil.photoUrl?.trim() ?? '';
  if (direct.startsWith('http')) return direct;
  final SupabaseClient client;
  try {
    client = Supabase.instance.client;
  } catch (_) {
    return null;
  }
  final token = client.auth.currentSession?.accessToken.trim() ?? '';
  if (token.isEmpty) return null;
  final base = photoSiteBase();
  final access = Uri.encodeQueryComponent(token);
  final version = Uri.encodeQueryComponent(path);
  return '$base/student-photo/${pupil.id}?access_token=$access&v=$version';
}
