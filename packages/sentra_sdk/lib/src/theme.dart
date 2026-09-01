import 'package:flutter/material.dart';

/// The SDK's own colours.
///
/// Self-contained on purpose: the intervention has to look like Sentra no matter what theme the
/// host bank app uses, so it never reads the host's `Theme`. It adapts to the platform's light or
/// dark brightness, but the accent and the risk colours are always Sentra's.
class SentraSdkColors {
  const SentraSdkColors({
    required this.ground,
    required this.surface,
    required this.line,
    required this.ink,
    required this.muted,
    required this.accent,
    required this.accentInk,
    required this.stop,
    required this.stopBg,
    required this.stopLine,
    required this.warn,
    required this.warnBg,
    required this.warnLine,
    required this.onAccent,
  });

  final Color ground, surface, line, ink, muted;
  final Color accent, accentInk, onAccent;
  final Color stop, stopBg, stopLine;
  final Color warn, warnBg, warnLine;

  static const light = SentraSdkColors(
    ground: Color(0xFFF6F6FB),
    surface: Color(0xFFFFFFFF),
    line: Color(0xFFE8E8F2),
    ink: Color(0xFF121220),
    muted: Color(0xFF5C5C74),
    accent: Color(0xFF6D4EF0),
    accentInk: Color(0xFF5334D8),
    onAccent: Color(0xFFFFFFFF),
    stop: Color(0xFFC8322A),
    stopBg: Color(0xFFFDECEB),
    stopLine: Color(0xFFF2C7C3),
    warn: Color(0xFF9A6200),
    warnBg: Color(0xFFFBF1DD),
    warnLine: Color(0xFFEFDAAA),
  );

  static const dark = SentraSdkColors(
    ground: Color(0xFF0A0A12),
    surface: Color(0xFF15151E),
    line: Color(0xFF272733),
    ink: Color(0xFFF4F3F9),
    muted: Color(0xFF9C9AB0),
    accent: Color(0xFF8B6DF2),
    accentInk: Color(0xFFB9A6FB),
    onAccent: Color(0xFF0B0716),
    stop: Color(0xFFFF7A68),
    stopBg: Color(0xFF2A1512),
    stopLine: Color(0xFF4A211B),
    warn: Color(0xFFE8B15A),
    warnBg: Color(0xFF2A2013),
    warnLine: Color(0xFF473519),
  );

  static SentraSdkColors of(BuildContext context) =>
      MediaQuery.platformBrightnessOf(context) == Brightness.dark ? dark : light;
}
