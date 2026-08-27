import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/models.dart';
import 'config.dart';

/// Thrown when the API answers with an error the user may need to hear about.
class SentraApiException implements Exception {
  SentraApiException(this.code, this.message);
  final String code;
  final String message;
  @override
  String toString() => message;
}

/// Thrown when Sentra could not be reached at all.
class SentraUnavailable implements Exception {
  SentraUnavailable(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The Dart client for the Sentra API.
///
/// Mirrors `@sentra/bank-sdk`: three calls for a protection session, plus guardian preferences.
/// It carries no product logic — the verdict, the wording and the questions all come back from
/// the engine.
class SentraApi {
  SentraApi({http.Client? client, String? baseUrl, this.timeout = const Duration(seconds: 6)})
      : _client = client ?? http.Client(),
        _baseUrl = (baseUrl ?? AppConfig.apiBaseUrl).replaceAll(RegExp(r'/$'), '');

  final http.Client _client;
  final String _baseUrl;
  final Duration timeout;

  /// Set once the user has signed in, so calls are made as them.
  String? accessToken;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (accessToken != null) 'Authorization': 'Bearer $accessToken',
      };

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    http.Response response;
    try {
      response = await _client
          .post(Uri.parse('$_baseUrl$path'), headers: _headers, body: jsonEncode(body))
          .timeout(timeout);
    } on TimeoutException {
      throw SentraUnavailable('Sentra did not respond in time.');
    } catch (_) {
      throw SentraUnavailable('Sentra could not be reached.');
    }

    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      final error = decoded['error'] as Map<String, dynamic>?;
      throw SentraApiException(
        error?['code'] as String? ?? 'unknown',
        error?['message'] as String? ?? 'Something went wrong.',
      );
    }
    return decoded;
  }

  /// Opens a session for a payment the customer is about to confirm.
  Future<ProtectionSession> openSession({
    required String subjectRef,
    required double amount,
    String currency = 'GBP',
    String? payeeLabel,
    bool firstTimePayee = false,
    bool onPhoneCall = false,
    bool callerUnknown = false,
  }) async {
    final json = await _post('/v1/protection-sessions', {
      'subjectRef': subjectRef,
      'amount': amount,
      'currency': currency,
      if (payeeLabel != null) 'payeeLabel': payeeLabel,
      'firstTimePayee': firstTimePayee,
      'onPhoneCall': onPhoneCall,
      'callerUnknown': callerUnknown,
    });
    return ProtectionSession.fromJson(json,
        amount: amount, currency: currency, payeeLabel: payeeLabel);
  }

  /// Sends the chosen options back. Only the engine knows what an answer means.
  Future<ProtectionSession> submitAnswers(
    ProtectionSession session,
    Map<String, String> answers,
  ) async {
    final json = await _post('/v1/protection-sessions/${session.sessionId}/answers', {
      'answers': answers.entries
          .map((e) => {'questionId': e.key, 'optionId': e.value})
          .toList(growable: false),
    });
    return session.copyWith(
      verdict: verdictFromString(json['verdict'] as String? ?? 'PROCEED'),
      display: CustomerDisplay.fromJson((json['display'] as Map<String, dynamic>?) ?? const {}),
      questions: const [],
    );
  }

  /// Reports how the payment ended. This is what the engine learns from.
  Future<void> resolveSession(String sessionId, String outcome, {bool? confirmedScam}) async {
    await _post('/v1/protection-sessions/$sessionId/resolve', {
      'outcome': outcome,
      if (confirmedScam != null) 'confirmedScam': confirmedScam,
    });
  }

  Future<void> setGuardian({
    required String subjectRef,
    required ReviewRoute route,
    required String guardianLabel,
    required String contactRef,
  }) async {
    await _post('/v1/protection-preferences/$subjectRef/guardian', {
      'reviewRoute': routeToString(route),
      'guardianLabel': guardianLabel,
      'contactRef': contactRef,
    });
  }

  Future<void> acceptGuardian(String subjectRef) =>
      _post('/v1/protection-preferences/$subjectRef/guardian/accept', const {})
          .then((_) {});

  Future<void> revokeGuardian(String subjectRef) =>
      _post('/v1/protection-preferences/$subjectRef/guardian/revoke', const {})
          .then((_) {});

  void dispose() => _client.close();
}
