import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../theme/tokens.dart';
import '../../widgets/brand.dart';

/// Shown once, right after the first sign-in.
///
/// Three cards, no more: what we do at the moment money moves, who can help, and what we never
/// see. A person who has just been told an app will watch their payments deserves the privacy
/// answer immediately — not buried in a settings screen they'll never open.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.onDone});

  final VoidCallback onDone;

  static const _seenKey = 'sentra.onboarding_seen';

  /// Whether this person has already been through it.
  static Future<bool> hasSeen() async =>
      (await SharedPreferences.getInstance()).getBool(_seenKey) ?? false;

  static Future<void> markSeen() async =>
      (await SharedPreferences.getInstance()).setBool(_seenKey, true);

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _Slide {
  const _Slide(this.icon, this.title, this.body);
  final IconData icon;
  final String title;
  final String body;
}

const _slides = <_Slide>[
  _Slide(
    Icons.bolt_rounded,
    'We watch the moment\nmoney moves',
    'When a payment looks like a scam — a new payee, an unusual amount, a suspicious call '
        'happening right now — we stop and tell you why, before it leaves your account.',
  ),
  _Slide(
    Icons.people_alt_rounded,
    'Someone you trust\ncan help',
    'Name a guardian — a son, a daughter, a friend. If a payment is held, they can check with '
        'you and clear it in seconds, instead of you waiting on a call centre.',
  ),
  _Slide(
    Icons.lock_rounded,
    'We never see\nyour money',
    'No account numbers, no balances, no passwords. Sentra looks at the shape of a payment, not '
        'what’s in your account — and your bank always makes the final decision.',
  ),
];

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _isLast => _index == _slides.length - 1;

  Future<void> _finish() async {
    await OnboardingScreen.markSeen();
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: Stack(
        children: [
          Positioned(
            top: -160,
            left: -80,
            right: -80,
            height: 480,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    colors: [
                      p.glow.withValues(alpha: p.isDark ? 0.15 : 0.09),
                      p.ground.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const Positioned(top: 0, right: 0, child: DotGrid(alignment: Alignment.topRight)),
          SafeArea(
            child: Column(
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: Padding(
                    padding: const EdgeInsets.only(right: Gap.lg, top: Gap.sm),
                    child: TextButton(
                      onPressed: _finish,
                      child: Text('Skip', style: TextStyle(color: p.muted)),
                    ),
                  ),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: _controller,
                    onPageChanged: (i) => setState(() => _index = i),
                    itemCount: _slides.length,
                    itemBuilder: (context, i) {
                      final slide = _slides[i];
                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: Gap.xl),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 116,
                              height: 116,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: p.accentSoft,
                                border: Border.all(color: p.accent.withValues(alpha: 0.35)),
                                boxShadow: [
                                  BoxShadow(
                                    color: p.glow.withValues(alpha: p.isDark ? 0.28 : 0.20),
                                    blurRadius: 48,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: Icon(slide.icon, size: 48, color: p.accent),
                            ),
                            const VGap.xxl(),
                            Text(slide.title,
                                textAlign: TextAlign.center, style: text.headlineMedium),
                            const VGap.lg(),
                            Text(slide.body,
                                textAlign: TextAlign.center,
                                style: text.bodyLarge?.copyWith(color: p.muted)),
                          ],
                        ),
                      );
                    },
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(_slides.length, (i) {
                    final active = i == _index;
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      width: active ? 26 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: active ? p.accent : p.lineStrong,
                        borderRadius: BorderRadius.circular(Radii.pill),
                      ),
                    );
                  }),
                ),
                Padding(
                  padding: const EdgeInsets.all(Gap.xl),
                  child: FilledButton(
                    onPressed: () {
                      if (_isLast) {
                        _finish();
                      } else {
                        _controller.nextPage(
                          duration: const Duration(milliseconds: 280),
                          curve: Curves.easeOutCubic,
                        );
                      }
                    },
                    child: Text(_isLast ? 'Connect my bank' : 'Next'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
