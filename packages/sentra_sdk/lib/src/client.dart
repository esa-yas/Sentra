import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// Raised when Sentra answers with an error, or cannot be reached.
///
/// The message is safe to log but is never what the customer sees — the SDK fails open on the
/// bank's terms, and the host app decides what to tell the person.
class SentraException implements Exception {
  const SentraException(this.message, {this.isNetwork = false});
  final String message;
  final bool isNetwork;
  @override
  String toString() => message;
}

/// The HTTP client for the Sentra mobile SDK edge.
///
/// Authenticates with a secret key as a bearer token — the bank embeds the key its console
/// minted. Three calls: open a session, submit the customer's answers, resolve the outcome.
class SentraClient {
  SentraClient({
    required this.apiBaseUrl,
    required this.secretKey,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 12),
  })  : _http = httpClient ?? http.Client(),
        _base = apiBaseUrl.replaceAll(RegExp(r'/$'), '');

  final String apiBaseUrl;
  final String secretKey;
  final Duration timeout;
  final http.Client _http;
  final String _base;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $secretKey',
      };

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    http.Response res;
    try {
      res = await _http
          .post(Uri.parse('$_base$path'), headers: _headers, body: jsonEncode(body))
          .timeout(timeout);
    } on TimeoutException {
      throw const SentraException('Sentra timed out.', isNetwork: true);
    } catch (_) {
      throw const SentraException('Sentra could not be reached.', isNetwork: true);
    }
    final decoded =
        res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      final error = decoded['error'] as Map<String, dynamic>?;
      throw SentraException(error?['message'] as String? ?? 'Sentra returned ${res.statusCode}.');
    }
    return decoded;
  }

  Future<ProtectionSession> open({
    required String subjectRef,
    required double amount,
    String currency = 'USD',
    String? payeeLabel,
    bool firstTimePayee = false,
    int payeeAgeDays = 0,
    int paymentVelocity24h = 0,
    bool onPhoneCall = false,
    bool callerUnknown = false,
    bool deviceChange = false,
  }) async {
    final json = await _post('/v1/sdk/protection-sessions', {
      'subjectRef': subjectRef,
      'amount': amount,
      'currency': currency,
      if (payeeLabel != null) 'payeeLabel': payeeLabel,
      'firstTimePayee': firstTimePayee,
      'payeeAgeDays': payeeAgeDays,
      'paymentVelocity24h': paymentVelocity24h,
      'onPhoneCall': onPhoneCall,
      'callerUnknown': callerUnknown,
      'deviceChange': deviceChange,
    });
    return ProtectionSession.fromJson(json,
        amount: amount, currency: currency, payeeLabel: payeeLabel);
  }

  Future<ProtectionSession> submitAnswers(
    ProtectionSession session,
    Map<String, String> answers,
  ) async {
    final json = await _post('/v1/sdk/protection-sessions/${session.sessionId}/answers', {
      'answers': answers.entries
          .map((e) => {'questionId': e.key, 'optionId': e.value})
          .toList(growable: false),
    });
    return session.withRevision(
      verdict: verdictFromString(json['verdict'] as String? ?? 'PROCEED'),
      display: CustomerDisplay.fromJson((json['display'] as Map<String, dynamic>?) ?? const {}),
    );
  }

  /// Reports how it ended. This is the only moment the engine learns anything, so it is worth
  /// sending even when the app is about to move on.
  Future<void> resolve(String sessionId, ProtectionOutcome outcome, {bool? confirmedScam}) async {
    final wire = switch (outcome) {
      ProtectionOutcome.sent => 'SENT',
      ProtectionOutcome.cancelled => 'ABANDONED',
      ProtectionOutcome.held => 'HELD',
      ProtectionOutcome.cleared => 'SENT',
    };
    await _post('/v1/sdk/protection-sessions/$sessionId/resolve', {
      'outcome': wire,
      if (confirmedScam != null) 'confirmedScam': confirmedScam,
    });
  }

  void dispose() => _http.close();
}
