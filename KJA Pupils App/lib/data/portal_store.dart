import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';
import '../models_json.dart';

/// Last successful portal snapshot so reopen does not wait on the network.
class PortalStore {
  PortalStore();

  Future<void> savePortal(String userId, PortalSnapshot portal) async {
    if (portal.preview) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'pupil_portal_$userId',
      jsonEncode({
        'userId': userId,
        'savedAt': DateTime.now().toUtc().toIso8601String(),
        'portal': portal.toJson(),
      }),
    );
  }

  Future<PortalSnapshot?> loadPortal(String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('pupil_portal_$userId');
      if (raw == null || raw.isEmpty) return null;
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final portal = map['portal'];
      if (portal is! Map) return null;
      return PortalSnapshotJson.fromJson(Map<String, dynamic>.from(portal));
    } catch (_) {
      return null;
    }
  }

  Future<void> clearPortal(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('pupil_portal_$userId');
  }
}
