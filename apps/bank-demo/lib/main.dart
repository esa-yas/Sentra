import 'package:flutter/material.dart';
import 'package:sentra_bank_demo/utils/styles.dart';
import 'package:sentra_bank_demo/view_models/view_models.dart';
import 'package:sentra_bank_demo/widgets/bottom_nav.dart';
import 'package:provider/provider.dart';

import 'package:sentra_bank_demo/services/bank_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Load the local account (seeded with 30,000 USD on first launch) before the first frame.
  final store = await BankStore.load();
  runApp(MyApp(store: store));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key, required this.store});

  final BankStore store;

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ViewModel()),
        ChangeNotifierProvider<BankStore>.value(value: store),
      ],
      child: MaterialApp(
        title: 'Sentra Bank (demo)',
        debugShowCheckedModeBanner: false,
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
