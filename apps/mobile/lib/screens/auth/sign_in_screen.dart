import 'package:flutter/material.dart';

import '../../app.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// Sign in / create an account.
///
/// One screen with a toggle rather than two: the difference between signing in and signing up is
/// one field, and a person who taps the wrong one should not have to navigate anywhere.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  bool _creating = true;
  bool _busy = false;
  bool _obscure = true;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    await AppScope.of(context).signIn(email: _email.text.trim(), name: _name.text.trim());
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.xl, Gap.xl, Gap.xxl),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const BrandMark(size: 34),
                const VGap(Gap.xxl),
                Text(
                  _creating ? 'Keep your money safe' : 'Welcome back',
                  style: text.displaySmall,
                ),
                const VGap.sm(),
                Text(
                  _creating
                      ? 'Sentra checks your payments for signs of a scam, and lets someone you '
                          'trust help when something looks wrong.'
                      : 'Sign in to see your protection and any approvals waiting for you.',
                  style: text.bodyLarge,
                ),
                const VGap(Gap.xxl),
                if (_creating) ...[
                  TextFormField(
                    controller: _name,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Your name',
                      prefixIcon: Icon(Icons.person_outline_rounded),
                    ),
                    validator: (v) =>
                        (v == null || v.trim().length < 2) ? 'Please enter your name' : null,
                  ),
                  const VGap.lg(),
                ],
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    prefixIcon: Icon(Icons.mail_outline_rounded),
                  ),
                  validator: (v) => (v == null || !v.contains('@'))
                      ? 'That email doesn’t look right'
                      : null,
                ),
                const VGap.lg(),
                TextFormField(
                  controller: _password,
                  obscureText: _obscure,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                    suffixIcon: IconButton(
                      onPressed: () => setState(() => _obscure = !_obscure),
                      icon: Icon(_obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined),
                      tooltip: _obscure ? 'Show password' : 'Hide password',
                    ),
                  ),
                  validator: (v) => (v == null || v.length < 8)
                      ? 'Use at least 8 characters'
                      : null,
                ),
                const VGap(Gap.xl),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                        )
                      : Text(_creating ? 'Create account' : 'Sign in'),
                ),
                const VGap.lg(),
                TextButton(
                  onPressed: () => setState(() => _creating = !_creating),
                  child: Text(_creating
                      ? 'I already have an account'
                      : 'Create an account instead'),
                ),
                const VGap.lg(),
                const Notice(
                  severity: Severity.neutral,
                  child: Text(
                    'Sentra never sees your account numbers or your money. We look at the shape of '
                    'a payment — not what is in your account.',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
