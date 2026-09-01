/// Sentra — real-time scam protection a bank drops into its own app.
///
/// One call at the transfer-confirmation screen:
///
/// ```dart
/// final result = await SentraGuard(
///   client: SentraClient(apiBaseUrl: '…', secretKey: 'sk_test_…'),
/// ).protectPayment(
///   context,
///   subjectRef: customerRef,
///   amount: amount,
///   currency: 'USD',
///   payeeLabel: payee,
///   firstTimePayee: true,
///   onPhoneCall: deviceIsOnACall,
///   callerUnknown: callerNotInContacts,
/// );
/// if (result.allowed) { /* move the money */ }
/// ```
///
/// Everything the customer sees — the warning, the reasons, the questions — is returned by the
/// Sentra engine and rendered by the SDK. The bank ships no scam logic and no copy, so both
/// improve for every bank at once without an app release. The bank always makes the final call:
/// the SDK only ever *advises*.
library sentra_sdk;

export 'src/client.dart';
export 'src/guard.dart';
export 'src/models.dart' show ProtectionOutcome, ProtectionResult, ProtectionVerdict;
