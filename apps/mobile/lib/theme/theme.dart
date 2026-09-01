import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tokens.dart';

/// Builds a theme from a palette, so light and dark are the same code with different tokens.
///
/// Nothing here hard-codes a colour: both themes are generated from [SentraPalette], which is why
/// dark mode is a real design rather than an inverted afterthought.
ThemeData _themeFrom(SentraPalette p) {
  final scheme = ColorScheme(
    brightness: p.isDark ? Brightness.dark : Brightness.light,
    primary: p.accent,
    onPrimary: p.onAccent,
    secondary: p.accentInk,
    onSecondary: p.onAccent,
    surface: p.surface,
    onSurface: p.ink,
    error: p.stop,
    onError: p.isDark ? const Color(0xFF1A0B08) : Colors.white,
  );

  final text = TextTheme(
    displaySmall: TextStyle(
        fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -0.8, height: 1.1, color: p.ink),
    headlineMedium: TextStyle(
        fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.6, height: 1.15, color: p.ink),
    headlineSmall: TextStyle(
        fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.4, color: p.ink),
    titleLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: p.ink),
    titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: p.ink),
    bodyLarge: TextStyle(fontSize: 16, height: 1.5, color: p.inkSoft),
    bodyMedium: TextStyle(fontSize: 15, height: 1.5, color: p.muted),
    bodySmall: TextStyle(fontSize: 13.5, height: 1.45, color: p.muted),
    labelLarge: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
    // Field labels and section headers.
    labelMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: p.inkSoft),
    labelSmall: TextStyle(
        fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: p.faint),
  );

  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: BorderSide(color: c, width: w),
      );

  return ThemeData(
    useMaterial3: true,
    brightness: scheme.brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: p.ground,
    canvasColor: p.ground,
    textTheme: text,
    extensions: [p],
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: p.ground,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: p.ink),
      iconTheme: IconThemeData(color: p.ink),
      systemOverlayStyle:
          p.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: p.accent,
        foregroundColor: p.onAccent,
        disabledBackgroundColor: p.isDark ? p.surfaceRaised : p.lineStrong,
        disabledForegroundColor: p.faint,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.pill)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        foregroundColor: p.ink,
        side: BorderSide(color: p.lineStrong, width: 1.4),
        textStyle: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.pill)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: p.accentInk,
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.isDark ? p.surfaceRaised : p.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: 18),
      hintStyle: TextStyle(color: p.faint, fontSize: 15.5),
      labelStyle: TextStyle(color: p.muted, fontSize: 15),
      floatingLabelStyle: TextStyle(color: p.accent, fontSize: 14),
      prefixIconColor: p.faint,
      suffixIconColor: p.faint,
      enabledBorder: border(p.line),
      focusedBorder: border(p.accent, 1.8),
      errorBorder: border(p.stop, 1.4),
      focusedErrorBorder: border(p.stop, 1.8),
      errorStyle: TextStyle(color: p.stop, fontSize: 13),
    ),
    dividerTheme: DividerThemeData(color: p.line, thickness: 1, space: 1),
    checkboxTheme: CheckboxThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      side: BorderSide(color: p.lineStrong, width: 1.8),
      fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? p.accent : Colors.transparent),
      checkColor: WidgetStatePropertyAll(p.onAccent),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? p.onAccent : p.faint),
      trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? p.accent : p.line),
      trackOutlineColor: WidgetStatePropertyAll(p.line),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: p.isDark ? p.surfaceRaised : p.ink,
      contentTextStyle: TextStyle(color: p.isDark ? p.ink : p.ground, fontSize: 14.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.xl)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
    ),
  );
}

ThemeData sentraLightTheme() => _themeFrom(SentraPalette.light);
ThemeData sentraDarkTheme() => _themeFrom(SentraPalette.dark);
