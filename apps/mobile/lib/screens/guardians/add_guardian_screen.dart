import 'package:flutter/material.dart';

import '../../app.dart';
import '../../theme/tokens.dart';
import '../../widgets/auth_shell.dart';
import '../../widgets/common.dart';

/// Naming a guardian.
///
/// The safeguards are shown as the feature they are, not as fine print: the other person accepts
/// on their own phone, both sides have a bank connected so we know they're real, and a new link
/// waits a few days before it can approve anything. That wait is deliberate — it's the window in
/// which a coerced or rushed addition can be undone.
class AddGuardianScreen extends StatefulWidget {
  const AddGuardianScreen({super.key});

  @override
  State<AddGuardianScreen> createState() => _AddGuardianScreenState();
}

class _AddGuardianScreenState extends State<AddGuardianScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  bool _sent = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    AppScope.of(context).addGuardian(_name.text.trim());
    setState(() => _sent = true);
  }

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final text = Theme.of(context).textTheme;

    if (_sent) {
      return Scaffold(
        appBar: AppBar(leading: const CloseButton()),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.lg, Gap.lg, Gap.xxl),
          children: [
            const IconTile(
                icon: Icons.mark_email_read_rounded, severity: Severity.safe, size: 64),
            const VGap.xl(),
            Text('Invitation sent', style: text.headlineSmall),
            const VGap.md(),
            Text(
              'We’ve asked ${_name.text.trim()} to accept. Nothing changes until they do — and '
              'then there’s a short wait before they can approve a payment.',
              style: text.bodyLarge,
            ),
            const VGap.xl(),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Add a guardian')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.sm, Gap.lg, Gap.xxl),
        children: [
          Text(
            'Someone you trust to check with you when a payment looks wrong — a son, a daughter, '
            'a close friend.',
            style: text.bodyLarge,
          ),
          const VGap.xl(),
          Form(
            key: _formKey,
            child: Column(
              children: [
                LabelledField(
                  label: 'Their name',
                  controller: _name,
                  hint: 'Sara',
                  textInputAction: TextInputAction.next,
                  validator: (v) =>
                      (v == null || v.trim().length < 2) ? 'Give them a name' : null,
                ),
                const VGap.lg(),
                LabelledField(
                  label: 'Their email',
                  controller: _email,
                  hint: 'sara@example.com',
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  validator: validateEmail,
                ),
              ],
            ),
          ),
          const VGap.xl(),
          const SectionLabel('How it works'),
          const VGap.md(),
          SentraCard(
            child: Column(
              children: [
                const _Step(
                  number: '1',
                  text: 'They accept on their own phone. Until then, nothing changes.',
                ),
                Divider(color: p.line, height: Gap.xl),
                const _Step(
                  number: '2',
                  text: 'You both have a bank connected — that’s how we know you’re both real.',
                ),
                Divider(color: p.line, height: Gap.xl),
                const _Step(
                  number: '3',
                  text: 'A short wait before the link goes live. Either of you can stop it, '
                      'and you can disconnect at any time.',
                ),
              ],
            ),
          ),
          const VGap.lg(),
          const Notice(
            severity: Severity.caution,
            title: 'They’re taking on a responsibility',
            child: Text(
              'Approving a held payment tells your bank it’s safe to send. If a payment they '
              'approve turns out to be a scam, the case can be investigated.',
            ),
          ),
          const VGap.xl(),
          FilledButton.icon(
            onPressed: _submit,
            icon: const Icon(Icons.send_rounded, size: 19),
            label: const Text('Send invitation'),
          ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.number, required this.text});
  final String number;
  final String text;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: p.accentSoft),
          child: Text(number,
              style: TextStyle(
                  color: p.accentInk, fontWeight: FontWeight.w800, fontSize: 13)),
        ),
        const SizedBox(width: Gap.md),
        Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium)),
      ],
    );
  }
}
