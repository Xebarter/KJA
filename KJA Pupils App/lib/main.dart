import 'package:flutter/material.dart';

import 'app.dart';
import 'state/portal_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = PortalController();
  // Paint the native → Flutter splash immediately. Dotenv / prefs / Supabase run in boot.
  runApp(KjaPupilsApp(controller: controller));
  WidgetsBinding.instance.addPostFrameCallback((_) {
    controller.boot();
  });
}
