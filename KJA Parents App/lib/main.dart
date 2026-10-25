import 'package:flutter/material.dart';

import 'app.dart';
import 'config.dart';
import 'state/portal_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.loadDotenv();
  final controller = PortalController();
  runApp(KjaParentsApp(controller: controller));
  // Boot after the first frame so auth notifyListeners cannot race Navigator mount.
  WidgetsBinding.instance.addPostFrameCallback((_) {
    controller.boot();
  });
}
