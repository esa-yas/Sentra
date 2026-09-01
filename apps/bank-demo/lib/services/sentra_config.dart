/// Where the demo bank finds Sentra.
///
/// Supplied at build time so the same binary can point at a laptop on the LAN for a device demo,
/// or localhost in a simulator, without an edit. The key is the one the bank "minted in its
/// console" — in a real integration it would live in the bank's own secret store.
class SentraConfig {
  const SentraConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'SENTRA_API_URL',
    defaultValue: 'http://localhost:3001',
  );

  static const String secretKey = String.fromEnvironment(
    'SENTRA_KEY',
    defaultValue: 'sk_test_sentrademo000banksdemo01',
  );

  /// The shared, pseudonymous customer reference. The join between this bank's payment and any
  /// telecom signal for the same person — never a real account number.
  static const String subjectRef = String.fromEnvironment(
    'SENTRA_SUBJECT_REF',
    defaultValue: 'sbj_demo_9f2c1a',
  );
}
