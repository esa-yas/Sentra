import 'package:flutter/material.dart';

import '../../app.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('You')),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.xxl),
          children: [
            SentraCard(
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: const BoxDecoration(
                      color: SentraColors.accentSoft,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      initialOf(state.personName),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: SentraColors.accentInk,
                      ),
                    ),
                  ),
                  const SizedBox(width: Gap.lg),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(state.personName, style: text.titleLarge),
                        Text(
                          state.email.isEmpty ? 'Signed in' : state.email,
                          style: text.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const VGap.lg(),
            const SectionLabel('Your protection'),
            const VGap.md(),
            SentraCard(
              padding: const EdgeInsets.symmetric(horizontal: Gap.lg),
              child: Column(
                children: [
                  const _Row(
                    icon: Icons.account_balance_rounded,
                    severity: Severity.safe,
                    title: 'Bank connected',
                    subtitle: 'We can check your payments as you make them',
                    trailing: Icon(Icons.check_circle_rounded, color: SentraColors.safe),
                  ),
                  const Divider(height: 1),
                  _Row(
                    icon: Icons.people_rounded,
                    severity: Severity.neutral,
                    title: 'Guardians',
                    subtitle: state.guardians.where((g) => g.isLive).isEmpty
                        ? 'Nobody can help clear a held payment yet'
                        : '${state.guardians.where((g) => g.isLive).length} active',
                  ),
                  const Divider(height: 1),
                  const _Row(
                    icon: Icons.notifications_active_rounded,
                    severity: Severity.neutral,
                    title: 'Alerts',
                    subtitle: 'Get told the moment a payment is held',
                  ),
                ],
              ),
            ),
            const VGap.lg(),
            const SectionLabel('Privacy'),
            const VGap.md(),
            const Notice(
              severity: Severity.neutral,
              title: 'What Sentra can see',
              child: Text(
                'The shape of a payment — the amount, whether the payee is new, whether a call is '
                'happening. Never your balance, your card number, or your login. We keep as little '
                'as possible, for as short a time as possible.',
              ),
            ),
            const VGap(Gap.xl),
            OutlinedButton.icon(
              onPressed: () => state.signOut(),
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.severity,
    required this.title,
    required this.subtitle,
    this.trailing,
  });

  final IconData icon;
  final Severity severity;
  final String title;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Gap.md),
      child: Row(
        children: [
          IconTile(icon: icon, severity: severity, size: 38),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: text.titleMedium?.copyWith(fontSize: 15)),
                const SizedBox(height: 2),
                Text(subtitle, style: text.bodySmall),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
