import 'package:flutter/material.dart';

import '../../services/auth_service.dart';
import '../../theme/tokens.dart';
import '../../widgets/auth_shell.dart';
import '../../widgets/common.dart';

/// Create an account.
///
/// Name, email, password — nothing else. Anything about the person's bank or their guardians is
/// asked later, in context, where it means something.
class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;
  String? _sentTo;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
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
      final needsConfirmation = await AuthSession.signUp(
        email: _email.text,
        password: _password.text,
        fullName: _name.text,
      );
      if (!mounted) return;
      // When the project requires email confirmation there is no session yet, so the screen has
      // to say so rather than silently doing nothing.
      if (needsConfirmation) setState(() => _sentTo = _email.text.trim());
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);

    if (_sentTo != null) {
      return AuthShell(
        title: 'Check your email',
        subtitle: 'We sent a confirmation link to $_sentTo. Open it, then sign in.',
        onBack: () => Navigator.of(context).pop(),
        children: [
          const Notice(
            severity: Severity.neutral,
            child: Text(
              'Nothing yet? It can take a minute. Check your spam folder, and make sure the '
              'address above is right.',
            ),
          ),
          const VGap.xl(),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Back to sign in'),
          ),
        ],
      );
    }

    return AuthShell(
      title: 'Create your account',
      subtitle: 'It takes a minute. You’ll connect your bank next, so we can watch for scams.',
      onBack: () => Navigator.of(context).pop(),
      footer: AuthFooterLink(
        prompt: 'Already have an account?',
        action: 'Sign in',
        onTap: () => Navigator.of(context).pop(),
      ),
      children: [
        Form(
          key: _formKey,
          child: Column(
            children: [
              LabelledField(
                label: 'Full name',
                controller: _name,
                hint: 'Alex Smith',
                keyboardType: TextInputType.name,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                validator: (v) => (v == null || v.trim().length < 2)
                    ? 'Tell us your name'
                    : null,
              ),
              const VGap.lg(),
              LabelledField(
                label: 'Email address',
                controller: _email,
                hint: 'you@example.com',
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                validator: validateEmail,
              ),
              const VGap.lg(),
              LabelledField(
                label: 'Password',
                controller: _password,
                hint: 'At least 8 characters',
                obscure: _obscure,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _submit(),
                validator: (v) => (v == null || v.length < 8)
                    ? 'Use at least 8 characters'
                    : null,
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
              : const Icon(Icons.auto_awesome_rounded, size: 19),
          label: Text(_busy ? 'Creating…' : 'Create account'),
        ),
        const VGap.lg(),
        Text(
          'Sentra never sees your account numbers or moves your money. We look at the shape of a '
          'payment, not what’s in your account.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: p.faint),
        ),
      ],
    );
  }
}
