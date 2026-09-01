import 'package:flutter/material.dart';

import '../../services/bank_link.dart';
import '../../theme/tokens.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';

/// Connect a bank.
///
/// The customer taps their bank and is sent to the bank's own site to approve. Sentra never sees
/// a banking password, and the screen says so plainly — because an app asking to watch your
/// payments has to answer "what can you actually see?" before it asks for anything.
class ConnectBankScreen extends StatefulWidget {
  const ConnectBankScreen({super.key, required this.onConnected});

  final void Function(BankLinkResult result) onConnected;

  @override
  State<ConnectBankScreen> createState() => _ConnectBankScreenState();
}

class _ConnectBankScreenState extends State<ConnectBankScreen> {
  String? _connectingId;
  String? _error;

  Future<void> _connect(Bank bank) async {
    setState(() {
      _connectingId = bank.id;
      _error = null;
    });
    try {
      final result = await BankLink.instance.connect(bank);
      if (mounted) widget.onConnected(result);
    } on BankLinkFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _connectingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: Stack(
        children: [
          const Positioned(top: 0, left: 0, child: DotGrid()),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.xl, Gap.xl, Gap.xxl),
              children: [
                const BrandMark(),
                const VGap.xxl(),
                Text('Connect your bank', style: text.displaySmall),
                const VGap.md(),
                Text(
                  'You’ll approve this on your bank’s own site. Sentra never asks for your '
                  'banking password and never sees your balance.',
                  style: text.bodyLarge?.copyWith(color: p.muted),
                ),
                const VGap.xl(),
                if (_error != null) ...[
                  Notice(severity: Severity.stop, child: Text(_error!)),
                  const VGap.lg(),
                ],
                const SectionLabel('Choose your bank'),
                const VGap.md(),
                ...BankRegistry.banks.map(
                  (bank) => Padding(
                    padding: const EdgeInsets.only(bottom: Gap.md),
                    child: _BankRow(
                      bank: bank,
                      busy: _connectingId == bank.id,
                      onTap: bank.isAvailable && _connectingId == null
                          ? () => _connect(bank)
                          : null,
                    ),
                  ),
                ),
                const VGap.lg(),
                const Notice(
                  severity: Severity.neutral,
                  title: 'What Sentra can see',
                  child: Text(
                    'When a payment is being made: the amount, whether the payee is new, and '
                    'signals like a call happening at the same time. Never your account number, '
                    'your balance, or your password.',
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

class _BankRow extends StatelessWidget {
  const _BankRow({required this.bank, required this.busy, this.onTap});

  final Bank bank;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final available = bank.isAvailable;

    return SentraCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.md + 2),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: available ? p.accentSoft : p.line,
              borderRadius: BorderRadius.circular(Radii.md),
            ),
            alignment: Alignment.center,
            child: Text(
              bank.name.characters.first,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 19,
                color: available ? p.accentInk : p.faint,
              ),
            ),
          ),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(bank.name,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      color: available ? p.ink : p.muted,
                    )),
                const SizedBox(height: 2),
                Text(bank.tagline, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          if (busy)
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2.2, color: p.accent),
            )
          else if (available)
            Icon(Icons.arrow_outward_rounded, size: 20, color: p.accent)
          else
            Text('Soon', style: Theme.of(context).textTheme.labelSmall),
        ],
      ),
    );
  }
}
