import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'screens/gate_screens.dart';
import 'screens/shell.dart';
import 'state/portal_controller.dart';
import 'theme.dart';

class KjaParentsApp extends StatefulWidget {
  const KjaParentsApp({super.key, required this.controller});

  final PortalController controller;

  @override
  State<KjaParentsApp> createState() => _KjaParentsAppState();
}

class _KjaParentsAppState extends State<KjaParentsApp> {
  /// Stable across rebuilds so auth transitions never recreate an empty Navigator.
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    // Keep MaterialApp stable. Swapping [home] on every auth rebuild empties the
    // Navigator history and crashes with `_history.isNotEmpty`.
    return MaterialApp(
      navigatorKey: _navigatorKey,
      title: 'KJA Parents',
      debugShowCheckedModeBanner: false,
      theme: buildKjaTheme(),
      home: _PortalGate(controller: widget.controller),
    );
  }
}

class _PortalGate extends StatefulWidget {
  const _PortalGate({required this.controller});

  final PortalController controller;

  @override
  State<_PortalGate> createState() => _PortalGateState();
}

class _PortalGateState extends State<_PortalGate> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
  }

  @override
  void didUpdateWidget(covariant _PortalGate oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onControllerChanged);
      widget.controller.addListener(_onControllerChanged);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onControllerChanged);
    super.dispose();
  }

  void _onControllerChanged() {
    if (!mounted) return;
    // Rebuilding mid-Navigator build empties history (`_history.isNotEmpty`).
    final phase = SchedulerBinding.instance.schedulerPhase;
    if (phase == SchedulerPhase.idle || phase == SchedulerPhase.postFrameCallbacks) {
      setState(() {});
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    if (controller.booting) return const SplashScreen();
    final snap = controller.snapshot;
    if (snap != null) {
      if (snap.unavailable) return UnavailableScreen(controller: controller);
      return ParentShell(controller: controller);
    }
    if (controller.configured) return LoginScreen(controller: controller);
    return SetupScreen(controller: controller);
  }
}
