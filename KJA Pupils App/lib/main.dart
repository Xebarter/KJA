import 'package:flutter/material.dart';

import 'app.dart';
import 'config.dart';
import 'state/portal_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.loadDotenv();
  final controller = PortalController();
  runApp(KjaPupilsApp(controller: controller));
  await controller.boot();
}
