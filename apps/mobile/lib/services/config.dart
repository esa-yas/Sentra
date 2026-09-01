/// Runtime configuration, supplied at build time.
///
/// Run with `--dart-define-from-file=env.json` to point the app at a real Supabase project and
/// API. Without those values the app still runs end to end on seeded data, which is what keeps
/// every screen demonstrable without a bank partner.
class AppConfig {
  const AppConfig._();

  /// The Sentra API. On a simulator, localhost is the host machine; on a real device this must be
  /// the Mac's LAN address.
  static const String apiBaseUrl = String.fromEnvironment(
    'SENTRA_API_URL',
    defaultValue: 'http://localhost:3001',
  );

  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// Where a bank sends the customer back after they approve the connection.
  static const String bankRedirectUri = String.fromEnvironment(
    'SENTRA_BANK_REDIRECT',
    defaultValue: 'sentra://bank-callback',
  );

  static bool get authConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  /// True when no API was supplied, so the app should use its seeded account.
  static const bool useDemoData = !bool.hasEnvironment('SENTRA_API_URL');
}
