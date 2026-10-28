import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Kampala Junior Academy parents — navy crest, warm gold, mist paper.
class KjaColors {
  static const ink = Color(0xFF122033);
  static const soft = Color(0xFF5A6878);
  static const mute = Color(0xFF8A96A5);
  static const rose = Color(0xFFD61F32);
  static const sky = Color(0xFF0EA5E9);
  static const skyDeep = Color(0xFF0369A1);
  static const mint = Color(0xFF10B981);
  static const mintDeep = Color(0xFF047857);
  static const sun = Color(0xFFF59E0B);
  static const sunDeep = Color(0xFFB45309);
  static const gold = Color(0xFFFDA31B);
  static const goldDeep = Color(0xFFC47E08);
  static const lilac = Color(0xFF7C6CF0);
  static const lilacDeep = Color(0xFF5B4BD6);
  static const coral = Color(0xFFF97316);
  static const coralDeep = Color(0xFFC2410C);
  static const navy = Color(0xFF163A5F);
  static const navyDeep = Color(0xFF0C243C);
  static const paper = Color(0xFFF4F7FB);
  static const cream = Color(0xFFFFF9F2);
  static const line = Color(0xFFE4EAF1);
  static const card = Color(0xFFFFFFFF);
  static const skyWash = Color(0xFFE8F6FE);
  static const mintWash = Color(0xFFE6F8F1);
  static const sunWash = Color(0xFFFFF6E0);
  static const roseWash = Color(0xFFFEE8EA);
  static const lilacWash = Color(0xFFF1EDFE);
  static const coralWash = Color(0xFFFFF0E6);
  static const goldWash = Color(0xFFFFF4DD);

  static const pageTop = Color(0xFFF3F7FC);
  static const pageMid = Color(0xFFF7F9FC);
  static const pageBottom = Color(0xFFFBF7F1);
}

class Tone {
  const Tone(this.ink, this.wash);
  final Color ink;
  final Color wash;

  static const sky = Tone(KjaColors.skyDeep, KjaColors.skyWash);
  static const mint = Tone(KjaColors.mintDeep, KjaColors.mintWash);
  static const sun = Tone(KjaColors.sunDeep, KjaColors.sunWash);
  static const rose = Tone(KjaColors.rose, KjaColors.roseWash);
  static const lilac = Tone(KjaColors.lilacDeep, KjaColors.lilacWash);
  static const coral = Tone(KjaColors.coralDeep, KjaColors.coralWash);
  static const gold = Tone(KjaColors.goldDeep, KjaColors.goldWash);
  static const navy = Tone(KjaColors.navy, Color(0xFFE8EEF5));
}

ThemeData buildKjaTheme() {
  const family = 'Nunito';
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: family,
    colorScheme: ColorScheme.fromSeed(
      seedColor: KjaColors.navy,
      primary: KjaColors.navy,
      secondary: KjaColors.gold,
      surface: Colors.white,
      error: KjaColors.rose,
    ),
    scaffoldBackgroundColor: KjaColors.paper,
  );
  final text = base.textTheme.apply(
    fontFamily: family,
    bodyColor: KjaColors.ink,
    displayColor: KjaColors.ink,
  );
  return base.copyWith(
    textTheme: text.copyWith(
      headlineMedium: text.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.45),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.25),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      bodyLarge: text.bodyLarge?.copyWith(height: 1.45),
      bodyMedium: text.bodyMedium?.copyWith(height: 1.45, color: KjaColors.soft),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
    ),
    primaryTextTheme: text,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: KjaColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: 8,
      toolbarHeight: 66,
      systemOverlayStyle: SystemUiOverlayStyle.dark,
      titleTextStyle: TextStyle(
        fontFamily: family,
        color: KjaColors.ink,
        fontSize: 16,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.2,
      ),
      iconTheme: IconThemeData(color: KjaColors.ink),
    ),
    drawerTheme: const DrawerThemeData(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      width: 304,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: KjaColors.line),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white,
      selectedColor: KjaColors.skyWash,
      disabledColor: const Color(0xFFF1F5F9),
      labelStyle: const TextStyle(fontFamily: family, fontWeight: FontWeight.w700, color: KjaColors.ink),
      secondaryLabelStyle: const TextStyle(fontFamily: family, fontWeight: FontWeight.w700, color: KjaColors.skyDeep),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      side: const BorderSide(color: KjaColors.line),
      showCheckmark: false,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: KjaColors.navy,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontFamily: family, fontWeight: FontWeight.w800, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: KjaColors.ink,
        side: const BorderSide(color: KjaColors.line),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontFamily: family, fontWeight: FontWeight.w700, fontSize: 14),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: KjaColors.skyDeep,
        textStyle: const TextStyle(fontFamily: family, fontWeight: FontWeight.w800),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      hintStyle: const TextStyle(color: KjaColors.mute, fontWeight: FontWeight.w600),
      labelStyle: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w700),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: KjaColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: KjaColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: KjaColors.gold, width: 1.7),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      titleTextStyle: const TextStyle(
        fontFamily: family,
        color: KjaColors.ink,
        fontSize: 18,
        fontWeight: FontWeight.w800,
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: KjaColors.ink,
      contentTextStyle: const TextStyle(fontFamily: family, color: Colors.white, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: KjaColors.navy),
    dividerTheme: const DividerThemeData(color: KjaColors.line, thickness: 1, space: 1),
  );
}

IconData clubIcon(String title) {
  final key = title.toLowerCase();
  if (RegExp(r'sport|ball|football|netball|athlet|swim|badminton').hasMatch(key)) {
    return Icons.sports_soccer_rounded;
  }
  if (RegExp(r'music|choir|sing|band|piano').hasMatch(key)) return Icons.music_note_rounded;
  if (RegExp(r'art|craft|draw|paint').hasMatch(key)) return Icons.palette_rounded;
  if (RegExp(r'drama|theatre|theater|dance').hasMatch(key)) return Icons.theater_comedy_rounded;
  if (RegExp(r'science|stem|robot|code|computer').hasMatch(key)) return Icons.science_rounded;
  if (RegExp(r'book|read|library|debate|writer').hasMatch(key)) return Icons.menu_book_rounded;
  if (RegExp(r'scout|guide|adventure|outdoor').hasMatch(key)) return Icons.explore_rounded;
  return Icons.extension_rounded;
}
