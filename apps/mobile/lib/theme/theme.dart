import 'package:flutter/material.dart';

import 'tokens.dart';

/// The app's single light theme.
///
/// Deliberately one theme rather than light/dark: this app is read in a moment of stress, often
/// by someone older, and a consistent high-contrast surface is worth more here than matching the
/// system appearance. Type is a step larger than a typical app throughout.
ThemeData buildSentraTheme() {
  const base = ColorScheme.light(
    primary: SentraColors.accent,
    onPrimary: Colors.white,
    secondary: SentraColors.accentInk,
    onSecondary: Colors.white,
    surface: SentraColors.card,
    onSurface: SentraColors.ink,
    error: SentraColors.stop,
    onError: Colors.white,
  );

  const textTheme = TextTheme(
    displaySmall: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -0.6, color: SentraColors.ink),
    headlineMedium: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -0.4, color: SentraColors.ink),
    headlineSmall: TextStyle(fontSize: 21, fontWeight: FontWeight.w700, letterSpacing: -0.3, color: SentraColors.ink),
    titleLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: SentraColors.ink),
    titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: SentraColors.ink),
    bodyLarge: TextStyle(fontSize: 16, height: 1.45, color: SentraColors.inkSoft),
    bodyMedium: TextStyle(fontSize: 15, height: 1.45, color: SentraColors.muted),
    bodySmall: TextStyle(fontSize: 13.5, height: 1.4, color: SentraColors.muted),
    labelLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
    labelSmall: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 0.7, color: SentraColors.faint),
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: base,
    scaffoldBackgroundColor: SentraColors.ground,
    textTheme: textTheme,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: const AppBarTheme(
      backgroundColor: SentraColors.ground,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: SentraColors.ink),
      iconTheme: IconThemeData(color: SentraColors.ink),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(54),
        backgroundColor: SentraColors.accent,
        foregroundColor: Colors.white,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(54),
        foregroundColor: SentraColors.ink,
        side: const BorderSide(color: SentraColors.lineStrong, width: 1.5),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: SentraColors.accentInk,
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: SentraColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.lg),
      hintStyle: const TextStyle(color: SentraColors.faint, fontSize: 15.5),
      labelStyle: const TextStyle(color: SentraColors.muted, fontSize: 15),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: const BorderSide(color: SentraColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: const BorderSide(color: SentraColors.accent, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: const BorderSide(color: SentraColors.stop, width: 1.5),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: const BorderSide(color: SentraColors.stop, width: 2),
      ),
    ),
    dividerTheme: const DividerThemeData(color: SentraColors.line, thickness: 1, space: 1),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: SentraColors.ink,
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 14.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
    ),
  );
}
