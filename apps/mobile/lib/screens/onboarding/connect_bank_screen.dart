import 'package:flutter/material.dart';

import '../../app.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// Connecting a bank.
///
/// This is the step that makes everything else possible: without it Sentra has no payments to
/// check and no way to know the person is a real bank customer — which is also what makes the
/// guardian rule meaningful, since both people must be connected before they can protect each
/// other.
///
/// The real version is a bank OAuth handoff. This build simulates it so the whole app can be
/// used end to end without a bank partner.
class ConnectBankScreen extends StatefulWidget {
  const ConnectBankScreen({super.key});

  @override
  State<ConnectBankScreen> createState() => _ConnectBankScreenState();
}

class _ConnectBankScreenState extends State<ConnectBankScreen> {
  String? _selected;
  bool _connecting = false;

  static const _banks = [
    ('Northwind Bank', Icons.account_balance_rounded),
    ('Meridian', Icons.savings_rounded),
    ('Kestrel Bank', Icons.account_balance_wallet_rounded),
  ];

  Future<void> _connect() async {
    setState(() => _connecting = true);
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    AppScope.of(context).connectBank();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.xl, Gap.xl, Gap.xxl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const BrandMark(size: 30),
              const VGap(Gap.xxl),
              Text('Connect your bank', style: text.headlineMedium),
              const VGap.sm(),
              Text(
                'So we can check your payments as you make them, and confirm you’re a real '
                'customer before anyone can be your guardian.',
                style: text.bodyLarge,
              ),
              const VGap(Gap.xl),
              const SectionLabel('Choose your bank'),
              const VGap.md(),
              ..._banks.map((bank) {
                final selected = _selected == bank.$1;
                return Padding(
                  padding: const EdgeInsets.only(bottom: Gap.md),
                  child: SentraCard(
                    onTap: _connecting ? null : () => setState(() => _selected = bank.$1),
                    color: selected ? SentraColors.accentSoft : null,
                    borderColor: selected ? SentraColors.accent : null,
                    padding: const EdgeInsets.all(Gap.lg),
                    child: Row(
                      children: [
                        IconTile(icon: bank.$2, severity: Severity.neutral),
                        const SizedBox(width: Gap.md),
                        Expanded(
                          child: Text(bank.$1, style: text.titleMedium),
                        ),
                        Icon(
                          selected
                              ? Icons.check_circle_rounded
                              : Icons.radio_button_unchecked_rounded,
                          color: selected ? SentraColors.accent : SentraColors.lineStrong,
                        ),
                      ],
                    ),
                  ),
                );
              }),
              const VGap.md(),
              const Notice(
                severity: Severity.neutral,
                title: 'What we can and can’t see',
                child: Text(
                  'We see the shape of a payment — the amount, whether the payee is new. We never '
                  'see your balance, your card number, or your login.',
                ),
              ),
              const VGap(Gap.xl),
              FilledButton(
                onPressed: _selected == null || _connecting ? null : _connect,
                child: _connecting
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                      )
                    : const Text('Connect securely'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
