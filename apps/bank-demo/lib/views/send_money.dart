import 'package:flutter/material.dart';
import 'package:gap/gap.dart';
import 'package:provider/provider.dart';
import 'package:sentra_bank_demo/repo/repository.dart';
import 'package:sentra_bank_demo/services/bank_store.dart';
import 'package:sentra_bank_demo/services/sentra_config.dart';
import 'package:sentra_bank_demo/widgets/buttons.dart';
import 'package:sentra_bank_demo/widgets/my_app_bar.dart';
import 'package:sentra_sdk/sentra_sdk.dart';

/// The transfer screen — where the money actually moves, and where Sentra sits.
///
/// This is the demo's whole point: the customer picks who they're paying and how much, taps Send,
/// and — before a cent moves — [SentraGuard.protectPayment] runs. If Sentra flags it, its screen
/// appears over this one; only if the customer is allowed through does the balance change.
///
/// Two demo switches make the scam path reproducible without a real scammer: paying a brand-new
/// payee, and being "on a call with an unknown number". Both are exactly the signals a live scam
/// carries.
class SendMoney extends StatefulWidget {
  const SendMoney({super.key});

  @override
  State<SendMoney> createState() => _SendMoneyState();
}

/// The payees the demo offers. "J. Smith" is deliberately a brand-new payee — the shape of a scam.
const _payees = [
  _Payee('Mum', known: true),
  _Payee('Landlord', known: true),
  _Payee('J. Smith', known: false),
];

class _Payee {
  const _Payee(this.name, {required this.known});
  final String name;
  final bool known;
}

class _SendMoneyState extends State<SendMoney> {
  final _amount = TextEditingController(text: '3000');
  _Payee _payee = _payees.first;
  bool _onSuspiciousCall = false;
  bool _busy = false;

  late final SentraClient _client = SentraClient(
    apiBaseUrl: SentraConfig.apiBaseUrl,
    secretKey: SentraConfig.secretKey,
  );

  @override
  void dispose() {
    _amount.dispose();
    _client.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final amount = double.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) {
      _toast('Enter an amount to send.');
      return;
    }
    final store = context.read<BankStore>();
    if (amount > store.balance) {
      _toast('That’s more than your balance.');
      return;
    }

    setState(() => _busy = true);
    try {
      // The one call. Everything the customer might see is decided by Sentra.
      final result = await SentraGuard(client: _client).protectPayment(
        context,
        subjectRef: SentraConfig.subjectRef,
        amount: amount,
        currency: 'USD',
        payeeLabel: _payee.name,
        firstTimePayee: !_payee.known,
        payeeAgeDays: _payee.known ? 400 : 0,
        onPhoneCall: _onSuspiciousCall,
        callerUnknown: _onSuspiciousCall,
      );
      if (!mounted) return;

      if (result.allowed) {
        await store.send(payee: _payee.name, amount: amount);
        if (mounted) _finish('Sent \$${amount.toStringAsFixed(2)} to ${_payee.name}.');
      } else {
        await store.recordHeld(
            payee: _payee.name, amount: amount, caseReference: result.caseReference);
        if (mounted) {
          _finish('Payment held. Your money stayed in your account.'
              '${result.caseReference.isNotEmpty ? ' Ref ${result.caseReference}.' : ''}');
        }
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _finish(String message) {
    Navigator.of(context).pop();
    _toast(message);
  }

  void _toast(String message) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

  @override
  Widget build(BuildContext context) {
    final store = context.watch<BankStore>();
    final accent = Repository.selectedItemColor(context);
    final title = Repository.titleColor(context);
    final sub = Repository.subTextColor(context);

    return Scaffold(
      backgroundColor: Repository.bgColor(context),
      appBar: myAppBar(title: 'Send Money', implyLeading: true, context: context),
      bottomSheet: Container(
        color: Repository.bgColor(context),
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 30),
        child: elevatedButton(
          color: accent,
          context: context,
          callback: _busy ? () {} : _send,
          text: _busy ? 'Checking…' : 'Send Money',
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(15, 15, 15, 120),
        children: [
          // Balance, from the real local account.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              color: Repository.headerColor2(context),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('AVAILABLE BALANCE',
                    style: TextStyle(fontSize: 11, letterSpacing: 0.6, color: Colors.white.withValues(alpha: 0.5))),
                const Gap(6),
                Text('\$${store.balance.toStringAsFixed(2)}',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 30, color: Colors.white)),
                const Gap(4),
                Text('Card 3829 4820 4629 5025',
                    style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.6))),
              ],
            ),
          ),
          const Gap(24),

          Text('Who are you paying?', style: TextStyle(color: sub, fontWeight: FontWeight.w600)),
          const Gap(10),
          Wrap(
            spacing: 10,
            children: _payees.map((p) {
              final selected = p == _payee;
              return ChoiceChip(
                label: Text(p.known ? p.name : '${p.name} (new)'),
                selected: selected,
                onSelected: (_) => setState(() => _payee = p),
                selectedColor: accent,
                labelStyle: TextStyle(
                    color: selected ? Colors.white : title, fontWeight: FontWeight.w600),
                backgroundColor: Repository.accentColor2(context),
                side: BorderSide(color: Repository.accentColor(context)),
              );
            }).toList(),
          ),
          const Gap(24),

          Text('Amount', style: TextStyle(color: sub, fontWeight: FontWeight.w600)),
          const Gap(10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              color: Repository.accentColor2(context),
              border: Border.all(color: Repository.accentColor(context)),
            ),
            child: Row(
              children: [
                Text('\$', style: TextStyle(color: title, fontSize: 28, fontWeight: FontWeight.bold)),
                const Gap(6),
                Expanded(
                  child: TextField(
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: TextStyle(color: title, fontSize: 28, fontWeight: FontWeight.bold),
                    decoration: const InputDecoration(border: InputBorder.none, hintText: '0'),
                  ),
                ),
                Text('USD', style: TextStyle(color: sub, fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          const Gap(20),

          // The demo switch that reproduces the live-scam signal.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              color: Repository.accentColor2(context),
              border: Border.all(color: Repository.accentColor(context)),
            ),
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              activeThumbColor: accent,
              value: _onSuspiciousCall,
              onChanged: (v) => setState(() => _onSuspiciousCall = v),
              title: Text('I’m on a call with an unknown number',
                  style: TextStyle(color: title, fontWeight: FontWeight.w600, fontSize: 14.5)),
              subtitle: Text('Demo: simulates the live-call signal a scam carries',
                  style: TextStyle(color: sub, fontSize: 12.5)),
            ),
          ),
        ],
      ),
    );
  }
}
