import 'package:flutter/material.dart';

import 'app.dart';
import 'services/auth_service.dart';
import 'services/bootstrap.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // One pass over storage and Supabase, so the first frame is already the right screen rather
  // than a spinner that resolves into one.
  final boot = await Bootstrap.load();
  AuthSession.signedIn.value = boot.signedIn;
  runApp(SentraApp(boot: boot));
}
