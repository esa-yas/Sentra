import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_app/screens/auth/sign_in_screen.dart';
import 'package:sentra_app/screens/auth/sign_up_screen.dart';
import 'package:sentra_app/services/auth_service.dart';
import 'package:sentra_app/theme/theme.dart';

/// Stands in for the real root: it swaps the screen when the session changes, exactly as the app
/// does, so a test can prove the swap is actually visible to the person.
class _TestRoot extends StatelessWidget {
  const _TestRoot();

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: sentraLightTheme(),
        home: ValueListenableBuilder<bool>(
          valueListenable: AuthSession.signedIn,
          builder: (context, signedIn, _) =>
              signedIn ? const Scaffold(body: Center(child: Text('SIGNED IN'))) : const SignInScreen(),
        ),
      );
}

void useTallPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  setUp(() => AuthSession.signedIn.value = false);
  tearDown(() => AuthSession.signedIn.value = false);

  testWidgets('signing in lands the person in the app', (tester) async {
    useTallPhone(tester);
    await tester.pumpWidget(const _TestRoot());
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).at(0), 'ada@example.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'a-good-password');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('SIGNED IN'), findsOneWidget);
  });

  // The bug: sign-up is a pushed route, so a session change swaps the screen *underneath* it and
  // the person is left staring at the form they just submitted.
  testWidgets('signing up leaves the sign-up form behind', (tester) async {
    useTallPhone(tester);
    await tester.pumpWidget(const _TestRoot());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Sign up'));
    await tester.pumpAndSettle();
    expect(find.byType(SignUpScreen), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(0), 'Ada Lovelace');
    await tester.enterText(find.byType(TextFormField).at(1), 'ada@example.com');
    await tester.enterText(find.byType(TextFormField).at(2), 'a-good-password');
    // The button sits below the fold on a phone, so scroll to it as a person would.
    await tester.scrollUntilVisible(find.text('Create account'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();

    expect(find.byType(SignUpScreen), findsNothing, reason: 'the form must not stay on screen');
    expect(find.text('SIGNED IN'), findsOneWidget);
  });
}
