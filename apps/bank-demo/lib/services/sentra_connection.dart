import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Whether this bank account is linked to Sentra.
///
/// From the bank's side, "connected to Sentra" is a single fact it stores after the customer
/// authorises the link. It's what the Settings screen reads to show "Protected by Sentra", and
/// what a real bank would gate the outbound scam-signal calls on.
class SentraConnection extends ChangeNotifier {
  SentraConnection._();

  static const _key = 'bank.sentra_connected';
  static const _sinceKey = 'bank.sentra_connected_since';

  bool _connected = false;
  DateTime? _since;

  bool get connected => _connected;
  DateTime? get since => _since;

  static Future<SentraConnection> load() async {
    final store = SentraConnection._();
    final prefs = await SharedPreferences.getInstance();
    store._connected = prefs.getBool(_key) ?? false;
    final iso = prefs.getString(_sinceKey);
    store._since = iso == null ? null : DateTime.tryParse(iso);
    return store;
  }

  Future<void> connect() async {
    _connected = true;
    _since = DateTime.now();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key, true);
    await prefs.setString(_sinceKey, _since!.toIso8601String());
    notifyListeners();
  }

  Future<void> disconnect() async {
    _connected = false;
    _since = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
    await prefs.remove(_sinceKey);
    notifyListeners();
  }
}
