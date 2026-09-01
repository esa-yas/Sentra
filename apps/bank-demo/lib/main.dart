import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:sentra_bank_demo/services/bank_store.dart';
import 'package:sentra_bank_demo/services/sentra_connection.dart';
import 'package:sentra_bank_demo/utils/styles.dart';
import 'package:sentra_bank_demo/view_models/view_models.dart';
import 'package:sentra_bank_demo/views/authorize_sentra.dart';
import 'package:sentra_bank_demo/widgets/bottom_nav.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Load local state before the first frame: the account (seeded with 30,000 USD on first
  // launch) and whether this bank is already linked to Sentra.
  final store = await BankStore.load();
  final connection = await SentraConnection.load();
  runApp(MyApp(store: store, connection: connection));
}

class MyApp extends StatefulWidget {
  const MyApp({super.key, required this.store, required this.connection});

  final BankStore store;
  final SentraConnection connection;

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  final _appLinks = AppLinks();
  StreamSubscription<Uri>? _linkSub;

  @override
  void initState() {
    super.initState();
    // Sentra opens the bank with sentrabank://authorize?…; both the cold-start link and any
    // that arrive while running route to the authorisation screen.
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handleLink(uri);
    });
    _linkSub = _appLinks.uriLinkStream.listen(_handleLink);
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  void _handleLink(Uri uri) {
    if (uri.scheme != 'sentrabank' || uri.host != 'authorize') return;
    _navigatorKey.currentState?.push(
      MaterialPageRoute<void>(builder: (_) => AuthorizeSentraScreen(request: uri)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ViewModel()),
        ChangeNotifierProvider<BankStore>.value(value: widget.store),
        ChangeNotifierProvider<SentraConnection>.value(value: widget.connection),
      ],
      child: MaterialApp(
        title: 'Sentra Bank (demo)',
        debugShowCheckedModeBanner: false,
        navigatorKey: _navigatorKey,
        theme: ThemeData(
          useMaterial3: false,
          fontFamily: 'DMSans',
          primaryColor: Styles.primaryColor,
          scaffoldBackgroundColor: Colors.white,
          colorScheme: ColorScheme.fromSeed(seedColor: Styles.primaryColor),
        ),
        home: const BottomNav(),
      ),
    );
  }
}
