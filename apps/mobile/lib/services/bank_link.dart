import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:url_launcher/url_launcher.dart';

import 'config.dart';

/// A bank Sentra can connect to.
///
/// `authorizeUrl` is the bank's own consent page. Sentra never asks for banking credentials
/// itself — the customer signs in on their bank's site and the bank hands back a code. That is
/// the only arrangement a real bank would ever agree to, and the only one a customer should
/// accept from us.
class Bank {
  const Bank({
    required this.id,
    required this.name,
    required this.tagline,
    this.authorizeUrl,
  });

  final String id;
  final String name;
  final String tagline;

  /// Null until a bank is live, which the UI shows honestly rather than hiding the row.
  final String? authorizeUrl;

  bool get isAvailable => authorizeUrl != null && authorizeUrl!.isNotEmpty;
}

/// The banks offered in this build.
///
/// The sandbox entry points at whatever `SENTRA_BANK_SANDBOX_URL` is set to, so a local
/// open-source banking app can be dropped in without touching the app's code.
class BankRegistry {
  const BankRegistry._();

  static const String _sandboxUrl = String.fromEnvironment(
    'SENTRA_BANK_SANDBOX_URL',
    defaultValue: 'http://localhost:4000/oauth/authorize',
  );

  static const List<Bank> banks = [
    Bank(
      id: 'sandbox',
      name: 'Sandbox Bank',
      tagline: 'A test bank for trying Sentra end to end',
      authorizeUrl: _sandboxUrl,
    ),
    Bank(id: 'monzo', name: 'Monzo', tagline: 'Coming soon'),
    Bank(id: 'starling', name: 'Starling Bank', tagline: 'Coming soon'),
    Bank(id: 'chase', name: 'Chase', tagline: 'Coming soon'),
    Bank(id: 'natwest', name: 'NatWest', tagline: 'Coming soon'),
  ];
}

/// The result a bank hands back.
class BankLinkResult {
  const BankLinkResult({required this.bankId, required this.code});
  final String bankId;
  final String code;
}

/// Opens the bank's consent page and waits for it to redirect back.
///
/// The customer authenticates on the bank's own domain, in the system browser — not inside a
/// Sentra webview, which is what makes the padlock in the address bar mean something. We only
/// ever receive a short-lived code.
class BankLink {
  BankLink._();
  static final BankLink instance = BankLink._();

  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _subscription;
  Completer<BankLinkResult>? _pending;

  /// Starts listening for the redirect. Safe to call more than once.
  void start() {
    _subscription ??= _appLinks.uriLinkStream.listen(_handle);
  }

  void dispose() {
    _subscription?.cancel();
    _subscription = null;
  }

  void _handle(Uri uri) {
    if (!uri.toString().startsWith(AppConfig.bankRedirectUri)) return;
    final code = uri.queryParameters['code'];
    final bankId = uri.queryParameters['state'] ?? 'sandbox';
    final pending = _pending;
    if (pending == null || pending.isCompleted) return;
    if (code == null || code.isEmpty) {
      pending.completeError(
        const BankLinkFailure('The bank didn’t complete the connection. Nothing was linked.'),
      );
    } else {
      pending.complete(BankLinkResult(bankId: bankId, code: code));
    }
  }

  /// Sends the customer to their bank, then resolves when the bank redirects back.
  ///
  /// Times out rather than hanging: a person who abandons the bank's page and returns to Sentra
  /// should find a screen that has moved on, not a spinner.
  Future<BankLinkResult> connect(
    Bank bank, {
    Duration timeout = const Duration(minutes: 5),
  }) async {
    if (!bank.isAvailable) {
      throw BankLinkFailure('${bank.name} isn’t available to connect yet.');
    }
    start();

    final uri = Uri.parse(bank.authorizeUrl!).replace(queryParameters: {
      ...Uri.parse(bank.authorizeUrl!).queryParameters,
      'client_id': 'sentra',
      'redirect_uri': AppConfig.bankRedirectUri,
      'response_type': 'code',
      'scope': 'payments.read payments.protect',
      'state': bank.id,
    });

    if (!await canLaunchUrl(uri)) {
      throw BankLinkFailure('Couldn’t open ${bank.name}. Check the connection and try again.');
    }

    final completer = Completer<BankLinkResult>();
    _pending = completer;
    await launchUrl(uri, mode: LaunchMode.externalApplication);

    return completer.future.timeout(
      timeout,
      onTimeout: () => throw const BankLinkFailure(
        'The connection wasn’t finished. You can try again whenever you’re ready.',
      ),
    );
  }
}

class BankLinkFailure implements Exception {
  const BankLinkFailure(this.message);
  final String message;
  @override
  String toString() => message;
}
