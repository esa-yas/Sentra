import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'client.dart';
import 'models.dart';
import 'theme.dart';

/// The screen that saves the money.
///
/// Presented by [SentraGuard] over the bank's own app. It names the specific thing happening now,
/// asks a question or two — a scammer's script breaks when the victim has to answer for
/// themselves — and on a hold offers no way to send anyway. Refusing is always one tap, and the
/// copy never shames anyone. It self-themes so it looks like Sentra inside any bank app.
class SentraInterventionScreen extends StatefulWidget {
  const SentraInterventionScreen({super.key, required this.session, required this.client});

  final ProtectionSession session;
  final SentraClient client;

  @override
  State<SentraInterventionScreen> createState() => _SentraInterventionScreenState();
}

class _SentraInterventionScreenState extends State<SentraInterventionScreen> {
  late ProtectionSession _session = widget.session;
  final Map<String, String> _answers = {};
  bool _busy = false;

  bool get _allAnswered => _session.questions.every((q) => _answers.containsKey(q.id));

  String _money(double amount, String currency) {
    const symbols = {'GBP': '£', 'USD': r'$', 'EUR': '€'};
    final symbol = symbols[currency.toUpperCase()] ?? '$currency ';
    return '$symbol${NumberFormat('#,##0.00', 'en_US').format(amount)}';
  }

  Future<void> _submitAnswers() async {
    setState(() => _busy = true);
    try {
      _session = await widget.client.submitAnswers(_session, _answers);
    } on SentraException {
      // If the follow-up can't be sent, keep the strongest verdict we already have.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resolve(ProtectionOutcome outcome) async {
    // Report the outcome, but never make the customer wait on it.
    widget.client
        .resolve(_session.sessionId, outcome,
            confirmedScam: outcome == ProtectionOutcome.cancelled ? true : null)
        .catchError((_) {});
    Navigator.of(context).pop(
      ProtectionResult(
        outcome: outcome,
        caseReference: _session.caseReference,
        sessionId: _session.sessionId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = SentraSdkColors.of(context);
    final display = _session.display;
    final tone = display.tone;
    final accent = tone == DisplayTone.stop ? c.stop : (tone == DisplayTone.caution ? c.warn : c.accent);
    final accentBg = tone == DisplayTone.stop ? c.stopBg : (tone == DisplayTone.caution ? c.warnBg : c.surface);
    final hasQuestions = _session.questions.isNotEmpty;

    return PopScope(
      // The only ways out are the buttons: leaving is a decision, not a back-swipe.
      canPop: false,
      child: Theme(
        data: _sdkTheme(c),
        child: Scaffold(
          backgroundColor: c.ground,
          body: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [accentBg, c.ground],
                stops: const [0, 0.4],
              ),
            ),
            child: SafeArea(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                    child: Row(
                      children: [
                        _Pill(
                          label: switch (tone) {
                            DisplayTone.stop => 'Stop before you send',
                            DisplayTone.caution => 'Please check',
                            DisplayTone.info => 'Checked',
                          },
                          color: accent,
                          bg: accentBg,
                          line: tone == DisplayTone.stop ? c.stopLine : c.warnLine,
                        ),
                        const Spacer(),
                        Text('Protected by Sentra',
                            style: TextStyle(color: c.muted, fontSize: 12, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                      children: [
                        Text('You’re about to send',
                            style: TextStyle(
                                color: c.muted,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.6)),
                        const SizedBox(height: 4),
                        Text(_money(_session.amount, _session.currency),
                            style: TextStyle(
                                color: c.ink, fontSize: 40, fontWeight: FontWeight.w800, letterSpacing: -1)),
                        if (_session.payeeLabel != null)
                          Text('to ${_session.payeeLabel}',
                              style: TextStyle(color: c.muted, fontSize: 15)),
                        const SizedBox(height: 24),
                        Text(display.headline,
                            style: TextStyle(
                                color: accent, fontSize: 22, fontWeight: FontWeight.w700, height: 1.2)),
                        const SizedBox(height: 12),
                        Text(display.body,
                            style: TextStyle(color: c.ink, fontSize: 16, height: 1.5)),
                        if (display.reasons.isNotEmpty) ...[
                          const SizedBox(height: 22),
                          _Card(
                            c: c,
                            child: Column(
                              children: [
                                for (var i = 0; i < display.reasons.length; i++) ...[
                                  if (i > 0) Divider(color: c.line, height: 20),
                                  _Reason(reason: display.reasons[i], dot: accent, c: c),
                                ],
                              ],
                            ),
                          ),
                        ],
                        if (hasQuestions) ...[
                          const SizedBox(height: 22),
                          Text('A COUPLE OF QUICK QUESTIONS',
                              style: TextStyle(
                                  color: c.muted, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
                          const SizedBox(height: 12),
                          for (final q in _session.questions) _Question(
                            question: q,
                            selected: _answers[q.id],
                            onSelect: (id) => setState(() => _answers[q.id] = id),
                            c: c,
                          ),
                        ],
                      ],
                    ),
                  ),
                  _Actions(
                    c: c,
                    accent: accent,
                    session: _session,
                    hasQuestions: hasQuestions,
                    allAnswered: _allAnswered,
                    busy: _busy,
                    onContinue: _submitAnswers,
                    onCancel: () => _resolve(ProtectionOutcome.cancelled),
                    onSend: () => _resolve(ProtectionOutcome.sent),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  ThemeData _sdkTheme(SentraSdkColors c) => ThemeData(
        useMaterial3: true,
        brightness: c == SentraSdkColors.dark ? Brightness.dark : Brightness.light,
        fontFamily: 'Roboto',
        colorScheme: (c == SentraSdkColors.dark ? const ColorScheme.dark() : const ColorScheme.light())
            .copyWith(primary: c.accent, surface: c.surface),
      );
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color, required this.bg, required this.line});
  final String label;
  final Color color, bg, line;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
            color: bg, borderRadius: BorderRadius.circular(999), border: Border.all(color: line)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.gpp_maybe_rounded, size: 15, color: color),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12.5)),
        ]),
      );
}

class _Card extends StatelessWidget {
  const _Card({required this.child, required this.c});
  final Widget child;
  final SentraSdkColors c;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: c.surface, borderRadius: BorderRadius.circular(20), border: Border.all(color: c.line)),
        child: child,
      );
}

class _Reason extends StatelessWidget {
  const _Reason({required this.reason, required this.dot, required this.c});
  final DisplayReason reason;
  final Color dot;
  final SentraSdkColors c;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
              width: 7,
              height: 7,
              margin: const EdgeInsets.only(top: 7, right: 12),
              decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(reason.title,
                  style: TextStyle(color: c.ink, fontSize: 15.5, fontWeight: FontWeight.w700)),
              const SizedBox(height: 3),
              Text(reason.detail, style: TextStyle(color: c.muted, fontSize: 13.5, height: 1.4)),
            ]),
          ),
        ],
      );
}

class _Question extends StatelessWidget {
  const _Question(
      {required this.question, required this.selected, required this.onSelect, required this.c});
  final PollQuestion question;
  final String? selected;
  final ValueChanged<String> onSelect;
  final SentraSdkColors c;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: c.surface, borderRadius: BorderRadius.circular(20), border: Border.all(color: c.line)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(question.prompt,
              style: TextStyle(color: c.ink, fontSize: 16, fontWeight: FontWeight.w600)),
          if (question.helper != null) ...[
            const SizedBox(height: 4),
            Text(question.helper!, style: TextStyle(color: c.muted, fontSize: 13.5)),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: question.options.map((o) {
              final on = selected == o.id;
              return GestureDetector(
                onTap: () => onSelect(o.id),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: on ? c.accent.withValues(alpha: 0.12) : c.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: on ? c.accent : c.line, width: on ? 1.6 : 1.2),
                  ),
                  child: Text(o.label,
                      style: TextStyle(
                          color: on ? c.accentInk : c.ink,
                          fontWeight: FontWeight.w700,
                          fontSize: 14.5)),
                ),
              );
            }).toList(),
          ),
        ]),
      );
}

class _Actions extends StatelessWidget {
  const _Actions({
    required this.c,
    required this.accent,
    required this.session,
    required this.hasQuestions,
    required this.allAnswered,
    required this.busy,
    required this.onContinue,
    required this.onCancel,
    required this.onSend,
  });

  final SentraSdkColors c;
  final Color accent;
  final ProtectionSession session;
  final bool hasQuestions, allAnswered, busy;
  final VoidCallback onContinue, onCancel, onSend;

  @override
  Widget build(BuildContext context) {
    final display = session.display;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
      decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.line))),
      child: SafeArea(
        top: false,
        child: hasQuestions
            ? _fill(
                label: busy ? 'Checking…' : 'Continue',
                color: c.accent,
                onTap: (allAnswered && !busy) ? onContinue : null,
              )
            : Column(children: [
                _fill(label: display.cancelLabel, color: accent, onTap: onCancel),
                if (display.continueLabel != null) ...[
                  const SizedBox(height: 8),
                  _outline(label: display.continueLabel!, c: c, onTap: onSend),
                ],
                const SizedBox(height: 8),
                Text(display.footnote,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: c.muted, fontSize: 12.5)),
              ]),
      ),
    );
  }

  Widget _fill({required String label, required Color color, VoidCallback? onTap}) => SizedBox(
        height: 54,
        width: double.infinity,
        child: FilledButton(
          onPressed: onTap,
          style: FilledButton.styleFrom(
            backgroundColor: color,
            foregroundColor: Colors.white,
            disabledBackgroundColor: c.line,
            disabledForegroundColor: c.muted,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          child: Text(label),
        ),
      );

  Widget _outline({required String label, required SentraSdkColors c, VoidCallback? onTap}) =>
      SizedBox(
        height: 54,
        width: double.infinity,
        child: OutlinedButton(
          onPressed: onTap,
          style: OutlinedButton.styleFrom(
            foregroundColor: c.ink,
            side: BorderSide(color: c.line, width: 1.4),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
            textStyle: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
          ),
          child: Text(label),
        ),
      );
}
