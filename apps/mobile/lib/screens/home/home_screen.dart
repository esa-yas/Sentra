import 'package:flutter/material.dart';

import '../../app.dart';
import '../../services/demo_data.dart';
import '../../theme/tokens.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../activity/activity_screen.dart';
import '../guardians/approval_screen.dart';
import '../intervention/intervention_screen.dart';

/// Home.
///
/// Protection that works is invisible, and invisible protection gets deleted. So the first thing
/// on screen is proof the app has been doing something: what it checked, and what it stopped.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final request = state.pendingRequest;
    final recent = state.activity.take(3).toList();

    return Scaffold(
      body: Stack(
        children: [
          const Positioned(top: 0, right: 0, child: DotGrid(alignment: Alignment.topRight)),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.lg, Gap.lg, Gap.xxl),
              children: [
                Row(
                  children: [
                    const BrandMark(),
                    const Spacer(),
                    CircleChip(
                      icon: Icons.notifications_none_rounded,
                      onTap: () => showComingSoon(context, 'Notifications'),
                    ),
                  ],
                ),
                const VGap.xl(),

                // The reassurance panel.
                Container(
                  padding: const EdgeInsets.symmetric(vertical: Gap.xl, horizontal: Gap.lg),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(Radii.xl),
                    border: Border.all(color: p.accent.withValues(alpha: 0.25)),
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [p.accentSoft, p.surface],
                    ),
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 76,
                        height: 76,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: p.accent,
                          boxShadow: [
                            BoxShadow(
                              color: p.glow.withValues(alpha: p.isDark ? 0.45 : 0.32),
                              blurRadius: 34,
                            ),
                          ],
                        ),
                        child: const Icon(Icons.verified_user_rounded,
                            size: 36, color: Colors.white),
                      ),
                      const VGap.lg(),
                      Text('You’re protected, ${state.personName}',
                          style: text.headlineSmall, textAlign: TextAlign.center),
                      const VGap.xs(),
                      Text('${state.checksThisWeek} payments checked this week',
                          style: text.bodyMedium),
                      if (state.threatsStopped > 0) ...[
                        const VGap.md(),
                        StatusPill(
                          label:
                              '${state.threatsStopped} scam${state.threatsStopped == 1 ? '' : 's'} stopped',
                          severity: Severity.safe,
                        ),
                      ],
                    ],
                  ),
                ),

                if (request != null) ...[
                  const VGap.lg(),
                  SentraCard(
                    color: p.stopBg,
                    borderColor: p.stopLine,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ApprovalScreen(request: request),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.shield_rounded, color: p.stop, size: 26),
                        const SizedBox(width: Gap.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${request.forPersonName} needs you',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 16,
                                      color: p.stop)),
                              const SizedBox(height: 2),
                              Text(
                                '${formatMoney(request.amount, request.currency)} is held, waiting on you',
                                style: TextStyle(fontSize: 13.5, color: p.stop),
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_right_rounded, color: p.stop),
                      ],
                    ),
                  ),
                ],

                const VGap.xl(),
                Row(
                  children: [
                    const SectionLabel('Recent activity'),
                    const Spacer(),
                    Text('Last 7 days', style: text.bodySmall),
                  ],
                ),
                const VGap.md(),
                if (recent.isEmpty)
                  const EmptyState(
                    icon: Icons.shield_moon_outlined,
                    title: 'Nothing to report',
                    body: 'When we check or stop a payment, it will appear here.',
                  )
                else
                  SentraCard(
                    padding: const EdgeInsets.symmetric(horizontal: Gap.lg),
                    child: Column(
                      children: [
                        for (var i = 0; i < recent.length; i++) ...[
                          if (i > 0) Divider(color: p.line, height: 1),
                          ActivityRow(entry: recent[i]),
                        ],
                      ],
                    ),
                  ),

                const VGap.xl(),
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
                            Text('See a scam being stopped',
                                style: text.titleMedium),
                            const SizedBox(height: 2),
                            Text('Walk through what happens at the moment it matters',
                                style: text.bodySmall),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, color: p.faint),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
