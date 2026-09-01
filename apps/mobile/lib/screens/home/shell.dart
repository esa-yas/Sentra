import 'package:flutter/material.dart';

import '../../app.dart';
import '../../theme/tokens.dart';
import '../activity/activity_screen.dart';
import '../guardians/guardians_screen.dart';
import '../profile/profile_screen.dart';
import 'home_screen.dart';

/// The signed-in frame: four destinations, with the guardian tab badged when someone is waiting.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final p = SentraPalette.of(context);
    final state = AppScope.of(context);
    final waiting = state.pendingRequest != null;

    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [
          HomeScreen(),
          ActivityScreen(),
          GuardiansScreen(),
          ProfileScreen(),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: p.surface,
          border: Border(top: BorderSide(color: p.line)),
        ),
        child: SafeArea(
          top: false,
          child: NavigationBarTheme(
            data: NavigationBarThemeData(
              backgroundColor: Colors.transparent,
              indicatorColor: p.accentSoft,
              surfaceTintColor: Colors.transparent,
              labelTextStyle: WidgetStatePropertyAll(
                TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: p.muted),
              ),
            ),
            child: NavigationBar(
              selectedIndex: _index,
              height: 66,
              onDestinationSelected: (i) => setState(() => _index = i),
              destinations: [
                _dest(p, Icons.shield_outlined, Icons.shield_rounded, 'Home', false),
                _dest(p, Icons.receipt_long_outlined, Icons.receipt_long_rounded, 'Activity', false),
                _dest(p, Icons.people_alt_outlined, Icons.people_alt_rounded, 'Guardians', waiting),
                _dest(p, Icons.person_outline_rounded, Icons.person_rounded, 'You', false),
              ],
            ),
          ),
        ),
      ),
    );
  }

  NavigationDestination _dest(
    SentraPalette p,
    IconData icon,
    IconData selected,
    String label,
    bool badge,
  ) {
    Widget wrap(IconData i, Color c) => badge
        ? Badge(backgroundColor: p.stop, smallSize: 8, child: Icon(i, color: c))
        : Icon(i, color: c);
    return NavigationDestination(
      icon: wrap(icon, p.muted),
      selectedIcon: wrap(selected, p.accentInk),
      label: label,
    );
  }
}
