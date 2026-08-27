import 'package:flutter/material.dart';

import 'screens/auth/sign_in_screen.dart';
import 'screens/home/shell.dart';
import 'screens/onboarding/connect_bank_screen.dart';
import 'services/app_state.dart';
import 'theme/theme.dart';

/// Makes the single [AppState] available to the tree without a dependency-injection framework.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child})
      : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope is missing from the widget tree.');
    return scope!.notifier!;
  }
}

class SentraApp extends StatefulWidget {
  const SentraApp({super.key});

  @override
  State<SentraApp> createState() => _SentraAppState();
}

class _SentraAppState extends State<SentraApp> {
  final AppState _state = AppState();

  @override
  void dispose() {
    _state.api.dispose();
    _state.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: _state,
      child: MaterialApp(
        title: 'Sentra',
        debugShowCheckedModeBanner: false,
        theme: buildSentraTheme(),
        home: const _Root(),
      ),
    );
  }
}

/// Sends the person to the right place: sign in, connect a bank, or the app itself.
class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    if (!state.signedIn) return const SignInScreen();
    if (!state.bankConnected) return const ConnectBankScreen();
    return const HomeShell();
  }
}
