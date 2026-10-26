import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class KjaColors {
  static const ink = Color(0xFF16202A);
  static const soft = Color(0xFF5B6672);
  static const mute = Color(0xFF84909C);
  static const rose = Color(0xFFE02435);
  static const sky = Color(0xFF0EA5E9);
  static const skyDeep = Color(0xFF0369A1);
  static const mint = Color(0xFF10B981);
  static const mintDeep = Color(0xFF047857);
  static const sun = Color(0xFFF59E0B);
  static const sunDeep = Color(0xFFB45309);
  static const gold = Color(0xFFFDA31B);
  static const lilac = Color(0xFF8B5CF6);
  static const lilacDeep = Color(0xFF6D28D9);
  static const coral = Color(0xFFF97316);
  static const coralDeep = Color(0xFFC2410C);
  static const navy = Color(0xFF163A5F);
  static const paper = Color(0xFFF3F7FB);
  static const cream = Color(0xFFFFF9F2);
  static const line = Color(0xFFE6ECF2);
  static const card = Color(0xFFFFFFFF);
  static const skyWash = Color(0xFFE8F6FE);
  static const mintWash = Color(0xFFE6F8F1);
  static const sunWash = Color(0xFFFFF6E0);
  static const roseWash = Color(0xFFFEE8EA);
  static const lilacWash = Color(0xFFF1EDFE);
  static const coralWash = Color(0xFFFFF0E6);

  static const pageTop = Color(0xFFF5F8FC);
  static const pageMid = Color(0xFFF8FAFC);
  static const pageBottom = Color(0xFFFCF8F3);
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
      headlineMedium: text.headlineMedium?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.4,
      ),
      titleLarge: text.titleLarge?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.2,
      ),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      bodyLarge: text.bodyLarge?.copyWith(height: 1.4),
      bodyMedium: text.bodyMedium?.copyWith(height: 1.4, color: KjaColors.soft),
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
      toolbarHeight: 64,
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
      width: 300,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: KjaColors.line),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white,
      selectedColor: KjaColors.skyWash,
      disabledColor: const Color(0xFFF1F5F9),
      labelStyle: const TextStyle(
        fontFamily: family,
        fontWeight: FontWeight.w700,
        color: KjaColors.ink,
      ),
      secondaryLabelStyle: const TextStyle(
        fontFamily: family,
        fontWeight: FontWeight.w700,
        color: KjaColors.skyDeep,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      side: const BorderSide(color: KjaColors.line),
      showCheckmark: false,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: KjaColors.navy,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        textStyle: const TextStyle(
          fontFamily: family,
          fontWeight: FontWeight.w800,
          fontSize: 14,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: KjaColors.ink,
        side: const BorderSide(color: KjaColors.line),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        textStyle: const TextStyle(
          fontFamily: family,
          fontWeight: FontWeight.w700,
          fontSize: 14,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: KjaColors.skyDeep,
        textStyle: const TextStyle(
          fontFamily: family,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: const TextStyle(
        color: KjaColors.mute,
        fontWeight: FontWeight.w600,
      ),
      labelStyle: const TextStyle(
        color: KjaColors.soft,
        fontWeight: FontWeight.w700,
      ),
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
        borderSide: const BorderSide(color: KjaColors.gold, width: 1.6),
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
      contentTextStyle: const TextStyle(
        fontFamily: family,
        color: Colors.white,
        fontWeight: FontWeight.w600,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: KjaColors.navy,
    ),
    dividerTheme: const DividerThemeData(
      color: KjaColors.line,
      thickness: 1,
      space: 1,
    ),
  );
}
