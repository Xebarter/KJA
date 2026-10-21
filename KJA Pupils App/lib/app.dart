import 'package:flutter/material.dart';

import 'screens/gate_screens.dart';
import 'screens/shell.dart';
import 'state/portal_controller.dart';
import 'theme.dart';

class KjaPupilsApp extends StatelessWidget {
  const KjaPupilsApp({super.key, required this.controller});

  final PortalController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final snapshot = controller.snapshot;
        final home = controller.booting
            ? const SplashScreen()
            : snapshot != null
                ? PupilShell(controller: controller)
                : controller.configured
                    ? LoginScreen(controller: controller)
                    : SetupScreen(controller: controller);
        return MaterialApp(
          title: 'KJA Pupils',
          debugShowCheckedModeBanner: false,
          theme: buildKjaTheme(),
          home: home,
        );
      },
    );
  }
}
