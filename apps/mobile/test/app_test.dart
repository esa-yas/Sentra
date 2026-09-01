import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_app/app.dart';
import 'package:sentra_app/models/models.dart';
import 'package:sentra_app/screens/auth/sign_in_screen.dart';
import 'package:sentra_app/screens/guardians/approval_screen.dart';
import 'package:sentra_app/screens/intervention/intervention_screen.dart';
import 'package:sentra_app/services/app_state.dart';
import 'package:sentra_app/services/demo_data.dart';
import 'package:sentra_app/theme/theme.dart';

/// Wraps a screen with the app's theme and state, the way the real app does.
Widget host(Widget child, {AppState? state, ThemeMode mode = ThemeMode.light}) => AppScope(
      state: state ?? AppState(),
      child: MaterialApp(
        theme: sentraLightTheme(),
        darkTheme: sentraDarkTheme(),
        themeMode: mode,
        home: child,
      ),
    );

/// Gives the test a tall phone-sized surface.
///
/// The default 800x600 test window is shorter than any real phone, and these screens are lists
/// that build lazily — so content that a person would simply scroll to is never built at all,
/// and finders miss it. Sizing the surface to a realistic device tests what users actually see.
void useTallPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// Scrolls a lazily-built list until [finder] has been built.
///
/// These screens are ListViews, so content below the fold genuinely does not exist in the tree
/// until scrolled to — exactly as on a real phone.
Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 220, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

/// The prompts of the demo interception, in the order they are shown.
const _q1 = 'Did someone contact you and ask you to make this payment?';
const _q2 = 'Are you on a phone call right now?';

/// Answers the question at [index] by tapping one of its options.
Future<void> answerQuestion(WidgetTester tester, int index, String label) async {
  final option = find.text(label).at(index);
  await tester.ensureVisible(option);
  await tester.pumpAndSettle();
  await tester.tap(option);
  await tester.pumpAndSettle();
}

void main() {
  group('sign in', () {
    testWidgets('refuses a malformed email and an empty password', (tester) async {
      useTallPhone(tester);
      await tester.pumpWidget(host(const SignInScreen()));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'not-an-email');
      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();

      expect(find.text('That doesn\u2019t look like an email address'), findsOneWidget);
      expect(find.text('Enter your password'), findsOneWidget);
    });

    // The safer wording: never reveal which half was wrong, so the form can't be used to
    // discover whether an address has an account here.
    testWidgets('offers a way to sign up and to recover a password', (tester) async {
      useTallPhone(tester);
      await tester.pumpWidget(host(const SignInScreen()));
      await tester.pumpAndSettle();

      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.text('Sign up'), findsOneWidget);
      expect(find.text('Forgot password?'), findsOneWidget);
    });
  });

  group('the interception', () {
    testWidgets('shows the amount, the reasons, and the questions', (tester) async {
      useTallPhone(tester);
      await tester.pumpWidget(host(InterventionScreen(session: DemoData.scamSession())));
      await tester.pumpAndSettle();

      expect(find.text('£3,000.00'), findsOneWidget);
      expect(find.text('Stop — this looks like a scam'), findsOneWidget);
      expect(find.text('A suspicious call is happening right now'), findsOneWidget);
      await scrollTo(tester, find.text(_q1));
      expect(find.text(_q1), findsOneWidget);
    });

    // The screen must not let someone skip past the questions without answering.
    testWidgets('Continue stays disabled until every question is answered', (tester) async {
      useTallPhone(tester);
      await tester.pumpWidget(host(InterventionScreen(session: DemoData.scamSession())));
      await tester.pumpAndSettle();

      FilledButton button() => tester.widget<FilledButton>(find.byType(FilledButton).last);
      expect(button().onPressed, isNull);

      // Building both question cards, then answering only the first.
      await scrollTo(tester, find.text(_q2));
      await answerQuestion(tester, 0, 'Yes');
      expect(button().onPressed, isNull, reason: 'one of two questions answered');

      await answerQuestion(tester, 1, 'Yes');
      expect(button().onPressed, isNotNull);
    });

    // A hold deliberately offers no "send anyway" — only the safer choice.
    testWidgets('a hold offers no way to send anyway', (tester) async {
      useTallPhone(tester);
      await tester.pumpWidget(host(InterventionScreen(session: DemoData.scamSession())));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.text(_q2));
      await answerQuestion(tester, 0, 'Yes');
      await answerQuestion(tester, 1, 'Yes');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.text('Cancel this payment'), findsOneWidget);
      expect(find.textContaining('send anyway'), findsNothing);
    });
  });

  group('guardian approval', () {
    testWidgets('approve is blocked until the guardian confirms they spoke to the person',
        (tester) async {
      useTallPhone(tester);
      await tester.pumpWidget(host(ApprovalScreen(request: DemoData.pendingRequest())));
      await tester.pumpAndSettle();

      final approve = find.widgetWithText(FilledButton, 'Approve this payment');
      expect(tester.widget<FilledButton>(approve).onPressed, isNull);

      // Refusing is always available — the low-friction path is the safe one.
      final refuse = find.widgetWithText(OutlinedButton, 'This looks wrong — keep it held');
      expect(tester.widget<OutlinedButton>(refuse).onPressed, isNotNull);

      await scrollTo(tester, find.textContaining('I have spoken to'));
      await tester.tap(find.textContaining('I have spoken to'));
      await tester.pumpAndSettle();
      expect(tester.widget<FilledButton>(approve).onPressed, isNotNull);
    });

    testWidgets('names the consequence of approving a scam', (tester) async {
      useTallPhone(tester);
      await tester.pumpWidget(host(ApprovalScreen(request: DemoData.pendingRequest())));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.textContaining('investigated by the bank'));
      expect(find.textContaining('investigated by the bank'), findsOneWidget);
    });
  });

  group('app state', () {
    test('a cancelled interception is recorded as a held payment', () {
      final state = AppState();
      expect(state.activity, isEmpty);
      state.recordOutcome(DemoData.scamSession(), cancelled: true);
      expect(state.activity.first.kind, ActivityKind.held);
      expect(state.threatsStopped, 1);
    });

    test('a new guardian is pending, never live immediately', () {
      final state = AppState()..addGuardian('Sara');
      final added = state.guardians.last;
      expect(added.status, GuardianStatus.pending);
      expect(added.isLive, isFalse);
    });

    test('a guardian still inside the waiting period is not live', () {
      final cooling = DemoData.guardians().firstWhere(
        (g) => g.status == GuardianStatus.cooling,
      );
      expect(cooling.isLive, isFalse);
      expect(cooling.coolingDaysLeft, greaterThan(0));
    });
  });

  group('theming', () {
    testWidgets('renders in dark mode without falling back to light colours', (tester) async {
      useTallPhone(tester);
      await tester.pumpWidget(
        host(InterventionScreen(session: DemoData.scamSession()), mode: ThemeMode.dark),
      );
      await tester.pumpAndSettle();

      final context = tester.element(find.byType(InterventionScreen));
      expect(Theme.of(context).brightness, Brightness.dark);
      expect(find.text('£3,000.00'), findsOneWidget);
    });
  });
}
