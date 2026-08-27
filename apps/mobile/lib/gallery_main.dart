// A development entry point for reviewing every screen without walking the flow.
//
// Run with: flutter run -t lib/gallery_main.dart -d chrome
// Not part of the app: `main.dart` is the real entry point.
import 'package:flutter/material.dart';

import 'app.dart';
import 'screens/activity/activity_screen.dart';
import 'screens/auth/sign_in_screen.dart';
import 'screens/guardians/add_guardian_screen.dart';
import 'screens/guardians/approval_screen.dart';
import 'screens/guardians/guardians_screen.dart';
import 'screens/home/shell.dart';
import 'screens/intervention/intervention_screen.dart';
import 'screens/onboarding/connect_bank_screen.dart';
import 'screens/profile/profile_screen.dart';
import 'services/app_state.dart';
import 'services/demo_data.dart';
import 'theme/theme.dart';

void main() {
  final state = AppState()
    ..signIn(email: 'ada@example.com', name: 'Ada Lovelace')
    ..connectBank();
  runApp(GalleryApp(state: state));
}

class GalleryApp extends StatelessWidget {
  const GalleryApp({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final screens = <String, Widget>{
      'signin': const SignInScreen(),
      'bank': const ConnectBankScreen(),
      'home': const HomeShell(),
      'activity': const ActivityScreen(),
      'guardians': const GuardiansScreen(),
      'add': const AddGuardianScreen(),
      'approval': ApprovalScreen(request: DemoData.pendingRequest()),
      'intervention': InterventionScreen(session: DemoData.scamSession()),
      'profile': const ProfileScreen(),
    };
    return AppScope(
      state: state,
      child: MaterialApp(
        title: 'Sentra gallery',
        debugShowCheckedModeBanner: false,
        theme: buildSentraTheme(),
        initialRoute: '/home',
        routes: {
          for (final entry in screens.entries) '/${entry.key}': (_) => entry.value,
        },
      ),
    );
  }
}
