import 'package:flutter/material.dart';

import 'app.dart';
import 'state/portal_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = PortalController();
  // Paint the splash immediately — dotenv / prefs / Supabase run inside boot.
  runApp(KjaParentsApp(controller: controller));
  WidgetsBinding.instance.addPostFrameCallback((_) {
    controller.boot();
  });
}
