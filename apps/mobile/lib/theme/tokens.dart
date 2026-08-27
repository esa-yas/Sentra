import 'package:flutter/material.dart';

/// Design tokens for the Sentra app.
///
/// The people most often targeted by authorized-payment scams are not the people who read small
/// grey type on a phone in a hurry. So the palette is high-contrast, the type scale starts larger
/// than a typical app, and risk is carried by colour *and* words *and* an icon — never colour
/// alone, which a colour-blind or sun-glared reader would miss.
class SentraColors {
  const SentraColors._();

  // Brand
  static const Color accent = Color(0xFF6D4EF0);
  static const Color accentInk = Color(0xFF5334D8);
  static const Color accentSoft = Color(0xFFEFEAFF);

  // Surfaces
  static const Color ground = Color(0xFFF5F6FB);
  static const Color card = Color(0xFFFFFFFF);
  static const Color line = Color(0xFFE9EBF3);
  static const Color lineStrong = Color(0xFFD9DDEA);

  // Ink
  static const Color ink = Color(0xFF12152A);
  static const Color inkSoft = Color(0xFF3A4055);
  static const Color muted = Color(0xFF5A6076);
  static const Color faint = Color(0xFF8B92A8);

  // Risk. Each pairs a strong colour for text/icons with a tint for backgrounds.
  static const Color stop = Color(0xFFD1372A);
  static const Color stopBg = Color(0xFFFDECEB);
  static const Color stopLine = Color(0xFFF3C9C5);

  static const Color warn = Color(0xFFA86A00);
  static const Color warnBg = Color(0xFFFBF1DD);
  static const Color warnLine = Color(0xFFF0DCAE);

  static const Color safe = Color(0xFF0F7A53);
  static const Color safeBg = Color(0xFFE6F4EE);
  static const Color safeLine = Color(0xFFC3E4D5);
}

/// A 4pt spacing scale. Naming the steps keeps screens consistent without magic numbers.
class Gap {
  const Gap._();
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
}

class Radii {
  const Radii._();
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 18;
  static const double pill = 999;
}

/// Vertical spacers, so screens read as a list of content rather than a list of SizedBoxes.
class VGap extends StatelessWidget {
  const VGap(this.height, {super.key});
  const VGap.sm({super.key}) : height = Gap.sm;
  const VGap.md({super.key}) : height = Gap.md;
  const VGap.lg({super.key}) : height = Gap.lg;
  const VGap.xl({super.key}) : height = Gap.xl;

  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(height: height);
}
