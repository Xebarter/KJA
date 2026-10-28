import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Production client config for KJA Pupils.
///
/// Priority:
/// 1. `--dart-define=SUPABASE_URL=…` / `SUPABASE_ANON_KEY=…` (CI / release)
/// 2. `.env` next to the app (`flutter_dotenv`)
/// 3. Values saved on the device (rare override)
///
/// Same public URL + anon key as the website. Never ship the service-role key.
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

  /// Tests only: inject env without reading the asset `.env`.
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
    } catch (_) {
      /* Missing .env is fine when dart-defines or prefs supply the keys. */
    }
    _dotenvReady = true;
  }

  static Future<AppConfig> load() async {
    await loadDotenv();
    // Preferences are only a device override. A failure here must not block
    // the keys already loaded from .env or dart-define.
    SharedPreferences? prefs;
    try {
      prefs = await SharedPreferences.getInstance().timeout(const Duration(seconds: 2));
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
      'https://kja.ug',
    ]);

    return AppConfig(url: url, anonKey: key);
  }

  static Future<void> save(String url, String anonKey) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('supabase_url', url.trim());
    await prefs.setString('supabase_anon_key', anonKey.trim());
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
