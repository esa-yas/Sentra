import 'package:flutter/material.dart';

import '../../app.dart';
import '../../models/models.dart';
import '../../services/demo_data.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// The screen that saves the money.
///
/// Three things make it work, and all three are deliberate:
///   * it names the specific thing happening now ("a suspicious call is happening right now"),
///     because generic warnings get dismissed;
///   * it asks a question, because scammers coach victims with a script and answering for
///     yourself breaks it;
///   * on a hold it offers no "send anyway" — only the safer choice — while never shaming the
///     person, because people abandon a scam far more readily when stopping feels sensible
///     rather than like an admission they were fooled.
///
/// Every word here comes from the engine, so it can be improved without shipping a new build.
class InterventionScreen extends StatefulWidget {
  const InterventionScreen({super.key, required this.session});
  final ProtectionSession session;

  @override
  State<InterventionScreen> createState() => _InterventionScreenState();
}

class _InterventionScreenState extends State<InterventionScreen> {
  late ProtectionSession _session = widget.session;
  final Map<String, String> _answers = {};
  bool _submitting = false;

  bool get _allAnswered =>
      _session.questions.isNotEmpty && _answers.length == _session.questions.length;

  Future<void> _submitAnswers() async {
    setState(() => _submitting = true);
    await Future<void>.delayed(const Duration(milliseconds: 550));
    if (!mounted) return;
    setState(() {
      // In a live build this is `api.submitAnswers`; the engine decides what an answer means.
      _session = _session.copyWith(
        verdict: ProtectionVerdict.hold,
        display: DemoData.afterAnswers(),
        questions: const [],
      );
      _submitting = false;
    });
  }

  void _finish({required bool cancelled}) {
    AppScope.of(context).recordOutcome(_session, cancelled: cancelled);
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(cancelled
            ? 'Payment cancelled. Your money stayed in your account.'
            : 'Payment sent.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final display = _session.display;
    final text = Theme.of(context).textTheme;
    final severity = switch (display.tone) {
      DisplayTone.stop => Severity.stop,
      DisplayTone.caution => Severity.caution,
      DisplayTone.info => Severity.safe,
    };
    final style = SeverityStyle.of(severity);

    return Scaffold(
      backgroundColor: SentraColors.ground,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [style.bg, SentraColors.ground],
            stops: const [0, 0.42],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Deliberately no back arrow: leaving is a decision, made with the buttons below.
              Padding(
                padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.sm, Gap.lg, 0),
                child: Row(
                  children: [
                    // Flexible so a longer label (or a larger accessibility text size) shrinks
                    // rather than overflowing the row.
                    Flexible(
                      child: StatusPill(
                        label: switch (display.tone) {
                          DisplayTone.stop => 'Stop before you send',
                          DisplayTone.caution => 'Please check',
                          DisplayTone.info => 'Checked',
                        },
                        severity: severity,
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
                    const SizedBox(height: 6),
                    Text(
                      formatMoney(_session.amount, _session.currency),
                      style: text.displaySmall?.copyWith(fontSize: 38),
                    ),
                    if (_session.payeeLabel != null) ...[
                      const SizedBox(height: 2),
                      Text('to ${_session.payeeLabel}', style: text.bodyLarge),
                    ],
                    const VGap(Gap.xl),
                    Text(display.headline, style: text.headlineSmall?.copyWith(color: style.fg)),
                    const VGap.sm(),
                    Text(display.body, style: text.bodyLarge),
                    if (display.reasons.isNotEmpty) ...[
                      const VGap.lg(),
                      SentraCard(
                        padding: const EdgeInsets.symmetric(
                            horizontal: Gap.lg, vertical: Gap.xs),
                        child: Column(
                          children: [
                            for (var i = 0; i < display.reasons.length; i++)
                              _ReasonRow(
                                reason: display.reasons[i],
                                color: style.fg,
                                showDivider: i > 0,
                              ),
                          ],
                        ),
                      ),
                    ],
                    if (_session.questions.isNotEmpty) ...[
                      const VGap(Gap.xl),
                      const SectionLabel('A couple of quick questions'),
                      const VGap.md(),
                      for (final question in _session.questions)
                        Padding(
                          padding: const EdgeInsets.only(bottom: Gap.md),
                          child: _QuestionCard(
                            question: question,
                            selected: _answers[question.id],
                            onSelect: (optionId) =>
                                setState(() => _answers[question.id] = optionId),
                          ),
                        ),
                    ],
                    const VGap.lg(),
                    Text(
                      display.footnote,
                      textAlign: TextAlign.center,
                      style: text.bodySmall,
                    ),
                  ],
                ),
              ),

              // Actions sit in a fixed footer so the decision is always reachable.
              Container(
                padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.lg, Gap.lg),
                decoration: const BoxDecoration(
                  color: SentraColors.card,
                  border: Border(top: BorderSide(color: SentraColors.line)),
                ),
                child: _session.questions.isNotEmpty
                    ? FilledButton(
                        onPressed: _allAnswered && !_submitting ? _submitAnswers : null,
                        child: _submitting
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2.4, color: Colors.white),
                              )
                            : const Text('Continue'),
                      )
                    : Column(
                        children: [
                          FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: style.fg),
                            onPressed: () => _finish(cancelled: true),
                            child: Text(display.cancelLabel),
                          ),
                          if (display.continueLabel != null) ...[
                            const VGap.md(),
                            OutlinedButton(
                              onPressed: () => _finish(cancelled: false),
                              child: Text(display.continueLabel!),
                            ),
                          ],
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReasonRow extends StatelessWidget {
  const _ReasonRow({required this.reason, required this.color, required this.showDivider});

  final DisplayReason reason;
  final Color color;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      children: [
        if (showDivider) const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: Gap.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 5),
                child: Icon(Icons.circle, size: 8, color: color),
              ),
              const SizedBox(width: Gap.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(reason.title,
                        style: text.titleMedium?.copyWith(fontSize: 15.5)),
                    const SizedBox(height: 3),
                    Text(reason.detail, style: text.bodySmall),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _QuestionCard extends StatelessWidget {
  const _QuestionCard({
    required this.question,
    required this.selected,
    required this.onSelect,
  });

  final PollQuestion question;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SentraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(question.prompt, style: text.titleMedium),
          if (question.helper != null) ...[
            const SizedBox(height: 4),
            Text(question.helper!, style: text.bodySmall),
          ],
          const VGap.md(),
          Wrap(
            spacing: Gap.sm,
            runSpacing: Gap.sm,
            children: question.options.map((option) {
              final isSelected = selected == option.id;
              return _OptionChip(
                label: option.label,
                selected: isSelected,
                onTap: () => onSelect(option.id),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _OptionChip extends StatelessWidget {
  const _OptionChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Radii.md),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(horizontal: Gap.xl, vertical: Gap.md),
          decoration: BoxDecoration(
            color: selected ? SentraColors.accentSoft : SentraColors.card,
            borderRadius: BorderRadius.circular(Radii.md),
            border: Border.all(
              color: selected ? SentraColors.accent : SentraColors.lineStrong,
              width: selected ? 2 : 1.5,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (selected) ...[
                const Icon(Icons.check_circle_rounded, size: 18, color: SentraColors.accent),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                  color: selected ? SentraColors.accentInk : SentraColors.ink,
                ),
              ),
            ],
          ),
        ),
      );
}
