import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import 'brand.dart';

/// The frame every auth screen shares: texture, the lit mark, a headline, and the form.
///
/// Holding the layout in one place is what keeps sign-in, sign-up, reset and verify feeling like
/// one product rather than four screens that happen to be adjacent.
class AuthShell extends StatelessWidget {
  const AuthShell({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
    this.onBack,
    this.footer,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;
  final VoidCallback? onBack;

  /// Pinned to the bottom, out of the scroll — the "already have an account?" line.
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: Stack(
        children: [
          // A wash of accent behind the mark, so the glow has something to sit in.
          Positioned(
            top: -140,
            left: -60,
            right: -60,
            height: 460,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    colors: [
                      p.glow.withValues(alpha: p.isDark ? 0.16 : 0.10),
                      p.ground.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const Positioned(top: 0, left: 0, child: DotGrid()),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.md, Gap.xl, 0),
                  child: Row(
                    children: [
                      if (onBack != null)
                        CircleChip(icon: Icons.arrow_back_rounded, onTap: onBack)
                      else
                        const SizedBox(width: 46),
                      const Spacer(),
                      const CircleChip(icon: Icons.shield_rounded, accented: true),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(Gap.xl, 0, Gap.xl, Gap.xl),
                    children: [
                      const Center(child: BrandOrb()),
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: text.displaySmall,
                      ),
                      const VGap.md(),
                      Text(
                        subtitle,
                        textAlign: TextAlign.center,
                        style: text.bodyMedium?.copyWith(height: 1.45),
                      ),
                      const VGap.xxl(),
                      ...children,
                    ],
                  ),
                ),
                if (footer != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(Gap.xl, 0, Gap.xl, Gap.lg),
                    child: footer,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A labelled field. The asterisk marks required, matching the reference design.
class LabelledField extends StatelessWidget {
  const LabelledField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.required = true,
    this.obscure = false,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.validator,
    this.suffix,
    this.enabled = true,
    this.onSubmitted,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final bool required;
  final bool obscure;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final String? Function(String?)? validator;
  final Widget? suffix;
  final bool enabled;
  final void Function(String)? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: label,
            style: text.labelMedium,
            children: required
                ? [TextSpan(text: '*', style: TextStyle(color: p.accent))]
                : const [],
          ),
        ),
        const VGap.sm(),
        TextFormField(
          controller: controller,
          obscureText: obscure,
          enabled: enabled,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          autofillHints: autofillHints,
          validator: validator,
          onFieldSubmitted: onSubmitted,
          style: TextStyle(fontSize: 16, color: p.ink),
          decoration: InputDecoration(hintText: hint, suffixIcon: suffix),
        ),
      ],
    );
  }
}

/// "Or continue with" — a rule with a label through it.
class OrDivider extends StatelessWidget {
  const OrDivider({super.key, this.label = 'Or continue with'});
  final String label;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    return Row(
      children: [
        Expanded(child: Divider(color: p.line)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Gap.md),
          child: Text(label, style: Theme.of(context).textTheme.bodySmall),
        ),
        Expanded(child: Divider(color: p.line)),
      ],
    );
  }
}

/// A social sign-in button. Marked unavailable rather than hidden, so the option is discoverable
/// once it is wired — and honest until then.
class SocialButton extends StatelessWidget {
  const SocialButton({super.key, required this.label, required this.icon, this.onTap});

  final String label;
  final Widget icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    return Expanded(
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(54),
          side: BorderSide(color: p.line, width: 1.4),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            icon,
            const SizedBox(width: Gap.sm),
            Text(label, style: TextStyle(color: p.ink, fontWeight: FontWeight.w600, fontSize: 15)),
          ],
        ),
      ),
    );
  }
}

/// The "Don't have an account? Sign up" line.
class AuthFooterLink extends StatelessWidget {
  const AuthFooterLink({super.key, required this.prompt, required this.action, required this.onTap});

  final String prompt;
  final String action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Flexible(
          child: Text(prompt,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall),
        ),
        TextButton(
          onPressed: onTap,
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: Gap.sm, vertical: 4),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Text(action, style: TextStyle(color: p.accentInk, fontWeight: FontWeight.w800)),
        ),
      ],
    );
  }
}
