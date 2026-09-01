import 'package:flutter/material.dart';

import '../../app.dart';
import '../../services/auth_service.dart';
import '../../services/bank_link.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// The person's own settings: who they are, what's connected, and how the app looks.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final theme = SentraApp.themeOf(context);

    final bank = BankRegistry.banks
        .where((b) => b.id == state.bankId)
        .firstOrNull;

    return Scaffold(
      appBar: AppBar(title: const Text('You')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.sm, Gap.lg, Gap.xxl),
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: p.accentSoft,
                child: Text(
                  state.personName.characters.first.toUpperCase(),
                  style: TextStyle(
                      color: p.accentInk, fontWeight: FontWeight.w800, fontSize: 24),
                ),
              ),
              const SizedBox(width: Gap.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(state.personName, style: text.headlineSmall),
                    if (state.email.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(state.email, style: text.bodySmall),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const VGap.xl(),

          const SectionLabel('Protection'),
          const VGap.md(),
          SentraCard(
            padding: const EdgeInsets.symmetric(horizontal: Gap.lg),
            child: Column(
              children: [
                _Row(
                  icon: Icons.account_balance_rounded,
                  severity: Severity.safe,
                  title: bank == null ? 'Bank connected' : bank.name,
                  subtitle: 'We can check your payments as you make them',
                  trailing: Icon(Icons.check_circle_rounded, color: p.safe),
                ),
                Divider(color: p.line, height: 1),
                _Row(
                  icon: Icons.notifications_active_rounded,
                  severity: Severity.neutral,
                  title: 'Alerts',
                  subtitle: 'Get told the moment a payment is held',
                  trailing: Icon(Icons.chevron_right_rounded, color: p.faint),
                  onTap: () => showComingSoon(context, 'Alert settings'),
                ),
              ],
            ),
          ),

          const VGap.xl(),
          const SectionLabel('Appearance'),
          const VGap.md(),
          ValueListenableBuilder<ThemeMode>(
            valueListenable: theme,
            builder: (context, mode, _) => SentraCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Theme', style: text.titleMedium),
                  const VGap.md(),
                  SegmentedButton<ThemeMode>(
                    segments: const [
                      ButtonSegment(
                          value: ThemeMode.light,
                          icon: Icon(Icons.light_mode_rounded),
                          label: Text('Light')),
                      ButtonSegment(
                          value: ThemeMode.system,
                          icon: Icon(Icons.brightness_auto_rounded),
                          label: Text('Auto')),
                      ButtonSegment(
                          value: ThemeMode.dark,
                          icon: Icon(Icons.dark_mode_rounded),
                          label: Text('Dark')),
                    ],
                    selected: {mode},
                    onSelectionChanged: (s) => theme.set(s.first),
                    style: SegmentedButton.styleFrom(
                      selectedBackgroundColor: p.accentSoft,
                      selectedForegroundColor: p.accentInk,
                      side: BorderSide(color: p.line),
                    ),
                  ),
                ],
              ),
            ),
          ),

          const VGap.xl(),
          const SectionLabel('Privacy'),
          const VGap.md(),
          const Notice(
            severity: Severity.neutral,
            title: 'What Sentra can see',
            child: Text(
              'The shape of a payment — the amount, whether the payee is new, and signals like a '
              'call happening at the same time. Never your account number, your balance, or your '
              'password. Your bank always makes the final decision.',
            ),
          ),

          const VGap.xl(),
          OutlinedButton.icon(
            onPressed: () => _confirmSignOut(context, state),
            style: OutlinedButton.styleFrom(
              foregroundColor: p.stop,
              side: BorderSide(color: p.stopLine, width: 1.5),
            ),
            icon: const Icon(Icons.logout_rounded, size: 19),
            label: const Text('Sign out'),
          ),
          const VGap.lg(),
          Center(
            child: Text(
              AuthService.instance.isConfigured
                  ? 'Sentra · connected'
                  : 'Sentra · demo build',
              style: text.bodySmall?.copyWith(color: p.faint),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmSignOut(BuildContext context, dynamic state) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'You’ll stop getting alerts about held payments until you sign back in.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Stay'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              state.signOut();
            },
            child: Text('Sign out',
                style: TextStyle(color: SentraPalette.of(dialogContext).stop)),
          ),
        ],
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
    this.onTap,
  });

  final IconData icon;
  final Severity severity;
  final String title;
  final String subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Gap.md),
        child: Row(
          children: [
            IconTile(icon: icon, severity: severity, size: 40),
            const SizedBox(width: Gap.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: text.titleMedium?.copyWith(fontSize: 15.5)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: text.bodySmall),
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}
