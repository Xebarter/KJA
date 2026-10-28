import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Production client config for KJA Parents.
///
/// Priority:
/// 1. `--dart-define=SUPABASE_URL=…` / `SUPABASE_ANON_KEY=…`
/// 2. `.env` next to the app (`flutter_dotenv`)
/// 3. Values saved on the device
///
/// Same public URL + anon key as the school backend. Never ship the service-role key.
class AppConfig {
  const AppConfig({required this.url, required this.anonKey});

  final String url;
  final String anonKey;

  static const defineUrl = String.fromEnvironment('SUPABASE_URL');
  static const defineKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const defineUrlAlias = String.fromEnvironment('NEXT_PUBLIC_SUPABASE_URL');
  static const defineKeyAlias = String.fromEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  static const defineSiteUrl = String.fromEnvironment('KJA_SITE_URL');
  static const defineSiteUrlAlias = String.fromEnvironment('NEXT_PUBLIC_SITE_URL');

  static var _dotenvReady = false;
  static String siteUrl = '';

  bool get isReady => url.startsWith('https://') && anonKey.length >= 20;

  static void loadForTest(String envString) {
    dotenv.loadFromString(envString: envString, isOptional: true);
    _dotenvReady = true;
  }

  static Future<void> loadDotenv() async {
    if (_dotenvReady) return;
    if (dotenv.isInitialized) {
      _dotenvReady = true;
      return;
    }
    try {
      await dotenv.load(fileName: '.env', isOptional: true);
    } catch (_) {}
    _dotenvReady = true;
  }

  static Future<AppConfig> load() async {
    await loadDotenv();
    SharedPreferences? prefs;
    try {
      prefs = await SharedPreferences.getInstance().timeout(const Duration(seconds: 8));
    } catch (_) {
      prefs = null;
    }

    final url = _firstNonEmpty([
      defineUrl,
      defineUrlAlias,
      _env('SUPABASE_URL'),
      _env('NEXT_PUBLIC_SUPABASE_URL'),
      prefs?.getString('supabase_url'),
    ]);
    final key = _firstNonEmpty([
      defineKey,
      defineKeyAlias,
      _env('SUPABASE_ANON_KEY'),
      _env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      prefs?.getString('supabase_anon_key'),
    ]);
    siteUrl = _firstNonEmpty([
      defineSiteUrl,
      defineSiteUrlAlias,
      _env('KJA_SITE_URL'),
      _env('NEXT_PUBLIC_SITE_URL'),
      prefs?.getString('kja_site_url'),
      // Next.js desk (Paytota APIs). WordPress at kja.ug does not host /api/parents/*.
      'https://kja-phi.vercel.app',
    ]);

    return AppConfig(url: url, anonKey: key);
  }

  static Future<void> save(String url, String anonKey) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('supabase_url', url.trim());
    await prefs.setString('supabase_anon_key', anonKey.trim());
  }

  /// API + photo host. On Flutter web at localhost, prefer local Next (`:3000`)
  /// so new parent routes work before a deploy.
  static String apiBase({bool? web, String? pageHost}) {
    var base = siteUrl.trim().isEmpty ? 'https://kja-phi.vercel.app' : siteUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final onWeb = web ?? kIsWeb;
    final host = pageHost ?? Uri.base.host;
    final remoteNext = RegExp(
      r'^https?://((www\.)?kja\.ug|kja-phi\.vercel\.app)$',
      caseSensitive: false,
    ).hasMatch(base);
    if (onWeb && remoteNext && (host == 'localhost' || host == '127.0.0.1')) {
      return 'http://127.0.0.1:3000';
    }
    return base;
  }

  static String sitePath(String path) {
    final base = apiBase();
    final clean = path.startsWith('/') ? path : '/$path';
    return '$base$clean';
  }

  static String? _env(String name) {
    if (!dotenv.isInitialized) return null;
    return dotenv.maybeGet(name);
  }

  static String _firstNonEmpty(List<String?> values) {
    for (final value in values) {
      final trimmed = value?.trim() ?? '';
      if (trimmed.isNotEmpty) return trimmed;
    }
    return '';
  }
}
