import 'dart:async';

import 'package:flutter/material.dart';

import '../../app.dart';
import '../../models/models.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// The guardian's decision.
///
/// A guardian approving a payment is telling the bank it is safe to send, so the screen makes the
/// weight of that explicit: they must confirm they have actually spoken to the person, and they
/// are told plainly that an approved payment which turns out to be a scam can be investigated.
/// That is not there to frighten anyone — it is there because a guardian can be socially
/// engineered too, and naming the consequence is what makes the moment feel real.
///
/// Refusing is the low-friction path; approving is the one that requires a deliberate step.
class ApprovalScreen extends StatefulWidget {
  const ApprovalScreen({super.key, required this.request});
  final GuardianRequest request;

  @override
  State<ApprovalScreen> createState() => _ApprovalScreenState();
}

class _ApprovalScreenState extends State<ApprovalScreen> {
  Timer? _ticker;
  bool _confirmedSpoke = false;

  @override
  void initState() {
    super.initState();
    // The countdown is the point: a guardian who cannot answer in time must not become the
    // reason a payment is stuck, so the hold escalates to the bank on its own.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String get _timeLeft {
    final left = widget.request.timeLeft;
    final minutes = left.inMinutes.toString().padLeft(2, '0');
    final seconds = (left.inSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  void _decide({required bool approved}) {
    AppScope.of(context).resolveRequest(approved: approved);
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          approved
              ? 'Approved. ${widget.request.forPersonName}’s bank has been told.'
              : 'Kept on hold. Their bank will review it.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final request = widget.request;
    final text = Theme.of(context).textTheme;
    final expired = request.timeLeft == Duration.zero;

    return Scaffold(
      appBar: AppBar(title: Text('${request.forPersonName} needs you')),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.lg),
                children: [
                  Text(
                    'A payment was held because it looked like a scam. Only approve it if you have '
                    'spoken to ${request.forPersonName} and you are sure.',
                    style: text.bodyLarge,
                  ),
                  const VGap.lg(),

                  // The payment itself.
                  SentraCard(
                    color: SentraColors.stopBg,
                    borderColor: SentraColors.stopLine,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SectionLabel('Held payment'),
                        const SizedBox(height: 6),
                        Text(
                          formatMoney(request.amount, request.currency),
                          style: text.displaySmall?.copyWith(fontSize: 34),
                        ),
                        const SizedBox(height: 2),
                        Text('to ${request.payeeLabel}',
                            style: text.bodyLarge?.copyWith(color: const Color(0xFF8A4A44))),
                        const VGap.md(),
                        Text('Ref ${request.caseReference}',
                            style: text.bodySmall?.copyWith(fontSize: 12.5)),
                      ],
                    ),
                  ),
                  const VGap.lg(),

                  const SectionLabel('Why it was held'),
                  const VGap.md(),
                  SentraCard(
                    padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.xs),
                    child: Column(
                      children: [
                        for (var i = 0; i < request.reasons.length; i++)
                          Column(
                            children: [
                              if (i > 0) const Divider(height: 1),
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: Gap.md),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Padding(
                                      padding: EdgeInsets.only(top: 4),
                                      child: Icon(Icons.circle,
                                          size: 8, color: SentraColors.stop),
                                    ),
                                    const SizedBox(width: Gap.md),
                                    Expanded(
                                      child: Text(request.reasons[i], style: text.bodyLarge),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                  const VGap.lg(),

                  // The responsibility. Stated plainly, before the approve control is usable.
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
                    onTap: expired
                        ? null
                        : () => setState(() => _confirmedSpoke = !_confirmedSpoke),
                    borderColor: _confirmedSpoke ? SentraColors.accent : null,
                    color: _confirmedSpoke ? SentraColors.accentSoft : null,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          _confirmedSpoke
                              ? Icons.check_box_rounded
                              : Icons.check_box_outline_blank_rounded,
                          color: _confirmedSpoke
                              ? SentraColors.accent
                              : SentraColors.lineStrong,
                          size: 26,
                        ),
                        const SizedBox(width: Gap.md),
                        Expanded(
                          child: Text(
                            'I have spoken to ${request.forPersonName} and I am sure this payment '
                            'is genuine.',
                            style: text.bodyLarge?.copyWith(
                              color: SentraColors.ink,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Footer: the countdown and the two decisions.
            Container(
              padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.lg, Gap.lg),
              decoration: const BoxDecoration(
                color: SentraColors.card,
                border: Border(top: BorderSide(color: SentraColors.line)),
              ),
              child: Column(
                children: [
                  if (expired)
                    const Notice(
                      severity: Severity.neutral,
                      child: Text(
                        'Time is up — this has gone to the bank to review. Nothing has been sent.',
                      ),
                    )
                  else
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.timer_outlined,
                            size: 17, color: SentraColors.muted),
                        const SizedBox(width: 6),
                        Text('Time to decide  ', style: text.bodySmall),
                        Text(
                          _timeLeft,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                            color: SentraColors.stop,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  const VGap.md(),
                  OutlinedButton(
                    onPressed: expired ? null : () => _decide(approved: false),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: SentraColors.stop,
                      side: const BorderSide(color: SentraColors.stopLine, width: 1.5),
                    ),
                    child: const Text('This looks wrong — keep it held'),
                  ),
                  const VGap.md(),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: SentraColors.safe),
                    onPressed:
                        _confirmedSpoke && !expired ? () => _decide(approved: true) : null,
                    child: const Text('Approve this payment'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
