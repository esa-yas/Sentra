import 'package:flutter/material.dart';

/// Sentra's design tokens, defined once for both themes.
///
/// Every colour the app draws comes from here through [SentraPalette], never from a literal in a
/// widget. That is what makes a real dark mode possible: a screen written against the tokens is
/// correct in both themes without a single `isDark` check in its build method.
///
/// The scale is deliberately a step larger than a typical app. The people most often targeted by
/// authorized-payment scams are not the people who comfortably read 12pt grey text in a hurry,
/// and this app has to be legible in the worst moment of someone's week.
@immutable
class SentraPalette extends ThemeExtension<SentraPalette> {
  const SentraPalette({
    required this.ground,
    required this.surface,
    required this.surfaceRaised,
    required this.line,
    required this.lineStrong,
    required this.ink,
    required this.inkSoft,
    required this.muted,
    required this.faint,
    required this.accent,
    required this.accentSoft,
    required this.accentInk,
    required this.onAccent,
    required this.glow,
    required this.stop,
    required this.stopBg,
    required this.stopLine,
    required this.warn,
    required this.warnBg,
    required this.warnLine,
    required this.safe,
    required this.safeBg,
    required this.safeLine,
    required this.isDark,
  });

  final Color ground;
  final Color surface;
  final Color surfaceRaised;
  final Color line;
  final Color lineStrong;

  final Color ink;
  final Color inkSoft;
  final Color muted;
  final Color faint;

  final Color accent;
  final Color accentSoft;
  final Color accentInk;
  final Color onAccent;

  /// The halo behind the mark on the auth screens.
  final Color glow;

  // Risk. Each pairs a strong colour for text and icons with a tint for fills.
  final Color stop;
  final Color stopBg;
  final Color stopLine;
  final Color warn;
  final Color warnBg;
  final Color warnLine;
  final Color safe;
  final Color safeBg;
  final Color safeLine;

  final bool isDark;

  /// Light: a soft, slightly violet white so the purple never looks pasted on.
  static const light = SentraPalette(
    ground: Color(0xFFF6F6FB),
    surface: Color(0xFFFFFFFF),
    surfaceRaised: Color(0xFFFFFFFF),
    line: Color(0xFFE8E8F2),
    lineStrong: Color(0xFFD6D6E6),
    ink: Color(0xFF121220),
    inkSoft: Color(0xFF383850),
    muted: Color(0xFF5C5C74),
    faint: Color(0xFF8E8EA6),
    accent: Color(0xFF6D4EF0),
    accentSoft: Color(0xFFEDE8FF),
    accentInk: Color(0xFF5334D8),
    onAccent: Color(0xFFFFFFFF),
    glow: Color(0xFF8B6DF2),
    stop: Color(0xFFC8322A),
    stopBg: Color(0xFFFDECEB),
    stopLine: Color(0xFFF2C7C3),
    warn: Color(0xFF9A6200),
    warnBg: Color(0xFFFBF1DD),
    warnLine: Color(0xFFEFDAAA),
    safe: Color(0xFF0D7350),
    safeBg: Color(0xFFE4F4EE),
    safeLine: Color(0xFFBFE3D3),
    isDark: false,
  );

  /// Dark: near-black with a violet cast, the way the brand mark's halo falls on a surface.
  static const dark = SentraPalette(
    ground: Color(0xFF08080D),
    surface: Color(0xFF121219),
    surfaceRaised: Color(0xFF191922),
    line: Color(0xFF262633),
    lineStrong: Color(0xFF343444),
    ink: Color(0xFFF4F3F9),
    inkSoft: Color(0xFFD3D1E0),
    muted: Color(0xFF9C9AB0),
    faint: Color(0xFF6E6C82),
    accent: Color(0xFF8B6DF2),
    accentSoft: Color(0xFF1E1938),
    accentInk: Color(0xFFB9A6FB),
    onAccent: Color(0xFF0B0716),
    glow: Color(0xFF8B6DF2),
    stop: Color(0xFFFF7A68),
    stopBg: Color(0xFF2A1512),
    stopLine: Color(0xFF4A211B),
    warn: Color(0xFFE8B15A),
    warnBg: Color(0xFF2A2013),
    warnLine: Color(0xFF473519),
    safe: Color(0xFF48CC98),
    safeBg: Color(0xFF0F2620),
    safeLine: Color(0xFF1C4436),
    isDark: true,
  );

  /// The palette for the active theme. Screens read colours through this.
  static SentraPalette of(BuildContext context) =>
      Theme.of(context).extension<SentraPalette>() ?? light;

  @override
  SentraPalette copyWith() => this;

  /// Colours are swapped wholesale between themes rather than blended, so a mid-transition
  /// frame never shows a half-mixed accent.
  @override
  SentraPalette lerp(ThemeExtension<SentraPalette>? other, double t) {
    if (other is! SentraPalette) return this;
    return t < 0.5 ? this : other;
  }
}

/// A 4pt spacing scale. Named steps keep screens consistent without magic numbers.
class Gap {
  const Gap._();
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double huge = 44;
}

class Radii {
  const Radii._();
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 20;
  static const double xl = 28;
  static const double pill = 999;
}

/// Vertical spacers, so a screen reads as a list of content rather than of SizedBoxes.
class VGap extends StatelessWidget {
  const VGap(this.height, {super.key});
  const VGap.xs({super.key}) : height = Gap.xs;
  const VGap.sm({super.key}) : height = Gap.sm;
  const VGap.md({super.key}) : height = Gap.md;
  const VGap.lg({super.key}) : height = Gap.lg;
  const VGap.xl({super.key}) : height = Gap.xl;
  const VGap.xxl({super.key}) : height = Gap.xxl;

  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(height: height);
}
