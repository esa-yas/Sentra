import 'package:flutter/material.dart';

import '../../app.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// Inviting a guardian.
///
/// The safeguards are the feature, not friction to be minimised. Both people must accept, both
/// must have a bank connected — which is how we know they are real customers, not an attacker
/// who installed the app — and a new link waits two to three days before it can approve anything.
/// That delay is deliberate: it removes the value of a rushed, coerced setup and gives the
/// customer time to think, while either side can disconnect instantly.
class AddGuardianScreen extends StatefulWidget {
  const AddGuardianScreen({super.key});

  @override
  State<AddGuardianScreen> createState() => _AddGuardianScreenState();
}

class _AddGuardianScreenState extends State<AddGuardianScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _sending = true);
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    AppScope.of(context).addGuardian(_name.text.trim());
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Invitation sent to ${_name.text.trim()}.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Add a guardian')),
      body: SafeArea(
        top: false,
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.xxl),
            children: [
              Text(
                'Someone you trust to confirm a payment is really you, when we’ve held one.',
                style: text.bodyLarge,
              ),
              const VGap(Gap.xl),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Their name',
                  hintText: 'Sara (daughter)',
                  prefixIcon: Icon(Icons.person_outline_rounded),
                ),
                validator: (v) =>
                    (v == null || v.trim().length < 2) ? 'Please enter their name' : null,
              ),
              const VGap.lg(),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                decoration: const InputDecoration(
                  labelText: 'Their email',
                  prefixIcon: Icon(Icons.mail_outline_rounded),
                ),
                validator: (v) =>
                    (v == null || !v.contains('@')) ? 'That email doesn’t look right' : null,
              ),
              const VGap(Gap.xl),
              const SectionLabel('How this works'),
              const VGap.md(),
              const SentraCard(
                child: Column(
                  children: [
                    _Step(
                      number: '1',
                      title: 'They accept, on their own phone',
                      body: 'You can’t accept for them. Nothing happens until they do.',
                    ),
                    _Step(
                      number: '2',
                      title: 'You both have a bank connected',
                      body: 'That’s how we know you’re both real customers.',
                    ),
                    _Step(
                      number: '3',
                      title: 'A 2–3 day wait before it turns on',
                      body: 'Time to think. If anything feels wrong, either of you can stop it.',
                      last: true,
                    ),
                  ],
                ),
              ),
              const VGap.lg(),
              const Notice(
                severity: Severity.neutral,
                child: Text(
                  'You can disconnect a guardian at any time, instantly — and they’ll never see '
                  'your balance or your other payments.',
                ),
              ),
              const VGap(Gap.xl),
              FilledButton(
                onPressed: _sending ? null : _send,
                child: _sending
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                      )
                    : const Text('Send invitation'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.number,
    required this.title,
    required this.body,
    this.last = false,
  });

  final String number;
  final String title;
  final String body;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : Gap.lg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: const BoxDecoration(
              color: SentraColors.accentSoft,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              number,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 13,
                color: SentraColors.accentInk,
              ),
            ),
          ),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: text.titleMedium?.copyWith(fontSize: 15)),
                const SizedBox(height: 2),
                Text(body, style: text.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
