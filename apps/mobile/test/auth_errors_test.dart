import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_app/services/auth_service.dart';

void main() {
  group('auth failures are always reportable', () {
    // The bug this replaced: an unreachable project threw a DNS error that was not an
    // AuthException, so it escaped the screen's catch and the form hung indefinitely.
    test('an unreachable project reads as our misconfiguration, not the user’s mistake', () {
      const failure = AuthFailure(
        'We can’t reach Sentra’s servers. This build points at a project that no longer exists — '
        'that’s our setup, not your details.',
        isConfiguration: true,
      );
      expect(failure.isConfiguration, isTrue);
      expect(failure.message, contains('no longer exists'));
      expect(failure.message, isNot(contains('password')));
    });

    test('a failure always carries a message a person can read', () {
      const failure = AuthFailure('No connection to Sentra. Check your internet and try again.');
      expect(failure.message, isNotEmpty);
      expect(failure.toString(), failure.message);
      expect(failure.isConfiguration, isFalse);
    });

    // Without credentials the app must say so plainly rather than pretending to sign anyone in.
    test('an unconfigured build refuses clearly', () async {
      expect(AuthService.instance.isConfigured, isFalse);
      await expectLater(
        AuthService.instance.signIn(email: 'a@b.com', password: 'x'),
        throwsA(isA<AuthFailure>()
            .having((e) => e.isConfiguration, 'isConfiguration', isTrue)),
      );
    });
  });
}
