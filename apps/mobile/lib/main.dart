import 'package:flutter/material.dart';

import 'app.dart';
import 'services/auth_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Supabase has to be ready before the first frame decides whether anyone is signed in.
  await AuthService.initialise();
  await AuthSession.restore();
  runApp(const SentraApp());
}
