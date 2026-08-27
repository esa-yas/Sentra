/// Runtime configuration.
///
/// `useDemoData` seeds a realistic account so every screen — including an interception and a
/// guardian approval — can be explored without a bank partner or a running API. It is the
/// difference between a demo and a dead app, not a stub for missing logic: the same widgets,
/// models and flows run in both modes.
class AppConfig {
  const AppConfig._();

  /// Point at a running Sentra API. On a simulator, localhost is the host machine.
  static const String apiBaseUrl = String.fromEnvironment(
    'SENTRA_API_URL',
    defaultValue: 'http://localhost:3001',
  );

  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// Whether Supabase credentials were supplied at build time.
  static bool get authConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  /// Demo mode is on unless an API URL was explicitly provided.
  static const bool useDemoData = !bool.hasEnvironment('SENTRA_API_URL');
}
