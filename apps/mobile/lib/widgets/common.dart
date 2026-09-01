import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/tokens.dart';

/// Formats money the way a person reads it, not the way a ledger stores it.
String formatMoney(double amount, String currency) {
  const symbols = {'GBP': '£', 'USD': r'$', 'EUR': '€'};
  final symbol = symbols[currency.toUpperCase()] ?? '$currency ';
  return '$symbol${NumberFormat('#,##0.00', 'en_GB').format(amount)}';
}

/// Relative time is easier to place at a glance than a date stamp.
String formatWhen(DateTime at) {
  final diff = DateTime.now().difference(at);
  if (diff.inMinutes < 1) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays == 1) return 'Yesterday';
  if (diff.inDays < 7) return '${diff.inDays} days ago';
  return DateFormat('d MMM').format(at);
}

/// Shared email validation, so every form rejects the same things for the same reasons.
String? validateEmail(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return 'Enter your email address';
  if (!RegExp(r'^[^@\s]+@[^@\s.]+\.[^@\s]+$').hasMatch(v)) {
    return 'That doesn’t look like an email address';
  }
  return null;
}

/// Says plainly that something isn't wired yet, rather than failing silently on tap.
void showComingSoon(BuildContext context, String what) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('$what isn’t connected yet.')),
  );
}

/// The wordmark, used in app bars.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 30});
  final double size;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color.lerp(p.accent, Colors.white, 0.22)!, p.accent],
            ),
            borderRadius: BorderRadius.circular(size * 0.3),
          ),
          child: Icon(Icons.shield_rounded, size: size * 0.56, color: Colors.white),
        ),
        const SizedBox(width: Gap.sm),
        Text('Sentra',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: p.ink)),
      ],
    );
  }
}

/// A surface panel. Most screens are a column of these.
class SentraCard extends StatelessWidget {
  const SentraCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(Gap.lg),
    this.color,
    this.borderColor,
    this.onTap,
  });

  final Widget child;
  final EdgeInsets padding;
  final Color? color;
  final Color? borderColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final content = Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? p.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(color: borderColor ?? p.line),
      ),
      child: child,
    );
    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Radii.lg),
        child: content,
      ),
    );
  }
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: Theme.of(context).textTheme.labelSmall);
}

/// Risk severity. Carried by colour *and* an icon *and* a word — never colour alone, so it
/// survives colour-blindness and a phone screen in direct sun.
enum Severity { safe, caution, stop, neutral }

class SeverityStyle {
  const SeverityStyle(this.fg, this.bg, this.line, this.icon);
  final Color fg;
  final Color bg;
  final Color line;
  final IconData icon;

  static SeverityStyle of(BuildContext context, Severity severity) {
    final p = SentraPalette.of(context);
    return switch (severity) {
      Severity.stop => SeverityStyle(p.stop, p.stopBg, p.stopLine, Icons.gpp_maybe_rounded),
      Severity.caution =>
        SeverityStyle(p.warn, p.warnBg, p.warnLine, Icons.error_outline_rounded),
      Severity.safe => SeverityStyle(p.safe, p.safeBg, p.safeLine, Icons.verified_rounded),
      Severity.neutral =>
        SeverityStyle(p.accentInk, p.accentSoft, p.accentSoft, Icons.info_outline_rounded),
    };
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, required this.severity, this.icon});

  final String label;
  final Severity severity;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final s = SeverityStyle.of(context, severity);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gap.md, vertical: 7),
      decoration: BoxDecoration(
        color: s.bg,
        borderRadius: BorderRadius.circular(Radii.pill),
        border: Border.all(color: s.line),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon ?? s.icon, size: 15, color: s.fg),
          const SizedBox(width: 6),
          Flexible(
            child: Text(label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: s.fg, fontWeight: FontWeight.w700, fontSize: 12.5)),
          ),
        ],
      ),
    );
  }
}

class IconTile extends StatelessWidget {
  const IconTile({super.key, required this.icon, required this.severity, this.size = 42});

  final IconData icon;
  final Severity severity;
  final double size;

  @override
  Widget build(BuildContext context) {
    final s = SeverityStyle.of(context, severity);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: s.bg, borderRadius: BorderRadius.circular(Radii.md)),
      child: Icon(icon, color: s.fg, size: size * 0.5),
    );
  }
}

class Notice extends StatelessWidget {
  const Notice({super.key, required this.severity, required this.child, this.title});

  final Severity severity;
  final Widget child;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final s = SeverityStyle.of(context, severity);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Gap.lg),
      decoration: BoxDecoration(
        color: s.bg,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: s.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Row(
              children: [
                Icon(s.icon, size: 18, color: s.fg),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(title!,
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: s.fg)),
                ),
              ],
            ),
            const VGap.sm(),
          ],
          DefaultTextStyle.merge(
            style: TextStyle(fontSize: 14, height: 1.45, color: s.fg),
            child: child,
          ),
        ],
      ),
    );
  }
}

/// An empty state that explains rather than apologises.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: Gap.huge, horizontal: Gap.lg),
        child: Column(
          children: [
            IconTile(icon: icon, severity: Severity.neutral, size: 60),
            const VGap.lg(),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const VGap.sm(),
            Text(body,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
}
