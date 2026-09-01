import 'package:flutter/material.dart';

import '../../services/auth_service.dart';
import '../../theme/tokens.dart';
import '../../widgets/auth_shell.dart';
import '../../widgets/common.dart';
import 'forgot_password_screen.dart';
import 'sign_up_screen.dart';

/// Sign in.
///
/// Deliberately generic on failure: the form says "that email or password is incorrect" rather
/// than which of the two was wrong, so it can't be used to discover whether an address has an
/// account here.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _remember = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
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
      await AuthSession.signIn(
        email: _email.text,
        password: _password.text,
        remember: _remember,
      );
      // The root listens to the session and swaps the screen itself.
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
      title: 'Welcome back',
      subtitle: 'Sign in to keep your payments protected, and to help the people who trust you.',
      footer: AuthFooterLink(
        prompt: 'Don’t have an account?',
        action: 'Sign up',
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => const SignUpScreen()),
        ),
      ),
      children: [
        Form(
          key: _formKey,
          child: Column(
            children: [
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
                hint: '••••••••',
                obscure: _obscure,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                onSubmitted: (_) => _submit(),
                validator: (v) =>
                    (v == null || v.isEmpty) ? 'Enter your password' : null,
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
        const VGap.md(),
        Row(
          children: [
            SizedBox(
              width: 26,
              height: 26,
              child: Checkbox(
                value: _remember,
                onChanged: (v) => setState(() => _remember = v ?? true),
              ),
            ),
            const SizedBox(width: Gap.sm),
            // Flexible so the label gives way before the row can overflow.
            Flexible(
              child: Text('Keep me signed in',
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall),
            ),
            const SizedBox(width: Gap.sm),
            TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const ForgotPasswordScreen()),
              ),
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Forgot password?'),
            ),
          ],
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
          label: Text(_busy ? 'Signing in…' : 'Sign in'),
        ),
        const VGap.xl(),
        const OrDivider(),
        const VGap.lg(),
        Row(
          children: [
            SocialButton(
              label: 'Google',
              icon: const _GoogleMark(),
              onTap: () => showComingSoon(context, 'Google sign-in'),
            ),
            const SizedBox(width: Gap.md),
            SocialButton(
              label: 'Apple',
              icon: Icon(Icons.apple, size: 22, color: p.ink),
              onTap: () => showComingSoon(context, 'Apple sign-in'),
            ),
          ],
        ),
      ],
    );
  }
}

/// Google's mark, drawn rather than shipped as an asset so it stays crisp in both themes.
class _GoogleMark extends StatelessWidget {
  const _GoogleMark();

  @override
  Widget build(BuildContext context) => Container(
        width: 20,
        height: 20,
        alignment: Alignment.center,
        decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF4285F4)),
        child: const Text('G',
            style: TextStyle(
                color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13, height: 1.2)),
      );
}
