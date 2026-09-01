import 'package:flutter/material.dart';

import '../../app.dart';
import '../../models/models.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// One row of the Protection Log, shared with the home screen so the two never drift apart.
class ActivityRow extends StatelessWidget {
  const ActivityRow({super.key, required this.entry});

  final ActivityEntry entry;

  static (IconData, Severity) _look(ActivityKind kind) => switch (kind) {
        ActivityKind.held => (Icons.gpp_bad_rounded, Severity.stop),
        ActivityKind.warned => (Icons.warning_amber_rounded, Severity.caution),
        ActivityKind.checked => (Icons.verified_rounded, Severity.safe),
        ActivityKind.guardianApproved => (Icons.how_to_reg_rounded, Severity.neutral),
        ActivityKind.guardianAdded => (Icons.people_alt_rounded, Severity.neutral),
      };

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;
    final (icon, severity) = _look(entry.kind);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Gap.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconTile(icon: icon, severity: severity),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(entry.title,
                          style: text.titleMedium?.copyWith(fontSize: 15.5)),
                    ),
                    const SizedBox(width: Gap.sm),
                    Text(formatWhen(entry.at),
                        style: text.bodySmall?.copyWith(color: p.faint, fontSize: 12.5)),
                  ],
                ),
                const SizedBox(height: 2),
                Text(entry.subtitle, style: text.bodySmall),
                if (entry.caseReference != null) ...[
                  const SizedBox(height: 6),
                  Text('Ref ${entry.caseReference}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: p.accentInk,
                        letterSpacing: 0.3,
                      )),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The Protection Log: everything Sentra has done, in order.
class ActivityScreen extends StatelessWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final state = AppScope.of(context);
    final entries = state.activity;

    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: entries.isEmpty
          ? const EmptyState(
              icon: Icons.receipt_long_rounded,
              title: 'No activity yet',
              body: 'Every payment we check — and every one we stop — is recorded here, with the '
                  'reasons behind it.',
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.sm, Gap.lg, Gap.xxl),
              children: [
                Text(
                  'A record of every check. If a payment was held, the reference is what you quote '
                  'to your bank.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const VGap.lg(),
                SentraCard(
                  padding: const EdgeInsets.symmetric(horizontal: Gap.lg),
                  child: Column(
                    children: [
                      for (var i = 0; i < entries.length; i++) ...[
                        if (i > 0) Divider(color: p.line, height: 1),
                        ActivityRow(entry: entries[i]),
                      ],
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
