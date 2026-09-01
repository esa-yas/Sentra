import 'package:flutter/material.dart';

import '../../app.dart';
import '../../models/models.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import 'add_guardian_screen.dart';
import 'approval_screen.dart';

/// Guardians, in both directions: people who protect you, and people you protect.
class GuardiansScreen extends StatelessWidget {
  const GuardiansScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final request = state.pendingRequest;

    return Scaffold(
      appBar: AppBar(title: const Text('Guardians')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.sm, Gap.lg, Gap.xxl),
        children: [
          if (request != null) ...[
            SentraCard(
              color: SentraPalette.of(context).stopBg,
              borderColor: SentraPalette.of(context).stopLine,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => ApprovalScreen(request: request)),
              ),
              child: Row(
                children: [
                  const IconTile(icon: Icons.gpp_maybe_rounded, severity: Severity.stop),
                  const SizedBox(width: Gap.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${request.forPersonName} needs you',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 2),
                        Text(
                          '${formatMoney(request.amount, request.currency)} held — waiting on your check',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded),
                ],
              ),
            ),
            const VGap.xl(),
          ],

          const SectionLabel('Protecting you'),
          const VGap.md(),
          if (state.guardians.isEmpty)
            const EmptyState(
              icon: Icons.person_add_alt_1_rounded,
              title: 'No guardians yet',
              body: 'Name someone you trust. If a payment is ever held, they can check with you '
                  'and clear it in seconds.',
            )
          else
            ...state.guardians.map(
              (g) => Padding(
                padding: const EdgeInsets.only(bottom: Gap.md),
                child: _GuardianCard(guardian: g, onRemove: () => state.removeGuardian(g.id)),
              ),
            ),

          const VGap.md(),
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const AddGuardianScreen()),
            ),
            icon: const Icon(Icons.person_add_alt_1_rounded, size: 20),
            label: const Text('Add a guardian'),
          ),

          if (state.protecting.isNotEmpty) ...[
            const VGap.xl(),
            const SectionLabel('You’re protecting'),
            const VGap.md(),
            ...state.protecting.map(
              (g) => Padding(
                padding: const EdgeInsets.only(bottom: Gap.md),
                child: _GuardianCard(guardian: g),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _GuardianCard extends StatelessWidget {
  const _GuardianCard({required this.guardian, this.onRemove});

  final Guardian guardian;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;
    final cooling = guardian.coolingDaysLeft;

    final (label, severity) = switch (guardian.status) {
      GuardianStatus.active => ('Active', Severity.safe),
      GuardianStatus.cooling => ('Starts in ${cooling ?? 0}d', Severity.caution),
      GuardianStatus.pending => ('Waiting for them', Severity.caution),
      GuardianStatus.revoked => ('Disconnected', Severity.neutral),
    };

    return SentraCard(
      child: Column(
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: p.accentSoft,
                child: Text(
                  guardian.name.characters.first.toUpperCase(),
                  style: TextStyle(
                      color: p.accentInk, fontWeight: FontWeight.w800, fontSize: 17),
                ),
              ),
              const SizedBox(width: Gap.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(guardian.name, style: text.titleMedium),
                    const SizedBox(height: 4),
                    StatusPill(label: label, severity: severity),
                  ],
                ),
              ),
              if (onRemove != null)
                IconButton(
                  onPressed: () => _confirmRemove(context),
                  icon: Icon(Icons.close_rounded, color: p.faint),
                  tooltip: 'Disconnect',
                ),
            ],
          ),
          if (guardian.status == GuardianStatus.cooling) ...[
            const VGap.md(),
            Notice(
              severity: Severity.caution,
              child: Text(
                'There’s a short wait before a new guardian can approve anything. Either of you '
                'can stop it before then.',
                style: text.bodySmall?.copyWith(color: p.warn),
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _confirmRemove(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Disconnect ${guardian.name}?'),
        content: const Text(
          'They will no longer be asked to check held payments. You can add them again later.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Keep'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              onRemove?.call();
            },
            child: Text('Disconnect',
                style: TextStyle(color: SentraPalette.of(dialogContext).stop)),
          ),
        ],
      ),
    );
  }
}
