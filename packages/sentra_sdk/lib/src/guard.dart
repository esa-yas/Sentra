import 'package:flutter/material.dart';

import 'client.dart';
import 'intervention_screen.dart';
import 'models.dart';

/// The one thing a bank calls.
///
/// [protectPayment] opens a session and, only if the engine flags it, presents Sentra's
/// interception over the bank's app and runs the conversation. It returns a [ProtectionResult]
/// the bank acts on — the SDK never moves money and never blocks it, it only advises.
///
/// It fails *open*: if Sentra can't be reached, the result is `cleared` (the payment proceeds),
/// because a scam-check outage must never freeze a customer out of their own bank. A bank that
/// wants the opposite can inspect [SentraException] by using [SentraClient] directly.
class SentraGuard {
  const SentraGuard({required this.client});

  final SentraClient client;

  Future<ProtectionResult> protectPayment(
    BuildContext context, {
    required String subjectRef,
    required double amount,
    String currency = 'USD',
    String? payeeLabel,
    bool firstTimePayee = false,
    int payeeAgeDays = 0,
    int paymentVelocity24h = 0,
    bool onPhoneCall = false,
    bool callerUnknown = false,
    bool deviceChange = false,
  }) async {
    ProtectionSession session;
    try {
      session = await client.open(
        subjectRef: subjectRef,
        amount: amount,
        currency: currency,
        payeeLabel: payeeLabel,
        firstTimePayee: firstTimePayee,
        payeeAgeDays: payeeAgeDays,
        paymentVelocity24h: paymentVelocity24h,
        onPhoneCall: onPhoneCall,
        callerUnknown: callerUnknown,
        deviceChange: deviceChange,
      );
    } on SentraException {
      // Fail open: an unreachable scam-check must not stop the customer's own payment.
      return const ProtectionResult.cleared();
    }

    // Nothing looked wrong — the customer never sees Sentra at all.
    if (session.verdict == ProtectionVerdict.proceed) {
      return ProtectionResult(
        outcome: ProtectionOutcome.cleared,
        caseReference: session.caseReference,
        sessionId: session.sessionId,
      );
    }

    if (!context.mounted) return const ProtectionResult.cleared();

    final result = await Navigator.of(context).push<ProtectionResult>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => SentraInterventionScreen(session: session, client: client),
      ),
    );
    return result ?? const ProtectionResult.cleared();
  }
}
