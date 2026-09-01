import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A payee the customer can send to.
class Payee {
  const Payee({required this.name, required this.image, this.knownBefore = true, this.ageDays = 400});

  final String name;
  final String image;

  /// Whether the customer has dealt with them before. A brand-new payee is a classic scam shape.
  final bool knownBefore;
  final int ageDays;
}

/// One movement on the account.
class BankTxn {
  const BankTxn({
    required this.payee,
    required this.amount,
    required this.at,
    required this.held,
    this.caseReference,
  });

  final String payee;
  final double amount;
  final DateTime at;

  /// True when Sentra advised a hold and the money did not move.
  final bool held;
  final String? caseReference;

  Map<String, dynamic> toJson() => {
        'payee': payee,
        'amount': amount,
        'at': at.toIso8601String(),
        'held': held,
        'caseReference': caseReference,
      };

  factory BankTxn.fromJson(Map<String, dynamic> j) => BankTxn(
        payee: j['payee'] as String,
        amount: (j['amount'] as num).toDouble(),
        at: DateTime.parse(j['at'] as String),
        held: j['held'] as bool? ?? false,
        caseReference: j['caseReference'] as String?,
      );
}

/// The demo bank's account, persisted locally.
///
/// This is the whole "backend" of the bank app: a balance and a list of movements in
/// shared_preferences. Every new account is seeded with $30,000 so there is always money to
/// (attempt to) send. It is deliberately not a real ledger — it exists to make the Sentra flow
/// demonstrable on a phone with no server of its own.
class BankStore extends ChangeNotifier {
  BankStore._();

  static const double startingBalance = 30000;
  static const _balanceKey = 'bank.balance';
  static const _txnsKey = 'bank.transactions';

  double _balance = startingBalance;
  List<BankTxn> _transactions = [];
  bool _loaded = false;

  double get balance => _balance;
  List<BankTxn> get transactions => List.unmodifiable(_transactions);
  bool get loaded => _loaded;

  static Future<BankStore> load() async {
    final store = BankStore._();
    final prefs = await SharedPreferences.getInstance();
    if (prefs.containsKey(_balanceKey)) {
      store._balance = prefs.getDouble(_balanceKey) ?? startingBalance;
      final raw = prefs.getString(_txnsKey);
      if (raw != null) {
        store._transactions = (jsonDecode(raw) as List<dynamic>)
            .map((e) => BankTxn.fromJson(e as Map<String, dynamic>))
            .toList();
      }
    } else {
      // First launch: seed the starting balance so a new user always has funds to send.
      await prefs.setDouble(_balanceKey, startingBalance);
    }
    store._loaded = true;
    return store;
  }

  /// Debits the account for a sent payment and records it.
  Future<void> send({required String payee, required double amount}) async {
    _balance -= amount;
    _transactions.insert(
      0,
      BankTxn(payee: payee, amount: amount, at: DateTime.now(), held: false),
    );
    await _persist();
    notifyListeners();
  }

  /// Records a payment Sentra held — the money stays put, but the attempt is logged.
  Future<void> recordHeld({
    required String payee,
    required double amount,
    String? caseReference,
  }) async {
    _transactions.insert(
      0,
      BankTxn(
          payee: payee,
          amount: amount,
          at: DateTime.now(),
          held: true,
          caseReference: caseReference),
    );
    await _persist();
    notifyListeners();
  }

  /// Resets to a fresh $30,000 account, for running the demo again.
  Future<void> reset() async {
    _balance = startingBalance;
    _transactions = [];
    await _persist();
    notifyListeners();
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_balanceKey, _balance);
    await prefs.setString(
        _txnsKey, jsonEncode(_transactions.map((t) => t.toJson()).toList()));
  }
}
