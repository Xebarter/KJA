import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'screens/gate_screens.dart';
import 'screens/shell.dart';
import 'state/teacher_controller.dart';
import 'theme.dart';

class KjaTeachersApp extends StatefulWidget {
  const KjaTeachersApp({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<KjaTeachersApp> createState() => _KjaTeachersAppState();
}

class _KjaTeachersAppState extends State<KjaTeachersApp> {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      title: 'KJA Teachers',
      debugShowCheckedModeBanner: false,
      theme: buildKjaTheme(),
      home: _TeacherGate(controller: widget.controller),
    );
  }
}

class _TeacherGate extends StatefulWidget {
  const _TeacherGate({required this.controller});

  final TeacherController controller;

  @override
  State<_TeacherGate> createState() => _TeacherGateState();
}

class _TeacherGateState extends State<_TeacherGate> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
  }

  @override
  void didUpdateWidget(covariant _TeacherGate oldWidget) {
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
    final phase = SchedulerBinding.instance.schedulerPhase;
    if (phase == SchedulerPhase.idle ||
        phase == SchedulerPhase.postFrameCallbacks) {
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
      return TeacherShell(controller: controller);
    }
    if (controller.configured) return LoginScreen(controller: controller);
    return SetupScreen(controller: controller);
  }
}
