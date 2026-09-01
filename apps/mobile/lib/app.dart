import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'services/bootstrap.dart';

import 'screens/auth/sign_in_screen.dart';
import 'screens/home/shell.dart';
import 'screens/onboarding/connect_bank_screen.dart';
import 'screens/onboarding/onboarding_screen.dart';
import 'services/app_state.dart';
import 'services/auth_service.dart';
import 'services/bank_link.dart';
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

/// The chosen appearance, remembered between launches.
///
/// Defaults to following the system, which is what most people expect — but a person reading this
/// app in a hospital waiting room at night should be able to force dark without changing their
/// whole phone.
class ThemeController extends ValueNotifier<ThemeMode> {
  ThemeController(super.initial);

  static const _key = 'sentra.theme_mode';

  Future<void> set(ThemeMode mode) async {
    value = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, mode.name);
  }
}

class SentraApp extends StatefulWidget {
  const SentraApp({super.key, required this.boot});

  final Bootstrap boot;

  static ThemeController themeOf(BuildContext context) =>
      context.findAncestorStateOfType<_SentraAppState>()!._theme;

  @override
  State<SentraApp> createState() => _SentraAppState();
}

class _SentraAppState extends State<SentraApp> {
  final AppState _state = AppState();
  late final ThemeController _theme = ThemeController(widget.boot.themeMode);

  @override
  void initState() {
    super.initState();
    // Start listening before any bank redirect can arrive.
    BankLink.instance.start();
  }

  @override
  void dispose() {
    BankLink.instance.dispose();
    _state.api.dispose();
    _state.dispose();
    _theme.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: _state,
      child: ValueListenableBuilder<ThemeMode>(
        valueListenable: _theme,
        builder: (context, mode, _) => MaterialApp(
          title: 'Sentra',
          debugShowCheckedModeBanner: false,
          theme: sentraLightTheme(),
          darkTheme: sentraDarkTheme(),
          themeMode: mode,
          home: _Root(boot: widget.boot),
        ),
      ),
    );
  }
}

/// Sends the person to the right place: sign in, the one-time tour, connect a bank, or the app.
class _Root extends StatefulWidget {
  const _Root({required this.boot});

  final Bootstrap boot;

  @override
  State<_Root> createState() => _RootState();
}

class _RootState extends State<_Root> {
  late bool _onboarded = widget.boot.onboarded;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: AuthSession.signedIn,
      builder: (context, signedIn, _) {
        if (!signedIn) return const SignInScreen();

        if (!_onboarded) {
          return OnboardingScreen(onDone: () => setState(() => _onboarded = true));
        }

        final state = AppScope.of(context);
        if (!state.bankConnected) {
          return ConnectBankScreen(
            onConnected: (result) {
              // The code is exchanged server-side; the app only ever holds the link's outcome.
              state.connectBank(bankId: result.bankId);
            },
          );
        }
        return const HomeShell();
      },
    );
  }
}
