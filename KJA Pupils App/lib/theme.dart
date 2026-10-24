import 'package:flutter/material.dart';

class KjaColors {
  static const ink = Color(0xFF19232B);
  static const soft = Color(0xFF5D6670);
  static const mute = Color(0xFF7A8794);
  static const rose = Color(0xFFE42435);
  static const sky = Color(0xFF0EA5E9);
  static const skyDeep = Color(0xFF0284C7);
  static const mint = Color(0xFF10B981);
  static const mintDeep = Color(0xFF059669);
  static const sun = Color(0xFFF59E0B);
  static const sunDeep = Color(0xFFD97706);
  static const gold = Color(0xFFFDA31B);
  static const lilac = Color(0xFF8B5CF6);
  static const lilacDeep = Color(0xFF7C3AED);
  static const coral = Color(0xFFF97316);
  static const coralDeep = Color(0xFFEA580C);
  static const navy = Color(0xFF1A3A5C);
  static const paper = Color(0xFFEEF7FF);
  static const cream = Color(0xFFFFF8EF);
  static const line = Color(0xFFE4EAF2);
  static const skyWash = Color(0xFFE0F2FE);
  static const mintWash = Color(0xFFD1FAE5);
  static const sunWash = Color(0xFFFEF3C7);
  static const roseWash = Color(0xFFFEE2E2);
  static const lilacWash = Color(0xFFEDE9FE);
  static const coralWash = Color(0xFFFFEDD5);
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
}

ThemeData buildKjaTheme() {
  const family = 'Nunito';
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: family,
    colorScheme: ColorScheme.fromSeed(
      seedColor: KjaColors.sky,
      primary: KjaColors.navy,
      secondary: KjaColors.rose,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: KjaColors.paper,
  );
  final text = base.textTheme.apply(
    fontFamily: family,
    bodyColor: KjaColors.ink,
    displayColor: KjaColors.ink,
  );
  return base.copyWith(
    textTheme: text,
    primaryTextTheme: text,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: KjaColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: 8,
      toolbarHeight: 64,
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
      width: 292,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: KjaColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: KjaColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: KjaColors.gold, width: 1.8),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

Color subjectColor(String? name) {
  final key = (name ?? '').toLowerCase();
  if (RegExp(r'math|numeracy|arith').hasMatch(key)) return KjaColors.sky;
  if (RegExp(r'eng|lit|read|writ|spell').hasMatch(key)) return KjaColors.rose;
  if (RegExp(r'sci|nature|environ').hasMatch(key)) return KjaColors.mint;
  if (RegExp(r'soc|hist|geog|cre|relig').hasMatch(key)) return KjaColors.sun;
  if (RegExp(r'art|music|pe|sport|drama|french|computer').hasMatch(key)) {
    return const Color(0xFF0F766E);
  }
  return KjaColors.coral;
}

IconData subjectIcon(String? name) {
  final key = (name ?? '').toLowerCase();
  if (RegExp(r'math|numeracy|arith').hasMatch(key)) return Icons.calculate_rounded;
  if (RegExp(r'eng|lit|read|writ|spell').hasMatch(key)) return Icons.menu_book_rounded;
  if (RegExp(r'sci|nature|environ').hasMatch(key)) return Icons.science_rounded;
  if (RegExp(r'soc|hist|geog|cre|relig').hasMatch(key)) return Icons.public_rounded;
  if (RegExp(r'art|music|pe|sport|drama').hasMatch(key)) return Icons.palette_rounded;
  return Icons.edit_rounded;
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

Color houseColor(String? house) {
  final key = (house ?? '').toLowerCase();
  if (RegExp(r'red|ruby|rose|phoenix').hasMatch(key)) return KjaColors.rose;
  if (RegExp(r'blue|sky|ocean|sapphire').hasMatch(key)) return KjaColors.sky;
  if (RegExp(r'green|emerald|leaf|forest').hasMatch(key)) return KjaColors.mint;
  if (RegExp(r'gold|yellow|sun|amber').hasMatch(key)) return KjaColors.sun;
  if (RegExp(r'orange|coral|tiger').hasMatch(key)) return KjaColors.coral;
  return const Color(0xFF0F766E);
}
