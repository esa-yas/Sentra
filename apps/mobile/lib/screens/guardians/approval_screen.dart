import 'dart:async';

import 'package:flutter/material.dart';

import '../../app.dart';
import '../../models/models.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// A guardian deciding on a held payment.
///
/// The weight of the decision is stated plainly rather than buried: approving tells the bank it
/// is safe to send. So "approve" stays disabled until they confirm they actually spoke to the
/// person, while refusing is always one tap — the safe action must never be the harder one.
class ApprovalScreen extends StatefulWidget {
  const ApprovalScreen({super.key, required this.request});

  final GuardianRequest request;

  @override
  State<ApprovalScreen> createState() => _ApprovalScreenState();
}

class _ApprovalScreenState extends State<ApprovalScreen> {
  bool _spoke = false;
  Timer? _ticker;
  late Duration _left = widget.request.timeLeft;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _left = widget.request.timeLeft);
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _resolve({required bool approved}) {
    AppScope.of(context).resolveRequest(approved: approved);
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(approved
            ? 'Approved. Your bank has been told it can send.'
            : 'Kept held. Your bank will look at it.'),
      ),
    );
  }

  String get _countdown {
    final m = _left.inMinutes.toString().padLeft(2, '0');
    final s = (_left.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;
    final r = widget.request;
    final expired = _left == Duration.zero;

    return Scaffold(
      appBar: AppBar(title: Text('${r.forPersonName} needs you')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.sm, Gap.lg, Gap.lg),
              children: [
                Text(
                  'A payment was held because it looks like a scam. Only approve it if you have '
                  'spoken to ${r.forPersonName} and you are sure.',
                  style: text.bodyLarge,
                ),
                const VGap.xl(),
                SentraCard(
                  color: p.stopBg,
                  borderColor: p.stopLine,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('HELD PAYMENT',
                          style: text.labelSmall?.copyWith(color: p.stop)),
                      const VGap.sm(),
                      Text(formatMoney(r.amount, r.currency),
                          style: text.displaySmall?.copyWith(fontSize: 34, color: p.stop)),
                      const SizedBox(height: 2),
                      Text('to ${r.payeeLabel}',
                          style: text.bodyMedium?.copyWith(color: p.stop)),
                      const VGap.md(),
                      Text('Ref ${r.caseReference}',
                          style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: p.stop.withValues(alpha: 0.8))),
                    ],
                  ),
                ),
                const VGap.xl(),
                const SectionLabel('Why it was held'),
                const VGap.md(),
                SentraCard(
                  padding: const EdgeInsets.symmetric(horizontal: Gap.lg),
                  child: Column(
                    children: [
                      for (var i = 0; i < r.reasons.length; i++) ...[
                        if (i > 0) Divider(color: p.line, height: 1),
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: Gap.md),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 7,
                                height: 7,
                                margin: const EdgeInsets.only(top: 7, right: Gap.md),
                                decoration:
                                    BoxDecoration(color: p.stop, shape: BoxShape.circle),
                              ),
                              Expanded(
                                  child: Text(r.reasons[i], style: text.bodyLarge)),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const VGap.lg(),
                const Notice(
                  severity: Severity.caution,
                  title: 'This is a real responsibility',
                  child: Text(
                    'Approving tells the bank it is safe to send. If a payment you approve turns '
                    'out to be a scam, the case can be investigated by the bank, by Sentra, or by '
                    'the authorities.',
                  ),
                ),
                const VGap.lg(),
                SentraCard(
                  onTap: expired ? null : () => setState(() => _spoke = !_spoke),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 26,
                        height: 26,
                        child: Checkbox(
                          value: _spoke,
                          onChanged:
                              expired ? null : (v) => setState(() => _spoke = v ?? false),
                        ),
                      ),
                      const SizedBox(width: Gap.md),
                      Expanded(
                        child: Text(
                          'I have spoken to ${r.forPersonName} and I am sure this is genuine.',
                          style: text.bodyLarge,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.lg, Gap.md),
            decoration: BoxDecoration(
              color: p.surface,
              border: Border(top: BorderSide(color: p.line)),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.timer_outlined, size: 16, color: p.muted),
                      const SizedBox(width: 6),
                      Text('Time to decide  ', style: text.bodySmall),
                      Text(expired ? 'expired' : _countdown,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                            color: expired ? p.muted : p.stop,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          )),
                    ],
                  ),
                  const VGap.md(),
                  OutlinedButton.icon(
                    onPressed: () => _resolve(approved: false),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: p.stop,
                      side: BorderSide(color: p.stopLine, width: 1.6),
                    ),
                    icon: const Icon(Icons.pan_tool_rounded, size: 18),
                    label: const Text('This looks wrong — keep it held'),
                  ),
                  const VGap.sm(),
                  FilledButton.icon(
                    onPressed: (_spoke && !expired) ? () => _resolve(approved: true) : null,
                    style: FilledButton.styleFrom(
                        backgroundColor: p.safe, foregroundColor: Colors.white),
                    icon: const Icon(Icons.check_rounded, size: 19),
                    label: const Text('Approve this payment'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
