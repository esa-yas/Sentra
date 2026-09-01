import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/auth_service.dart';
import '../../theme/tokens.dart';
import '../../widgets/auth_shell.dart';
import '../../widgets/common.dart';

/// Step two of a password reset: the emailed code, then the new password.
///
/// Both live on one screen because splitting them means a person can verify a code and then get
/// stuck without a way back to it — the code is single-use and would already be spent.
class VerifyCodeScreen extends StatefulWidget {
  const VerifyCodeScreen({super.key, required this.email});

  final String email;

  @override
  State<VerifyCodeScreen> createState() => _VerifyCodeScreenState();
}

class _VerifyCodeScreenState extends State<VerifyCodeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;
  bool _done = false;

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AuthSession.resetPassword(
        email: widget.email,
        code: _code.text,
        newPassword: _password.text,
      );
      if (mounted) setState(() => _done = true);
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);

    if (_done) {
      return AuthShell(
        title: 'Password changed',
        subtitle: 'You’re signed in with your new password.',
        children: [
          FilledButton(
            onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
            child: const Text('Continue'),
          ),
        ],
      );
    }

    return AuthShell(
      title: 'Enter your code',
      subtitle: 'We sent a code to ${widget.email}. Enter it below and choose a new password.',
      onBack: () => Navigator.of(context).pop(),
      children: [
        Form(
          key: _formKey,
          child: Column(
            children: [
              LabelledField(
                label: 'Verification code',
                controller: _code,
                hint: '123456',
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.oneTimeCode],
                validator: (v) => (v == null || v.trim().length < 4)
                    ? 'Enter the code from your email'
                    : null,
              ),
              const VGap.lg(),
              LabelledField(
                label: 'New password',
                controller: _password,
                hint: 'At least 8 characters',
                obscure: _obscure,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _submit(),
                validator: (v) =>
                    (v == null || v.length < 8) ? 'Use at least 8 characters' : null,
                suffix: IconButton(
                  icon: Icon(_obscure
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined),
                  onPressed: () => setState(() => _obscure = !_obscure),
                  tooltip: _obscure ? 'Show password' : 'Hide password',
                ),
              ),
            ],
          ),
        ),
        if (_error != null) ...[
          const VGap.lg(),
          Notice(severity: Severity.stop, child: Text(_error!)),
        ],
        const VGap.xl(),
        FilledButton.icon(
          onPressed: _busy ? null : _submit,
          icon: _busy
              ? SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: p.onAccent),
                )
              : const Icon(Icons.lock_reset_rounded, size: 19),
          label: Text(_busy ? 'Saving…' : 'Set new password'),
        ),
        const VGap.lg(),
        Center(
          child: TextButton(
            onPressed: _busy
                ? null
                : () async {
                    try {
                      await AuthSession.sendResetCode(widget.email);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('A new code is on its way.')),
                        );
                      }
                    } on AuthFailure catch (e) {
                      if (context.mounted) setState(() => _error = e.message);
                    }
                  },
            child: const Text('Send another code'),
          ),
        ),
      ],
    );
  }
}

/// Digits only, so the field can't take a pasted email or link by mistake.
class DigitsOnly extends TextInputFormatter {
  const DigitsOnly();

  @override
  TextEditingValue formatEditUpdate(TextEditingValue old, TextEditingValue next) =>
      next.text.contains(RegExp(r'[^0-9]')) ? old : next;
}
