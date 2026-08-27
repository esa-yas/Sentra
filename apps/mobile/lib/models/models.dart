/// Data the app shows. These mirror the API contracts in `@sentra/contracts`; the app never
/// invents risk logic of its own — a verdict, its wording and its questions all arrive from the
/// engine, so they can be improved without shipping a new build.
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

/// One reason, already written for the customer by the engine.
class DisplayReason {
  const DisplayReason({required this.code, required this.title, required this.detail});

  final String code;
  final String title;
  final String detail;

  factory DisplayReason.fromJson(Map<String, dynamic> json) => DisplayReason(
        code: json['code'] as String? ?? '',
        title: json['title'] as String? ?? '',
        detail: json['detail'] as String? ?? '',
      );
}

/// Everything the interception screen renders. All of it comes from the engine.
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

  ProtectionSession copyWith({
    ProtectionVerdict? verdict,
    CustomerDisplay? display,
    List<PollQuestion>? questions,
  }) =>
      ProtectionSession(
        sessionId: sessionId,
        verdict: verdict ?? this.verdict,
        display: display ?? this.display,
        questions: questions ?? this.questions,
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

/// How a held payment is routed. Mirrors the engine's ReviewRoute.
enum ReviewRoute { none, bank, guardian, guardianThenBank }

ReviewRoute routeFromString(String value) => switch (value.toUpperCase()) {
      'GUARDIAN' => ReviewRoute.guardian,
      'GUARDIAN_THEN_BANK' => ReviewRoute.guardianThenBank,
      'BANK' => ReviewRoute.bank,
      _ => ReviewRoute.none,
    };

String routeToString(ReviewRoute route) => switch (route) {
      ReviewRoute.guardian => 'GUARDIAN',
      ReviewRoute.guardianThenBank => 'GUARDIAN_THEN_BANK',
      ReviewRoute.bank => 'BANK',
      ReviewRoute.none => 'NONE',
    };

enum GuardianStatus {
  /// Named, but the other person has not accepted. Never routed to.
  pending,

  /// Both accepted, but still inside the cooling-off period. Not yet routed to.
  cooling,
  active,
  revoked,
}

/// A guardian relationship, from either side.
class Guardian {
  const Guardian({
    required this.id,
    required this.name,
    required this.status,
    required this.route,
    required this.bankConnected,
    this.activeFrom,
    this.direction = GuardianDirection.protecting,
  });

  final String id;
  final String name;
  final GuardianStatus status;
  final ReviewRoute route;

  /// Both people must have a bank connected before a link can go live.
  final bool bankConnected;

  /// When the cooling-off period ends and the link starts working.
  final DateTime? activeFrom;
  final GuardianDirection direction;

  bool get isLive => status == GuardianStatus.active;

  /// Days left of the cooling-off period, or null when it does not apply.
  int? get coolingDaysLeft {
    if (status != GuardianStatus.cooling || activeFrom == null) return null;
    final days = activeFrom!.difference(DateTime.now()).inHours / 24;
    return days.ceil().clamp(0, 99);
  }
}

/// Whether this person guards someone else, or is guarded by them.
enum GuardianDirection { protecting, guardedBy }

enum ActivityKind { held, warned, checked, guardianApproved, guardianAdded }

/// One entry in the Protection Log.
class ActivityEntry {
  const ActivityEntry({
    required this.id,
    required this.kind,
    required this.title,
    required this.subtitle,
    required this.at,
    this.amount,
    this.currency = 'GBP',
    this.caseReference,
  });

  final String id;
  final ActivityKind kind;
  final String title;
  final String subtitle;
  final DateTime at;
  final double? amount;
  final String currency;
  final String? caseReference;
}

/// A hold waiting on this user, as a guardian, to approve or refuse.
class GuardianRequest {
  const GuardianRequest({
    required this.id,
    required this.forPersonName,
    required this.amount,
    required this.currency,
    required this.payeeLabel,
    required this.reasons,
    required this.expiresAt,
    required this.caseReference,
  });

  final String id;
  final String forPersonName;
  final double amount;
  final String currency;
  final String payeeLabel;
  final List<String> reasons;
  final DateTime expiresAt;
  final String caseReference;

  Duration get timeLeft {
    final left = expiresAt.difference(DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }
}
