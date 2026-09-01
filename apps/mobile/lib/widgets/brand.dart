import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// The Sentra mark: a shield inside a lit orb.
///
/// The glow is the point. A scam-prevention app is asking for trust in the worst minute of
/// someone's week, and a mark that looks lit from within reads as active protection rather than
/// as a logo sitting on a page. It carries the same weight in both themes because the halo is
/// drawn from the accent, not from the background.
class BrandOrb extends StatelessWidget {
  const BrandOrb({super.key, this.size = 116});

  final double size;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    return SizedBox(
      width: size * 1.9,
      height: size * 1.9,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Concentric rings, fading outward — the sense of a signal radiating.
          CustomPaint(
            size: Size(size * 1.9, size * 1.9),
            painter: _RingPainter(color: p.accent.withValues(alpha: p.isDark ? 0.16 : 0.13)),
          ),
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                center: const Alignment(-0.35, -0.5),
                radius: 1.05,
                colors: [
                  Color.lerp(p.accent, Colors.white, p.isDark ? 0.18 : 0.34)!,
                  p.accent,
                  Color.lerp(p.accent, Colors.black, p.isDark ? 0.55 : 0.12)!,
                ],
                stops: const [0, 0.55, 1],
              ),
              boxShadow: [
                BoxShadow(
                  color: p.glow.withValues(alpha: p.isDark ? 0.5 : 0.34),
                  blurRadius: size * 0.55,
                  spreadRadius: size * 0.02,
                ),
              ],
            ),
            child: Icon(
              Icons.shield_rounded,
              size: size * 0.44,
              color: Colors.white.withValues(alpha: 0.95),
            ),
          ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    for (var i = 0; i < 3; i++) {
      final t = (i + 1) / 3;
      canvas.drawCircle(
        centre,
        size.width * (0.28 + t * 0.21),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1
          ..color = color.withValues(alpha: color.a * (1 - t * 0.6)),
      );
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.color != color;
}

/// The dotted texture in the corner of the auth screens — depth without an image asset.
class DotGrid extends StatelessWidget {
  const DotGrid({super.key, this.size = const Size(200, 170), this.alignment = Alignment.topLeft});

  final Size size;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    return Align(
      alignment: alignment,
      child: IgnorePointer(
        child: CustomPaint(
          size: size,
          painter: _DotPainter(
            color: p.ink.withValues(alpha: p.isDark ? 0.10 : 0.07),
            fadeFrom: alignment,
          ),
        ),
      ),
    );
  }
}

class _DotPainter extends CustomPainter {
  const _DotPainter({required this.color, required this.fadeFrom});
  final Color color;
  final Alignment fadeFrom;

  @override
  void paint(Canvas canvas, Size size) {
    const spacing = 14.0;
    final origin = Offset(
      fadeFrom.x < 0 ? 0 : size.width,
      fadeFrom.y < 0 ? 0 : size.height,
    );
    final maxDistance = math.sqrt(size.width * size.width + size.height * size.height);
    final paint = Paint();

    for (var x = 6.0; x < size.width; x += spacing) {
      for (var y = 6.0; y < size.height; y += spacing) {
        final d = (Offset(x, y) - origin).distance / maxDistance;
        final alpha = color.a * (1 - d).clamp(0.0, 1.0);
        if (alpha <= 0.01) continue;
        paint.color = color.withValues(alpha: alpha);
        canvas.drawCircle(Offset(x, y), 1.4, paint);
      }
    }
  }

  @override
  bool shouldRepaint(_DotPainter old) => old.color != color;
}

/// The small circular chip used in the auth header, for the back arrow and the brand.
class CircleChip extends StatelessWidget {
  const CircleChip({super.key, required this.icon, this.onTap, this.accented = false});

  final IconData icon;
  final VoidCallback? onTap;
  final bool accented;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    return Semantics(
      button: onTap != null,
      child: Material(
        color: accented ? p.accentSoft : (p.isDark ? p.surfaceRaised : p.surface),
        shape: CircleBorder(side: BorderSide(color: p.line)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 46,
            height: 46,
            child: Icon(icon, size: 20, color: accented ? p.accentInk : p.inkSoft),
          ),
        ),
      ),
    );
  }
}
