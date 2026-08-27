import '../models/models.dart';

/// A realistic seeded account.
///
/// Every screen — including an interception and a guardian approval — can be explored without a
/// bank partner or a running API. The wording here mirrors what the engine actually returns, so
/// what you see in demo mode is what a real customer would see.
class DemoData {
  const DemoData._();

  static const String subjectRef = 'sbj_demo_9f2c1a';
  static const String personName = 'Ada';

  /// The interception: a large first-time payment during a call from an unknown number.
  static ProtectionSession scamSession() => const ProtectionSession(
        sessionId: 'ses_demo_1',
        verdict: ProtectionVerdict.hold,
        amount: 3000,
        currency: 'GBP',
        payeeLabel: 'J. Smith',
        caseReference: 'AC-02361',
        display: CustomerDisplay(
          tone: DisplayTone.stop,
          headline: 'Stop — this looks like a scam',
          body:
              'We think someone may be tricking you into sending this £3,000.00 payment to J. Smith. '
              'We’ve asked your bank to hold it while this is checked.',
          reasons: [
            DisplayReason(
              code: 'RECENT_SUSPICIOUS_CALL',
              title: 'A suspicious call is happening right now',
              detail:
                  'No bank, police force or government office will ever stay on the phone while you move money.',
            ),
            DisplayReason(
              code: 'NEW_PAYEE',
              title: 'You’ve never paid this person before',
              detail: 'Most scam payments are the first one to a brand-new payee.',
            ),
            DisplayReason(
              code: 'HIGH_VALUE_PAYMENT',
              title: 'This is a large amount',
              detail: 'Larger than you usually send, and larger than most payments we protect.',
            ),
          ],
          cancelLabel: 'Cancel this payment',
          footnote: 'Your money stays in your account. Your bank will confirm before anything is sent.',
        ),
        questions: [
          PollQuestion(
            id: 'asked_to_pay',
            prompt: 'Did someone contact you and ask you to make this payment?',
            helper: 'A call, text, email or message — from anyone.',
            options: [
              PollOption(id: 'yes', label: 'Yes'),
              PollOption(id: 'no', label: 'No'),
              PollOption(id: 'unsure', label: 'I’m not sure'),
            ],
          ),
          PollQuestion(
            id: 'on_call_now',
            prompt: 'Are you on a phone call right now?',
            helper: 'Genuine organisations never ask you to move money while they stay on the line.',
            options: [
              PollOption(id: 'yes', label: 'Yes'),
              PollOption(id: 'no', label: 'No'),
              PollOption(id: 'unsure', label: 'I’m not sure'),
            ],
          ),
        ],
      );

  /// What the engine returns once the customer confirms someone asked them to pay.
  static CustomerDisplay afterAnswers() => const CustomerDisplay(
        tone: DisplayTone.stop,
        headline: 'Stop — this looks like a scam',
        body:
            'What you’ve told us matches how scams work. We’ve asked your bank to hold this '
            '£3,000.00 payment to J. Smith until someone can check it with you.',
        reasons: [
          DisplayReason(
            code: 'ANSWER',
            title: 'You told us someone asked you to make this payment',
            detail: 'This is how almost every authorized-payment scam begins.',
          ),
          DisplayReason(
            code: 'RECENT_SUSPICIOUS_CALL',
            title: 'A suspicious call is happening right now',
            detail: 'No genuine organisation will stay on the line while you move money.',
          ),
        ],
        cancelLabel: 'Cancel this payment',
        footnote: 'Your money stays in your account. Sara has been asked to check with you.',
      );

  static List<ActivityEntry> activity() {
    final now = DateTime.now();
    return [
      ActivityEntry(
        id: 'a1',
        kind: ActivityKind.held,
        title: 'Payment held — £3,000',
        subtitle: 'Matched a live call from an unknown number · you cancelled it',
        at: now.subtract(const Duration(hours: 20)),
        amount: 3000,
        caseReference: 'AC-02361',
      ),
      ActivityEntry(
        id: 'a2',
        kind: ActivityKind.warned,
        title: 'Warned — £850 to a new payee',
        subtitle: 'You checked and sent it',
        at: now.subtract(const Duration(days: 1, hours: 6)),
        amount: 850,
      ),
      ActivityEntry(
        id: 'a3',
        kind: ActivityKind.guardianApproved,
        title: 'Sara approved a payment for you',
        subtitle: '£400 to your landlord',
        at: now.subtract(const Duration(days: 3)),
        amount: 400,
      ),
      ActivityEntry(
        id: 'a4',
        kind: ActivityKind.checked,
        title: 'Checked — £120 to Anna',
        subtitle: 'Nothing unusual',
        at: now.subtract(const Duration(days: 4)),
        amount: 120,
      ),
      ActivityEntry(
        id: 'a5',
        kind: ActivityKind.guardianAdded,
        title: 'Sara became your guardian',
        subtitle: 'You both accepted, and the waiting period finished',
        at: now.subtract(const Duration(days: 12)),
      ),
    ];
  }

  static List<Guardian> guardians() => [
        Guardian(
          id: 'g1',
          name: 'Sara (daughter)',
          status: GuardianStatus.active,
          route: ReviewRoute.guardianThenBank,
          bankConnected: true,
          activeFrom: DateTime.now().subtract(const Duration(days: 12)),
        ),
        Guardian(
          id: 'g2',
          name: 'Tom (son)',
          status: GuardianStatus.cooling,
          route: ReviewRoute.guardian,
          bankConnected: true,
          activeFrom: DateTime.now().add(const Duration(days: 2)),
        ),
      ];

  /// Someone this user is a guardian *for* — the other side of the same app.
  static List<Guardian> protecting() => [
        Guardian(
          id: 'p1',
          name: 'Mum',
          status: GuardianStatus.active,
          route: ReviewRoute.guardianThenBank,
          bankConnected: true,
          direction: GuardianDirection.guardedBy,
          activeFrom: DateTime.now().subtract(const Duration(days: 40)),
        ),
      ];

  static GuardianRequest pendingRequest() => GuardianRequest(
        id: 'req1',
        forPersonName: 'Mum',
        amount: 3000,
        currency: 'GBP',
        payeeLabel: 'J. Smith',
        caseReference: 'AC-02361',
        reasons: const [
          'Held during a call from an unknown number.',
          'First payment to this person.',
          'Much larger than her usual payments.',
        ],
        expiresAt: DateTime.now().add(const Duration(minutes: 8, seconds: 42)),
      );
}
