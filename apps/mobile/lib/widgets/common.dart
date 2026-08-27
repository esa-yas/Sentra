import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/tokens.dart';

/// Formats money the way a person reads it, not the way a ledger stores it.
String formatMoney(double amount, String currency) {
  final symbols = {'GBP': '£', 'USD': r'$', 'EUR': '€'};
  final symbol = symbols[currency.toUpperCase()] ?? '$currency ';
  final formatter = NumberFormat('#,##0.00', 'en_GB');
  return '$symbol${formatter.format(amount)}';
}

/// "Yesterday", "3 days ago" — relative time is easier to place than a date stamp.
String formatWhen(DateTime at) {
  final diff = DateTime.now().difference(at);
  if (diff.inMinutes < 1) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays == 1) return 'Yesterday';
  if (diff.inDays < 7) return '${diff.inDays} days ago';
  return DateFormat('d MMM').format(at);
}

/// First letter of a name, for an avatar. Guards against an empty string.
String initialOf(String name) =>
    name.trim().isEmpty ? '?' : name.trim().substring(0, 1).toUpperCase();

/// The brand lockup.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 30});
  final double size;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF8B6DF2), SentraColors.accent],
              ),
              borderRadius: BorderRadius.circular(size * 0.3),
            ),
            alignment: Alignment.center,
            child: Text(
              'S',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: size * 0.55,
              ),
            ),
          ),
          const SizedBox(width: Gap.sm),
          const Text(
            'Sentra',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: SentraColors.ink),
          ),
        ],
      );
}

/// A plain surface panel. Most screens are a column of these.
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
    final content = Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? SentraColors.card,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(color: borderColor ?? SentraColors.line),
      ),
      child: child,
    );
    if (onTap == null) return content;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Radii.lg),
      child: content,
    );
  }
}

/// A small uppercase section label.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall,
      );
}

/// Risk severity, carried by colour *and* an icon *and* a word — never colour alone.
enum Severity { safe, caution, stop, neutral }

class SeverityStyle {
  const SeverityStyle(this.fg, this.bg, this.line, this.icon);
  final Color fg;
  final Color bg;
  final Color line;
  final IconData icon;

  static SeverityStyle of(Severity severity) => switch (severity) {
        Severity.stop => const SeverityStyle(
            SentraColors.stop, SentraColors.stopBg, SentraColors.stopLine, Icons.gpp_maybe_rounded),
        Severity.caution => const SeverityStyle(
            SentraColors.warn, SentraColors.warnBg, SentraColors.warnLine, Icons.error_outline_rounded),
        Severity.safe => const SeverityStyle(
            SentraColors.safe, SentraColors.safeBg, SentraColors.safeLine, Icons.verified_rounded),
        Severity.neutral => const SeverityStyle(
            SentraColors.accentInk, SentraColors.accentSoft, SentraColors.accentSoft, Icons.info_outline_rounded),
      };
}

/// A status pill: icon + word, so meaning survives without colour.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, required this.severity, this.icon});

  final String label;
  final Severity severity;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final style = SeverityStyle.of(severity);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gap.md, vertical: 7),
      decoration: BoxDecoration(
        color: style.bg,
        borderRadius: BorderRadius.circular(Radii.pill),
        border: Border.all(color: style.line),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon ?? style.icon, size: 15, color: style.fg),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: style.fg, fontWeight: FontWeight.w700, fontSize: 12.5),
            ),
          ),
        ],
      ),
    );
  }
}

/// A tinted square holding an icon — used in every list row.
class IconTile extends StatelessWidget {
  const IconTile({super.key, required this.icon, required this.severity, this.size = 40});

  final IconData icon;
  final Severity severity;
  final double size;

  @override
  Widget build(BuildContext context) {
    final style = SeverityStyle.of(severity);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: style.bg, borderRadius: BorderRadius.circular(Radii.md)),
      child: Icon(icon, color: style.fg, size: size * 0.5),
    );
  }
}

/// An inline message block.
class Notice extends StatelessWidget {
  const Notice({super.key, required this.severity, required this.child, this.title});

  final Severity severity;
  final Widget child;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final style = SeverityStyle.of(severity);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Gap.lg),
      decoration: BoxDecoration(
        color: style.bg,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: style.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Row(
              children: [
                Icon(style.icon, size: 17, color: style.fg),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    title!,
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, color: style.fg),
                  ),
                ),
              ],
            ),
            const VGap.sm(),
          ],
          DefaultTextStyle.merge(
            style: TextStyle(fontSize: 13.5, height: 1.45, color: style.fg),
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
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: Gap.lg),
        child: Column(
          children: [
            IconTile(icon: icon, severity: Severity.neutral, size: 56),
            const VGap.lg(),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const VGap.sm(),
            Text(
              body,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      );
}
