import 'package:flutter/material.dart';

import '../../app.dart';
import '../../models/models.dart';
import '../../services/demo_data.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// The screen that saves the money.
///
/// It names the specific thing happening right now, asks a question or two — a scammer's script
/// breaks the moment the victim has to answer for themselves — and on a hold offers no way to
/// send anyway. The safer choice is always one tap, and the copy never shames anyone: people
/// abandon a scam far more readily when stopping feels sensible rather than like an admission.
class InterventionScreen extends StatefulWidget {
  const InterventionScreen({super.key, required this.session});

  final ProtectionSession session;

  @override
  State<InterventionScreen> createState() => _InterventionScreenState();
}

class _InterventionScreenState extends State<InterventionScreen> {
  late ProtectionSession _session = widget.session;
  final Map<String, String> _answers = {};
  bool _answered = false;

  bool get _allAnswered =>
      _session.questions.every((q) => _answers.containsKey(q.id));

  Severity get _severity => switch (_session.display.tone) {
        DisplayTone.stop => Severity.stop,
        DisplayTone.caution => Severity.caution,
        DisplayTone.info => Severity.safe,
      };

  void _continue() {
    // In a wired build the answers go to the engine, which returns revised copy. Demo mode shows
    // the same shape of response so the flow reads identically.
    setState(() {
      _answered = true;
      _session = _session.copyWith(display: DemoData.afterAnswers(), questions: const []);
    });
  }

  void _finish({required bool cancelled}) {
    AppScope.of(context).recordOutcome(_session, cancelled: cancelled);
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(cancelled
            ? 'Payment cancelled. Your money stayed in your account.'
            : 'Sent. We’ve logged that you were warned.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;
    final display = _session.display;
    final s = SeverityStyle.of(context, _severity);

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [s.bg, p.ground],
            stops: const [0, 0.42],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // No back arrow on purpose: leaving is a decision, made with the buttons below.
              Padding(
                padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.sm, Gap.lg, 0),
                child: Row(
                  children: [
                    Flexible(
                      child: StatusPill(
                        label: switch (display.tone) {
                          DisplayTone.stop => 'Stop before you send',
                          DisplayTone.caution => 'Please check',
                          DisplayTone.info => 'Checked',
                        },
                        severity: _severity,
                      ),
                    ),
                    const SizedBox(width: Gap.sm),
                    Text('Ref ${_session.caseReference}',
                        style: text.bodySmall?.copyWith(fontSize: 12)),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.lg, Gap.lg, Gap.lg),
                  children: [
                    Text('You’re about to send', style: text.labelSmall),
                    const VGap.xs(),
                    Text(formatMoney(_session.amount, _session.currency),
                        style: text.displaySmall?.copyWith(fontSize: 40)),
                    if (_session.payeeLabel != null) ...[
                      const SizedBox(height: 2),
                      Text('to ${_session.payeeLabel}', style: text.bodyMedium),
                    ],
                    const VGap.xl(),
                    Text(display.headline,
                        style: text.headlineSmall?.copyWith(color: s.fg)),
                    const VGap.md(),
                    Text(display.body, style: text.bodyLarge),

                    if (display.reasons.isNotEmpty) ...[
                      const VGap.xl(),
                      SentraCard(
                        padding: const EdgeInsets.symmetric(horizontal: Gap.lg),
                        child: Column(
                          children: [
                            for (var i = 0; i < display.reasons.length; i++) ...[
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
                                          BoxDecoration(color: s.fg, shape: BoxShape.circle),
                                    ),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(display.reasons[i].title,
                                              style: text.titleMedium
                                                  ?.copyWith(fontSize: 15.5)),
                                          const SizedBox(height: 3),
                                          Text(display.reasons[i].detail,
                                              style: text.bodySmall),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],

                    if (_session.questions.isNotEmpty) ...[
                      const VGap.xl(),
                      const SectionLabel('A couple of quick questions'),
                      const VGap.md(),
                      for (final q in _session.questions) ...[
                        SentraCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(q.prompt, style: text.titleMedium),
                              if (q.helper != null) ...[
                                const SizedBox(height: 4),
                                Text(q.helper!, style: text.bodySmall),
                              ],
                              const VGap.md(),
                              Wrap(
                                spacing: Gap.sm,
                                runSpacing: Gap.sm,
                                children: q.options.map((o) {
                                  final selected = _answers[q.id] == o.id;
                                  return ChoiceChip(
                                    label: Text(o.label),
                                    selected: selected,
                                    onSelected: (_) =>
                                        setState(() => _answers[q.id] = o.id),
                                    showCheckmark: false,
                                    labelStyle: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14.5,
                                      color: selected ? p.accentInk : p.inkSoft,
                                    ),
                                    backgroundColor: p.surface,
                                    selectedColor: p.accentSoft,
                                    side: BorderSide(
                                        color: selected ? p.accent : p.lineStrong,
                                        width: selected ? 1.6 : 1.2),
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: Gap.md, vertical: Gap.md),
                                  );
                                }).toList(),
                              ),
                            ],
                          ),
                        ),
                        const VGap.md(),
                      ],
                    ],

                    if (_answered) ...[
                      const VGap.md(),
                      Notice(
                        severity: Severity.neutral,
                        child: Text(display.footnote),
                      ),
                    ],
                  ],
                ),
              ),

              // The actions sit below the fold's edge, always reachable.
              Container(
                padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.lg, Gap.md),
                decoration: BoxDecoration(
                  color: p.surface,
                  border: Border(top: BorderSide(color: p.line)),
                ),
                child: SafeArea(
                  top: false,
                  child: _session.questions.isNotEmpty
                      ? FilledButton(
                          onPressed: _allAnswered ? _continue : null,
                          child: const Text('Continue'),
                        )
                      : Column(
                          children: [
                            FilledButton.icon(
                              onPressed: () => _finish(cancelled: true),
                              style: FilledButton.styleFrom(
                                  backgroundColor: s.fg, foregroundColor: Colors.white),
                              icon: const Icon(Icons.block_rounded, size: 19),
                              label: Text(display.cancelLabel),
                            ),
                            if (display.continueLabel != null) ...[
                              const VGap.sm(),
                              OutlinedButton(
                                onPressed: () => _finish(cancelled: false),
                                child: Text(display.continueLabel!),
                              ),
                            ],
                            const VGap.sm(),
                            Text(display.footnote,
                                textAlign: TextAlign.center,
                                style: text.bodySmall?.copyWith(fontSize: 12.5)),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
