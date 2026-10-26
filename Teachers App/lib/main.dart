import 'package:flutter/material.dart';

import 'app.dart';
import 'config.dart';
import 'state/teacher_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.loadDotenv();
  final controller = TeacherController();
  runApp(KjaTeachersApp(controller: controller));
  WidgetsBinding.instance.addPostFrameCallback((_) {
    controller.boot();
  });
}
