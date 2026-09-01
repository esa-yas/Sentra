/// The shapes the SDK exchanges with the Sentra engine. Mirrors `@sentra/contracts`; the SDK
/// never invents a verdict, a reason, or a question — they all arrive from the engine.
library;

enum ProtectionVerdict { proceed, warn, hold }

ProtectionVerdict verdictFromString(String value) => switch (value.toUpperCase()) {
      'HOLD' => ProtectionVerdict.hold,
      'WARN' => ProtectionVerdict.warn,
      _ => ProtectionVerdict.proceed,
    };

enum DisplayTone { info, caution, stop }

DisplayTone toneFromString(String value) => switch (value.toUpperCase()) {
      'STOP' => DisplayTone.stop,
      'CAUTION' => DisplayTone.caution,
      _ => DisplayTone.info,
    };

class DisplayReason {
  const DisplayReason({required this.title, required this.detail});
  final String title;
  final String detail;

  factory DisplayReason.fromJson(Map<String, dynamic> json) => DisplayReason(
        title: json['title'] as String? ?? '',
        detail: json['detail'] as String? ?? '',
      );
}

/// The whole screen, authored by the engine.
class CustomerDisplay {
  const CustomerDisplay({
    required this.tone,
    required this.headline,
    required this.body,
    required this.reasons,
    required this.cancelLabel,
    required this.footnote,
    this.continueLabel,
  });

  final DisplayTone tone;
  final String headline;
  final String body;
  final List<DisplayReason> reasons;
  final String cancelLabel;
  final String footnote;

  /// Absent on a hold — there is deliberately no "send anyway".
  final String? continueLabel;

  factory CustomerDisplay.fromJson(Map<String, dynamic> json) => CustomerDisplay(
        tone: toneFromString(json['tone'] as String? ?? 'INFO'),
        headline: json['headline'] as String? ?? '',
        body: json['body'] as String? ?? '',
        reasons: ((json['reasons'] as List<dynamic>?) ?? const [])
            .map((e) => DisplayReason.fromJson(e as Map<String, dynamic>))
            .toList(),
        cancelLabel: json['cancelLabel'] as String? ?? 'Cancel',
        footnote: json['footnote'] as String? ?? '',
        continueLabel: json['continueLabel'] as String?,
      );
}

class PollOption {
  const PollOption({required this.id, required this.label});
  final String id;
  final String label;

  factory PollOption.fromJson(Map<String, dynamic> json) =>
      PollOption(id: json['id'] as String? ?? '', label: json['label'] as String? ?? '');
}

class PollQuestion {
  const PollQuestion({required this.id, required this.prompt, required this.options, this.helper});
  final String id;
  final String prompt;
  final String? helper;
  final List<PollOption> options;

  factory PollQuestion.fromJson(Map<String, dynamic> json) => PollQuestion(
        id: json['id'] as String? ?? '',
        prompt: json['prompt'] as String? ?? '',
        helper: json['helper'] as String?,
        options: ((json['options'] as List<dynamic>?) ?? const [])
            .map((e) => PollOption.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// A session as the engine returns it.
class ProtectionSession {
  const ProtectionSession({
    required this.sessionId,
    required this.verdict,
    required this.display,
    required this.questions,
    required this.caseReference,
    required this.amount,
    required this.currency,
    this.payeeLabel,
  });

  final String sessionId;
  final ProtectionVerdict verdict;
  final CustomerDisplay display;
  final List<PollQuestion> questions;
  final String caseReference;
  final double amount;
  final String currency;
  final String? payeeLabel;

  ProtectionSession withRevision({
    required ProtectionVerdict verdict,
    required CustomerDisplay display,
  }) =>
      ProtectionSession(
        sessionId: sessionId,
        verdict: verdict,
        display: display,
        questions: const [],
        caseReference: caseReference,
        amount: amount,
        currency: currency,
        payeeLabel: payeeLabel,
      );

  factory ProtectionSession.fromJson(
    Map<String, dynamic> json, {
    required double amount,
    required String currency,
    String? payeeLabel,
  }) =>
      ProtectionSession(
        sessionId: json['sessionId'] as String? ?? '',
        verdict: verdictFromString(json['verdict'] as String? ?? 'PROCEED'),
        display: CustomerDisplay.fromJson((json['display'] as Map<String, dynamic>?) ?? const {}),
        questions: ((json['questions'] as List<dynamic>?) ?? const [])
            .map((e) => PollQuestion.fromJson(e as Map<String, dynamic>))
            .toList(),
        caseReference: json['caseReference'] as String? ?? '',
        amount: amount,
        currency: currency,
        payeeLabel: payeeLabel,
      );
}

/// How the protected payment ended.
enum ProtectionOutcome {
  /// Nothing looked wrong; the SDK never interrupted.
  cleared,

  /// The customer chose to send after a warning.
  sent,

  /// The customer stopped after seeing the warning.
  cancelled,

  /// The engine advised a hold; the bank should route it for review.
  held,
}

/// What the bank acts on. `allowed` is the one line that matters at the call site.
class ProtectionResult {
  const ProtectionResult({
    required this.outcome,
    required this.caseReference,
    this.sessionId,
  });

  const ProtectionResult.cleared()
      : outcome = ProtectionOutcome.cleared,
        caseReference = '',
        sessionId = null;

  final ProtectionOutcome outcome;
  final String caseReference;
  final String? sessionId;

  /// True when the money may move: nothing was flagged, or the customer chose to send anyway.
  bool get allowed =>
      outcome == ProtectionOutcome.cleared || outcome == ProtectionOutcome.sent;
}
