import 'package:flutter/material.dart';

import '../../app.dart';
import '../../models/models.dart';
import '../../services/demo_data.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import '../guardians/approval_screen.dart';
import '../intervention/intervention_screen.dart';

/// Home: reassurance first.
///
/// A scam-prevention app is silent when it is working, which is exactly when people forget it
/// exists and delete it. The shield and the count are the everyday reason to open it; the
/// waiting-approval card is the reason it earns a place on the home screen.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final text = Theme.of(context).textTheme;
    final recent = state.activity.take(3).toList();

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.lg, Gap.lg, Gap.xxl),
          children: [
            Row(
              children: [
                const BrandMark(size: 28),
                const Spacer(),
                IconButton(
                  onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('No new notifications.')),
                  ),
                  icon: const Icon(Icons.notifications_none_rounded),
                  tooltip: 'Notifications',
                ),
              ],
            ),
            const VGap.lg(),

            // The everyday state of the app.
            _ShieldHero(
              name: state.personName,
              checks: state.checksThisWeek,
              stopped: state.threatsStopped,
            ),

            if (state.pendingRequest != null) ...[
              const VGap.lg(),
              _ApprovalCallout(request: state.pendingRequest!),
            ],

            const VGap(Gap.xl),
            Row(
              children: [
                const SectionLabel('Recent activity'),
                const Spacer(),
                if (recent.isNotEmpty)
                  Text('Last 7 days', style: text.bodySmall),
              ],
            ),
            const VGap.md(),
            if (recent.isEmpty)
              const SentraCard(
                child: EmptyState(
                  icon: Icons.shield_moon_outlined,
                  title: 'Nothing to report',
                  body: 'When we check a payment, it will appear here.',
                ),
              )
            else
              SentraCard(
                padding: const EdgeInsets.symmetric(horizontal: Gap.lg),
                child: Column(
                  children: [
                    for (var i = 0; i < recent.length; i++)
                      ActivityRow(entry: recent[i], showDivider: i > 0),
                  ],
                ),
              ),

            const VGap(Gap.xl),
            const SectionLabel('Try it'),
            const VGap.md(),
            SentraCard(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => InterventionScreen(session: DemoData.scamSession()),
                ),
              ),
              child: Row(
                children: [
                  const IconTile(icon: Icons.play_arrow_rounded, severity: Severity.stop),
                  const SizedBox(width: Gap.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('See a scam being stopped', style: text.titleMedium),
                        const SizedBox(height: 2),
                        Text(
                          'Walk through what happens when we catch one',
                          style: text.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: SentraColors.faint),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShieldHero extends StatelessWidget {
  const _ShieldHero({required this.name, required this.checks, required this.stopped});

  final String name;
  final int checks;
  final int stopped;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: Gap.xl, horizontal: Gap.lg),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFEFEAFF), SentraColors.card],
        ),
        borderRadius: BorderRadius.circular(Radii.lg + 4),
        border: Border.all(color: const Color(0xFFE0D6FF)),
      ),
      child: Column(
        children: [
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              color: SentraColors.accent,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: SentraColors.accent.withValues(alpha: 0.4),
                  blurRadius: 22,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: const Icon(Icons.verified_user_rounded, color: Colors.white, size: 38),
          ),
          const VGap.lg(),
          Text('You’re protected, $name', style: text.headlineSmall),
          const SizedBox(height: 4),
          Text(
            checks == 0
                ? 'We’ll check every payment you make'
                : '$checks payment${checks == 1 ? '' : 's'} checked this week',
            style: text.bodyMedium,
          ),
          if (stopped > 0) ...[
            const VGap.lg(),
            StatusPill(
              label: '$stopped scam${stopped == 1 ? '' : 's'} stopped',
              severity: Severity.safe,
              icon: Icons.block_rounded,
            ),
          ],
        ],
      ),
    );
  }
}

/// The card that appears when someone who trusts this person needs a decision.
class _ApprovalCallout extends StatelessWidget {
  const _ApprovalCallout({required this.request});
  final GuardianRequest request;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SentraCard(
      color: SentraColors.stopBg,
      borderColor: SentraColors.stopLine,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => ApprovalScreen(request: request)),
      ),
      child: Row(
        children: [
          const IconTile(icon: Icons.shield_rounded, severity: Severity.stop, size: 44),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${request.forPersonName} needs you',
                  style: text.titleMedium?.copyWith(color: SentraColors.stop),
                ),
                const SizedBox(height: 2),
                Text(
                  'A ${formatMoney(request.amount, request.currency)} payment is held',
                  style: text.bodySmall?.copyWith(color: const Color(0xFF8A4A44)),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: SentraColors.stop),
        ],
      ),
    );
  }
}

/// One row of the Protection Log. Shared by Home and Activity so they can never drift.
class ActivityRow extends StatelessWidget {
  const ActivityRow({super.key, required this.entry, this.showDivider = true});

  final ActivityEntry entry;
  final bool showDivider;

  (IconData, Severity) get _look => switch (entry.kind) {
        ActivityKind.held => (Icons.gpp_bad_rounded, Severity.stop),
        ActivityKind.warned => (Icons.warning_amber_rounded, Severity.caution),
        ActivityKind.checked => (Icons.verified_rounded, Severity.safe),
        ActivityKind.guardianApproved => (Icons.how_to_reg_rounded, Severity.neutral),
        ActivityKind.guardianAdded => (Icons.people_alt_rounded, Severity.neutral),
      };

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final (icon, severity) = _look;
    return Column(
      children: [
        if (showDivider) const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: Gap.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconTile(icon: icon, severity: severity, size: 38),
              const SizedBox(width: Gap.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(entry.title, style: text.titleMedium?.copyWith(fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(entry.subtitle, style: text.bodySmall),
                    if (entry.caseReference != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        'Ref ${entry.caseReference}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: SentraColors.faint,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: Gap.sm),
              Text(formatWhen(entry.at), style: text.bodySmall?.copyWith(fontSize: 12.5)),
            ],
          ),
        ),
      ],
    );
  }
}
