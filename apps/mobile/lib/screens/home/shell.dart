import 'package:flutter/material.dart';

import '../../app.dart';
import '../../theme/tokens.dart';
import '../activity/activity_screen.dart';
import '../guardians/guardians_screen.dart';
import '../profile/profile_screen.dart';
import 'home_screen.dart';

/// The signed-in app: four destinations, and a badge when a guardian decision is waiting.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
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
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        backgroundColor: SentraColors.card,
        indicatorColor: SentraColors.accentSoft,
        surfaceTintColor: Colors.transparent,
        height: 68,
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.shield_outlined),
            selectedIcon: Icon(Icons.shield_rounded, color: SentraColors.accentInk),
            label: 'Home',
          ),
          const NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long_rounded, color: SentraColors.accentInk),
            label: 'Activity',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: waiting,
              backgroundColor: SentraColors.stop,
              child: const Icon(Icons.people_outline_rounded),
            ),
            selectedIcon: Badge(
              isLabelVisible: waiting,
              backgroundColor: SentraColors.stop,
              child: const Icon(Icons.people_rounded, color: SentraColors.accentInk),
            ),
            label: 'Guardians',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded, color: SentraColors.accentInk),
            label: 'You',
          ),
        ],
      ),
    );
  }
}
