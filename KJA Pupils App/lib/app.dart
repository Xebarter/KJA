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
    // Keep MaterialApp stable. Swapping [home] on every auth rebuild empties the
    // Navigator history and crashes with `_history.isNotEmpty`.
    return MaterialApp(
      title: 'KJA Pupils',
      debugShowCheckedModeBanner: false,
      theme: buildKjaTheme(),
      home: _PortalGate(controller: controller),
    );
  }
}

class _PortalGate extends StatelessWidget {
  const _PortalGate({required this.controller});

  final PortalController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        if (controller.booting) return const SplashScreen();
        if (controller.snapshot != null) return PupilShell(controller: controller);
        if (controller.configured) return LoginScreen(controller: controller);
        return SetupScreen(controller: controller);
      },
    );
  }
}
