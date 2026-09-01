import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';
import 'package:provider/provider.dart';
import 'package:sentra_bank_demo/services/sentra_connection.dart';
import 'package:url_launcher/url_launcher.dart';

/// The bank's authorisation screen — what a customer sees when Sentra asks to connect.
///
/// Sentra deep-links into the bank app with this request. This is the bank's own consent step:
/// it lays out exactly what Sentra will and won't be able to see, and the customer confirms with
/// the same thing they'd use to authorise anything sensitive in their bank — here, Face ID.
///
/// On approval the bank redirects back to Sentra with a one-time code (real OAuth shape). Sentra
/// never sees a banking credential; the customer authenticates only with their bank.
class AuthorizeSentraScreen extends StatefulWidget {
  const AuthorizeSentraScreen({super.key, required this.request});

  /// The `sentrabank://authorize?...` link Sentra opened the bank with.
  final Uri request;

  @override
  State<AuthorizeSentraScreen> createState() => _AuthorizeSentraScreenState();
}

class _AuthorizeSentraScreenState extends State<AuthorizeSentraScreen> {
  static const _sentraPurple = Color(0xFF6D4EF0);
  final _localAuth = LocalAuthentication();
  bool _busy = false;
  String? _error;

  String get _redirectUri =>
      widget.request.queryParameters['redirect_uri'] ?? 'sentra://bank-callback';
  String get _state => widget.request.queryParameters['state'] ?? 'sandbox';

  Future<void> _redirect(Map<String, String> params) async {
    final uri = Uri.parse(_redirectUri).replace(queryParameters: {
      ...Uri.parse(_redirectUri).queryParameters,
      ...params,
      'state': _state,
    });
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    if (mounted) Navigator.of(context).maybePop();
  }

  Future<void> _approve() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // The bank authenticates the customer with Face ID. This never leaves the device and Sentra
      // never sees it — Sentra only receives the code the redirect carries.
      final ok = await _authenticate();
      if (!ok) {
        setState(() => _error = 'We couldn’t confirm it was you. Try again.');
        return;
      }
      if (!mounted) return;
      await context.read<SentraConnection>().connect();
      // A real bank would mint a short-lived authorization code here.
      final code = 'auth_${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}';
      await _redirect({'code': code});
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _authenticate() async {
    try {
      final supported = await _localAuth.isDeviceSupported();
      final canCheck = await _localAuth.canCheckBiometrics;
      if (!supported && !canCheck) {
        // No biometrics on this device (e.g. a plain simulator) — the demo proceeds so the flow
        // is still walkable; a real bank would require a fallback passcode instead.
        return true;
      }
      return await _localAuth.authenticate(
        localizedReason: 'Confirm it’s you to connect Sentra',
        options: const AuthenticationOptions(biometricOnly: false, stickyAuth: true),
      );
    } on Exception {
      return true; // Never trap the demo behind an unavailable sensor.
    }
  }

  Future<void> _cancel() => _redirect({'error': 'access_denied'});

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F6FB),
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _logo(const Color(0xFF161D28), 'B'),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Icon(Icons.sync_alt_rounded, color: Color(0xFF8E8EA6)),
                        ),
                        _logo(_sentraPurple, null, shield: true),
                      ],
                    ),
                    const SizedBox(height: 24),
                    const Text('Connect Sentra to your account?',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFF121220), height: 1.2)),
                    const SizedBox(height: 10),
                    const Text(
                      'Sentra checks your payments for signs of a scam, in the moment you make them. '
                      'You approve this here, in your bank — Sentra never sees your password.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 15, height: 1.5, color: Color(0xFF5C5C74)),
                    ),
                    const SizedBox(height: 24),
                    _panel(
                      title: 'What you’re allowing',
                      children: const [
                        _Row(icon: Icons.check_rounded, good: true, text: 'See a payment as you make it — the amount and whether the payee is new'),
                        _Row(icon: Icons.check_rounded, good: true, text: 'Pause a payment that looks like a scam, so you can check it'),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _panel(
                      title: 'What Sentra never gets',
                      children: const [
                        _Row(icon: Icons.close_rounded, good: false, text: 'Your account number, balance, or card details'),
                        _Row(icon: Icons.close_rounded, good: false, text: 'Your banking password or the ability to move money'),
                      ],
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFDECEB),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFF2C7C3)),
                        ),
                        child: Text(_error!, style: const TextStyle(color: Color(0xFFC8322A), fontSize: 14)),
                      ),
                    ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 20),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Color(0xFFE8E8F2))),
                ),
                child: Column(
                  children: [
                    SizedBox(
                      height: 54,
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _busy ? null : _approve,
                        style: FilledButton.styleFrom(
                          backgroundColor: _sentraPurple,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                        icon: _busy
                            ? const SizedBox(
                                width: 18, height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                            : const Icon(Icons.face_rounded, size: 20),
                        label: Text(_busy ? 'Confirming…' : 'Confirm with Face ID'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 54,
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: _busy ? null : _cancel,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF121220),
                          side: const BorderSide(color: Color(0xFFD6D6E6), width: 1.4),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                          textStyle: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
                        ),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text('You can disconnect Sentra at any time in Settings.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12.5, color: Color(0xFF8E8EA6))),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _logo(Color color, String? letter, {bool shield = false}) => Container(
        width: 58,
        height: 58,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(16)),
        alignment: Alignment.center,
        child: shield
            ? const Icon(Icons.shield_rounded, color: Colors.white, size: 30)
            : Text(letter ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 26)),
      );

  Widget _panel({required String title, required List<Widget> children}) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE8E8F2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title.toUpperCase(),
                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Color(0xFF8E8EA6))),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      );
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.good, required this.text});
  final IconData icon;
  final bool good;
  final String text;

  @override
  Widget build(BuildContext context) {
    final color = good ? const Color(0xFF0D7350) : const Color(0xFFC8322A);
    final bg = good ? const Color(0xFFE4F4EE) : const Color(0xFFFDECEB);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 24, height: 24,
            decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
            child: Icon(icon, size: 15, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 14.5, height: 1.4, color: Color(0xFF383850))),
          ),
        ],
      ),
    );
  }
}
