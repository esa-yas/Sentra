import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'auth_service.dart';

/// Everything the first frame needs, resolved once.
///
/// The startup used to read preferences three separate times — restore the session in `main`,
/// restore it again in the root, then check whether the tour had been seen — each one its own
/// round trip on a cold start, behind a bare spinner. This loads the store once, reads from it
/// synchronously, and hands the app a single answer.
class Bootstrap {
  const Bootstrap._({required this.signedIn, required this.onboarded, required this.themeMode});

  final bool signedIn;
  final bool onboarded;
  final ThemeMode themeMode;

  static const _rememberKey = 'sentra.remember_me';
  static const _onboardedKey = 'sentra.onboarding_seen';
  static const _themeKey = 'sentra.theme_mode';

  static Future<Bootstrap> load() async {
    // Supabase restores its own session from storage; both are started together rather than in
    // sequence, because neither depends on the other.
    final results = await Future.wait([
      AuthService.initialise(),
      SharedPreferences.getInstance(),
    ]);
    final prefs = results[1] as SharedPreferences;

    // Honour "don't keep me signed in" before anyone sees a signed-in screen.
    final remember = prefs.getBool(_rememberKey) ?? true;
    if (!remember && AuthService.instance.isSignedIn) {
      await AuthService.instance.signOut();
    }

    return Bootstrap._(
      signedIn: AuthService.instance.isSignedIn,
      onboarded: prefs.getBool(_onboardedKey) ?? false,
      themeMode: switch (prefs.getString(_themeKey)) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      },
    );
  }
}
