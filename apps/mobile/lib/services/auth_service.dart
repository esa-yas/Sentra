import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

/// Real authentication, backed by Supabase.
///
/// Every method returns plain data or throws [AuthFailure] with a message written for the person
/// reading it. Supabase's own strings ("Invalid login credentials", "over_email_send_rate_limit")
/// are accurate but tell a worried customer nothing about what to do, and some of them blame the
/// user for what is really a server misconfiguration.
class AuthFailure implements Exception {
  const AuthFailure(this.message, {this.isConfiguration = false});

  final String message;

  /// True when the cause is our setup, not anything the person typed.
  final bool isConfiguration;

  @override
  String toString() => message;
}

class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  /// Whether Supabase credentials were supplied at build time. When false the app runs in demo
  /// mode: every screen still works, but no account is created anywhere.
  bool get isConfigured => AppConfig.authConfigured;

  static Future<void> initialise() async {
    if (!AppConfig.authConfigured) return;
    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      publishableKey: AppConfig.supabaseAnonKey,
      authOptions: const FlutterAuthClientOptions(authFlowType: AuthFlowType.pkce),
    );
  }

  GoTrueClient get _auth => Supabase.instance.client.auth;

  Session? get session => isConfigured ? _auth.currentSession : null;
  User? get user => isConfigured ? _auth.currentUser : null;
  bool get isSignedIn => session != null;

  /// Fires on sign-in, sign-out, token refresh and recovery, so the app can follow the session
  /// rather than guess at it.
  Stream<AuthState> get onAuthStateChange => _auth.onAuthStateChange;

  String? get accessToken => session?.accessToken;

  /// The display name captured at sign-up, when there is one.
  String? get displayName {
    final value = user?.userMetadata?['full_name'];
    return value is String && value.trim().isNotEmpty ? value.trim() : null;
  }

  Future<void> signUp({
    required String email,
    required String password,
    required String fullName,
  }) =>
      _guard(() => _auth.signUp(
            email: email.trim(),
            password: password,
            data: {'full_name': fullName.trim()},
          ));

  Future<void> signIn({required String email, required String password}) =>
      _guard(() => _auth.signInWithPassword(email: email.trim(), password: password));

  /// Sends the code used by the reset flow.
  Future<void> sendResetCode(String email) =>
      _guard(() => _auth.resetPasswordForEmail(email.trim()));

  /// Exchanges the emailed code for a session, so a new password can be set.
  Future<void> verifyResetCode({required String email, required String code}) => _guard(
        () => _auth.verifyOTP(
          email: email.trim(),
          token: code.trim(),
          type: OtpType.recovery,
        ),
      );

  Future<void> updatePassword(String password) =>
      _guard(() => _auth.updateUser(UserAttributes(password: password)));

  /// Runs one auth call, turning *every* failure into an [AuthFailure].
  ///
  /// Catching only [AuthException] left network faults — an unreachable project, no signal, a
  /// captive portal — escaping as unhandled errors, which meant the form simply never came back.
  /// Silence is the worst possible answer at a sign-in screen, so nothing is allowed through.
  Future<void> _guard(Future<Object?> Function() operation) async {
    _requireConfigured();
    try {
      await operation().timeout(const Duration(seconds: 20));
    } on AuthException catch (e) {
      throw _translate(e);
    } on TimeoutException {
      throw const AuthFailure(
        'That took too long. Check your connection and try again.',
      );
    } catch (e) {
      throw _networkFailure(e);
    }
  }

  /// Names the specific network fault when it can, because "something went wrong" sends people
  /// hunting through their own password rather than their signal.
  AuthFailure _networkFailure(Object error) {
    final text = error.toString().toLowerCase();
    if (text.contains('failed host lookup') ||
        text.contains('nodename nor servname') ||
        text.contains('enotfound')) {
      return const AuthFailure(
        'We can’t reach Sentra’s servers. This build points at a project that no longer exists — '
        'that’s our setup, not your details.',
        isConfiguration: true,
      );
    }
    if (text.contains('socketexception') ||
        text.contains('connection') ||
        text.contains('network')) {
      return const AuthFailure(
        'No connection to Sentra. Check your internet and try again.',
      );
    }
    return AuthFailure('Something went wrong signing you in. $error');
  }

  Future<void> signOut() async {
    if (!isConfigured) return;
    await _auth.signOut();
  }

  void _requireConfigured() {
    if (!isConfigured) {
      throw const AuthFailure(
        'Sign-in is not configured in this build. Run with --dart-define-from-file=env.json to '
        'connect it to Supabase.',
        isConfiguration: true,
      );
    }
  }

  /// Maps Supabase errors to something a person can act on.
  AuthFailure _translate(AuthException e) {
    final code = e.code ?? '';
    final message = e.message.toLowerCase();

    if (message.contains('invalid api key') || message.contains('invalid jwt')) {
      return const AuthFailure(
        'This build can’t reach authentication — its key looks wrong. That’s a setup problem on '
        'our side, not your details.',
        isConfiguration: true,
      );
    }
    if (code == 'over_email_send_rate_limit' || message.contains('email rate limit')) {
      return const AuthFailure(
        'Too many emails have been sent from this project recently. Wait a few minutes and try again.',
      );
    }
    if (code == 'invalid_credentials' || message.contains('invalid login credentials')) {
      return const AuthFailure('That email or password is incorrect.');
    }
    if (code == 'user_already_exists' || message.contains('already registered')) {
      return const AuthFailure('An account with this email already exists. Sign in instead.');
    }
    if (code == 'weak_password' || message.contains('password should be')) {
      return const AuthFailure('That password is too weak. Use at least 8 characters.');
    }
    if (code == 'email_not_confirmed' || message.contains('email not confirmed')) {
      return const AuthFailure('Confirm your email first — check your inbox for the link.');
    }
    if (code == 'otp_expired' || message.contains('token has expired')) {
      return const AuthFailure('That code has expired. Send yourself a new one.');
    }
    if (message.contains('invalid') && message.contains('token')) {
      return const AuthFailure('That code isn’t right. Check it and try again.');
    }
    return AuthFailure(e.message);
  }
}

/// The façade the screens actually call.
///
/// It hides one decision from every form: whether this build has Supabase credentials. With them
/// the account is real; without them the same flows run against a seeded session, so the whole
/// app stays demonstrable without a project — and no screen needs to know which it is.
class AuthSession {
  const AuthSession._();

  static const _rememberKey = 'sentra.remember_me';

  static final ValueNotifier<bool> signedIn = ValueNotifier<bool>(false);
  static String? _demoName;
  static String? _demoEmail;

  static String get displayName =>
      AuthService.instance.displayName ?? _demoName ?? 'there';

  static String get email => AuthService.instance.user?.email ?? _demoEmail ?? '';

  /// Restores a previous session, honouring the person's "keep me signed in" choice.
  static Future<void> restore() async {
    if (!AuthService.instance.isConfigured) return;
    final prefs = await SharedPreferences.getInstance();
    final remember = prefs.getBool(_rememberKey) ?? true;
    if (!remember && AuthService.instance.isSignedIn) {
      // They asked not to be kept signed in, so the restored session is discarded.
      await AuthService.instance.signOut();
    }
    signedIn.value = AuthService.instance.isSignedIn;
  }

  static Future<void> signIn({
    required String email,
    required String password,
    bool remember = true,
  }) async {
    if (AuthService.instance.isConfigured) {
      await AuthService.instance.signIn(email: email, password: password);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_rememberKey, remember);
    } else {
      _demoEmail = email.trim();
      _demoName ??= email.split('@').first;
    }
    signedIn.value = true;
  }

  /// Returns true when the account was created but still needs its email confirmed.
  static Future<bool> signUp({
    required String email,
    required String password,
    required String fullName,
  }) async {
    if (!AuthService.instance.isConfigured) {
      _demoEmail = email.trim();
      _demoName = fullName.trim();
      signedIn.value = true;
      return false;
    }
    await AuthService.instance.signUp(
        email: email, password: password, fullName: fullName);
    final confirmed = AuthService.instance.isSignedIn;
    signedIn.value = confirmed;
    return !confirmed;
  }

  static Future<void> sendResetCode(String email) async {
    if (!AuthService.instance.isConfigured) return;
    await AuthService.instance.sendResetCode(email);
  }

  static Future<void> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    if (!AuthService.instance.isConfigured) {
      signedIn.value = true;
      return;
    }
    await AuthService.instance.verifyResetCode(email: email, code: code);
    await AuthService.instance.updatePassword(newPassword);
    signedIn.value = true;
  }

  static Future<void> signOut() async {
    await AuthService.instance.signOut();
    _demoEmail = null;
    _demoName = null;
    signedIn.value = false;
  }
}
