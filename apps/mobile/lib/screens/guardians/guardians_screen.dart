import 'package:flutter/material.dart';

import '../../app.dart';
import '../../models/models.dart';
import '../../services/app_state.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import 'add_guardian_screen.dart';
import 'approval_screen.dart';

/// Guardians, from both sides.
///
/// The same app serves the person being protected and the person protecting them, so this screen
/// shows both lists: who can help you, and who you help. A guardian is not a different build —
/// just a Sentra user with a decision waiting.
class GuardiansScreen extends StatelessWidget {
  const GuardiansScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final text = Theme.of(context).textTheme;
    final request = state.pendingRequest;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Guardians'),
        actions: [
          IconButton(
            tooltip: 'Add a guardian',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const AddGuardianScreen()),
            ),
            icon: const Icon(Icons.person_add_alt_rounded),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.xxl),
          children: [
            if (request != null) ...[
              SentraCard(
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
                          Text('Waiting on you',
                              style: text.titleMedium?.copyWith(color: SentraColors.stop)),
                          const SizedBox(height: 2),
                          Text(
                            '${request.forPersonName} — ${formatMoney(request.amount, request.currency)} held',
                            style: text.bodySmall?.copyWith(color: const Color(0xFF8A4A44)),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: SentraColors.stop),
                  ],
                ),
              ),
              const VGap.lg(),
            ],

            const SectionLabel('People who can help you'),
            const VGap.sm(),
            Text(
              'They can clear a held payment after speaking with you.',
              style: text.bodySmall,
            ),
            const VGap.md(),
            if (state.guardians.isEmpty)
              SentraCard(
                child: Column(
                  children: [
                    const EmptyState(
                      icon: Icons.person_add_alt_rounded,
                      title: 'No guardians yet',
                      body: 'Add someone you trust — a family member who can confirm a payment '
                          'is really you.',
                    ),
                    FilledButton(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(builder: (_) => const AddGuardianScreen()),
                      ),
                      child: const Text('Add a guardian'),
                    ),
                  ],
                ),
              )
            else
              ...state.guardians.map((g) => Padding(
                    padding: const EdgeInsets.only(bottom: Gap.md),
                    child: _GuardianCard(guardian: g),
                  )),

            if (state.protecting.isNotEmpty) ...[
              const VGap.lg(),
              const SectionLabel('People you help'),
              const VGap.sm(),
              Text(
                'You may be asked to confirm a payment for them.',
                style: text.bodySmall,
              ),
              const VGap.md(),
              ...state.protecting.map((g) => Padding(
                    padding: const EdgeInsets.only(bottom: Gap.md),
                    child: _GuardianCard(guardian: g),
                  )),
            ],
          ],
        ),
      ),
    );
  }
}

class _GuardianCard extends StatelessWidget {
  const _GuardianCard({required this.guardian});
  final Guardian guardian;

  (String, Severity) get _status {
    if (guardian.status == GuardianStatus.active) return ('Active', Severity.safe);
    if (guardian.status == GuardianStatus.cooling) {
      final days = guardian.coolingDaysLeft ?? 0;
      return ('Starts in $days day${days == 1 ? '' : 's'}', Severity.caution);
    }
    if (guardian.status == GuardianStatus.pending) return ('Waiting for them', Severity.caution);
    return ('Disconnected', Severity.neutral);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final (label, severity) = _status;

    return SentraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  color: SentraColors.accentSoft,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  initialOf(guardian.name),
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    color: SentraColors.accentInk,
                  ),
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
              if (guardian.direction == GuardianDirection.protecting)
                IconButton(
                  tooltip: 'Disconnect',
                  onPressed: () => _confirmRemove(context, state),
                  icon: const Icon(Icons.link_off_rounded, color: SentraColors.faint),
                ),
            ],
          ),
          if (guardian.status == GuardianStatus.cooling) ...[
            const VGap.md(),
            const Notice(
              severity: Severity.caution,
              child: Text(
                'There’s a short waiting period before a new guardian can approve anything. '
                'If you didn’t expect this, disconnect them now.',
              ),
            ),
          ],
          if (guardian.status == GuardianStatus.pending) ...[
            const VGap.md(),
            const Notice(
              severity: Severity.caution,
              child: Text('They need to accept on their own phone, and have a bank connected.'),
            ),
          ],
        ],
      ),
    );
  }

  void _confirmRemove(BuildContext context, AppState state) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Disconnect this guardian?'),
        content: Text(
          '${guardian.name} will no longer be able to help clear a held payment. '
          'Held payments will go to your bank instead. You can do this at any time.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Keep them'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: SentraColors.stop,
              minimumSize: const Size(100, 44),
            ),
            onPressed: () {
              state.removeGuardian(guardian.id);
              Navigator.of(dialogContext).pop();
            },
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );
  }
}
