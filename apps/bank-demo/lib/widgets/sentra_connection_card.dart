import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:sentra_bank_demo/repo/repository.dart';
import 'package:sentra_bank_demo/services/sentra_connection.dart';

/// The "Protected by Sentra" panel on the bank's Settings screen.
///
/// It's the bank telling the customer, in its own app, that Sentra is watching their payments —
/// the reassurance side of the connection, and where they can disconnect. When not yet linked it
/// says so plainly rather than hiding the option.
class SentraConnectionCard extends StatelessWidget {
  const SentraConnectionCard({super.key});

  static const _purple = Color(0xFF6D4EF0);

  @override
  Widget build(BuildContext context) {
    final connection = context.watch<SentraConnection>();
    final connected = connection.connected;
    final title = Repository.titleColor(context);
    final sub = Repository.subTextColor(context);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: connected
              ? [_purple.withValues(alpha: 0.16), _purple.withValues(alpha: 0.04)]
              : [Repository.accentColor2(context), Repository.accentColor2(context)],
        ),
        border: Border.all(color: connected ? _purple.withValues(alpha: 0.4) : Repository.accentColor(context)),
      ),
      child: Row(
        children: [
          Container(
            width: 46, height: 46,
            decoration: BoxDecoration(color: _purple, borderRadius: BorderRadius.circular(13)),
            child: const Icon(Icons.shield_rounded, color: Colors.white, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(connected ? 'Protected by Sentra' : 'Connect Sentra',
                    style: TextStyle(color: title, fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 3),
                Text(
                  connected
                      ? 'Your payments are checked for scams as you make them.'
                      : 'Not connected yet. Open the Sentra app to link your account.',
                  style: TextStyle(color: sub, fontSize: 13, height: 1.35),
                ),
              ],
            ),
          ),
          if (connected)
            TextButton(
              onPressed: () => _confirmDisconnect(context, connection),
              child: const Text('Disconnect', style: TextStyle(color: _purple, fontWeight: FontWeight.w700)),
            )
          else
            Icon(Icons.chevron_right_rounded, color: sub),
        ],
      ),
    );
  }

  void _confirmDisconnect(BuildContext context, SentraConnection connection) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Disconnect Sentra?'),
        content: const Text('Your payments will no longer be checked for scams.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('Keep')),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              connection.disconnect();
            },
            child: const Text('Disconnect', style: TextStyle(color: Color(0xFFC8322A))),
          ),
        ],
      ),
    );
  }
}
