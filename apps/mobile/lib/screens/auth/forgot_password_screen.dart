import 'package:flutter/material.dart';

import '../../services/auth_service.dart';
import '../../theme/tokens.dart';
import '../../widgets/auth_shell.dart';
import '../../widgets/common.dart';
import 'verify_code_screen.dart';

/// Step one of a password reset: ask where to send the code.
///
/// The confirmation is deliberately the same whether or not an account exists, so this screen
/// can't be used to find out who banks with a Sentra partner.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AuthSession.sendResetCode(_email.text);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => VerifyCodeScreen(email: _email.text.trim()),
        ),
      );
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    return AuthShell(
      title: 'Forgot password?',
      subtitle: 'Enter your email and we’ll send you a code to set a new one.',
      onBack: () => Navigator.of(context).pop(),
      footer: AuthFooterLink(
        prompt: 'Remembered it?',
        action: 'Sign in',
        onTap: () => Navigator.of(context).pop(),
      ),
      children: [
        Form(
          key: _formKey,
          child: LabelledField(
            label: 'Email address',
            controller: _email,
            hint: 'you@example.com',
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.email],
            onSubmitted: (_) => _submit(),
            validator: validateEmail,
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
              : const Icon(Icons.send_rounded, size: 18),
          label: Text(_busy ? 'Sending…' : 'Send code'),
        ),
      ],
    );
  }
}
