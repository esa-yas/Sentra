import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_sdk/sentra_sdk.dart';
import 'package:sentra_sdk/src/models.dart';

void main() {
  group('ProtectionResult.allowed', () {
    // The one line a bank branches on. Only these two outcomes may move money.
    test('is true only when cleared or the customer chose to send', () {
      expect(const ProtectionResult(outcome: ProtectionOutcome.cleared, caseReference: '').allowed,
          isTrue);
      expect(const ProtectionResult(outcome: ProtectionOutcome.sent, caseReference: 'AC-1').allowed,
          isTrue);
      expect(
          const ProtectionResult(outcome: ProtectionOutcome.cancelled, caseReference: 'AC-1')
              .allowed,
          isFalse);
      expect(const ProtectionResult(outcome: ProtectionOutcome.held, caseReference: 'AC-1').allowed,
          isFalse);
    });
  });

  group('parsing what the engine returns', () {
    test('a HOLD carries no continue label — there is no "send anyway"', () {
      final display = CustomerDisplay.fromJson({
        'tone': 'STOP',
        'headline': 'Stop — this looks like a scam',
        'body': 'We think someone is tricking you.',
        'reasons': [
          {'title': 'A suspicious call is happening', 'detail': 'No bank stays on the line.'},
        ],
        'cancelLabel': 'Cancel this payment',
        'footnote': 'Your money stays put.',
      });
      expect(display.tone, DisplayTone.stop);
      expect(display.continueLabel, isNull);
      expect(display.reasons.single.title, contains('suspicious call'));
    });

    test('a session exposes the verdict, questions and a case reference', () {
      final session = ProtectionSession.fromJson({
        'sessionId': 'ses_1',
        'verdict': 'WARN',
        'caseReference': 'AC-04520',
        'display': {'tone': 'CAUTION', 'headline': 'Check', 'body': '', 'cancelLabel': 'Cancel', 'footnote': ''},
        'questions': [
          {'id': 'asked_to_pay', 'prompt': 'Did someone ask you to pay?', 'options': [
            {'id': 'yes', 'label': 'Yes'}, {'id': 'no', 'label': 'No'}
          ]},
        ],
      }, amount: 3000, currency: 'USD', payeeLabel: 'J. Smith');

      expect(session.verdict, ProtectionVerdict.warn);
      expect(session.caseReference, 'AC-04520');
      expect(session.questions.single.options, hasLength(2));
      expect(session.payeeLabel, 'J. Smith');
    });

    test('a revision keeps the identity but takes the new verdict, and drops the questions', () {
      final session = ProtectionSession.fromJson({
        'sessionId': 'ses_1', 'verdict': 'WARN', 'caseReference': 'AC-1',
        'display': {'tone': 'CAUTION', 'headline': '', 'body': '', 'cancelLabel': 'x', 'footnote': ''},
        'questions': [
          {'id': 'q', 'prompt': 'p', 'options': [{'id': 'a', 'label': 'A'}, {'id': 'b', 'label': 'B'}]}
        ],
      }, amount: 3000, currency: 'USD');

      final revised = session.withRevision(
        verdict: ProtectionVerdict.hold,
        display: CustomerDisplay.fromJson(
            {'tone': 'STOP', 'headline': 'Stop', 'body': '', 'cancelLabel': 'Cancel', 'footnote': ''}),
      );
      expect(revised.sessionId, 'ses_1');
      expect(revised.verdict, ProtectionVerdict.hold);
      expect(revised.questions, isEmpty);
    });
  });
}
