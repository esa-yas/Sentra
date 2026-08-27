import 'package:flutter/material.dart';

import '../../app.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import '../home/home_screen.dart';

/// The Protection Log.
///
/// The reason the app is worth keeping installed: protection that works is invisible, and this is
/// where it becomes something you can see, trust, and show someone.
class ActivityScreen extends StatelessWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final text = Theme.of(context).textTheme;
    final entries = state.activity;

    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: SafeArea(
        top: false,
        child: entries.isEmpty
            ? const Center(
                child: EmptyState(
                  icon: Icons.receipt_long_rounded,
                  title: 'No activity yet',
                  body: 'Every payment we check will be recorded here, with the reasons behind it.',
                ),
              )
            : ListView(
                padding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.xxl),
                children: [
                  Text(
                    'Everything Sentra has checked for you, and why.',
                    style: text.bodyMedium,
                  ),
                  const VGap.lg(),
                  SentraCard(
                    padding: const EdgeInsets.symmetric(horizontal: Gap.lg),
                    child: Column(
                      children: [
                        for (var i = 0; i < entries.length; i++)
                          ActivityRow(entry: entries[i], showDivider: i > 0),
                      ],
                    ),
                  ),
                  const VGap.lg(),
                  const Notice(
                    severity: Severity.neutral,
                    title: 'Something look wrong?',
                    child: Text(
                      'Quote the reference next to a held payment when you speak to your bank — '
                      'they can pick it up from there.',
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
