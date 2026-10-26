import 'package:flutter/material.dart';

import '../models.dart';
import '../navigation.dart';
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'assessments_page.dart';
import 'markbook_page.dart';
import 'attendance_page.dart';
import 'calendar_page.dart';
import 'chat_page.dart';
import 'home_page.dart';
import 'notices_page.dart';
import 'points_page.dart';
import 'performance_page.dart';
import 'profile_page.dart';
import 'resources_page.dart';

class TeacherShell extends StatefulWidget {
  const TeacherShell({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<TeacherShell> createState() => _TeacherShellState();
}

class _TeacherShellState extends State<TeacherShell> {
  var _destination = AppDestination.home;

  TeacherSnapshot get portal => widget.controller.snapshot!;

  @override
  void initState() {
    super.initState();
    if (widget.controller.snapshot?.mustResetPassword == true) {
      _destination = AppDestination.profile;
    }
    widget.controller.addListener(_onController);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onController);
    super.dispose();
  }

  void _onController() {
    if (!mounted) return;
    final locked = widget.controller.snapshot?.mustResetPassword == true;
    setState(() {
      if (locked) _destination = AppDestination.profile;
    });
  }

  void _open(AppDestination destination) {
    final locked = portal.mustResetPassword;
    if (locked && destination != AppDestination.profile) return;
    setState(() => _destination = destination);
  }

  void _openPaper(Paper paper) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            MarkbookPage(controller: widget.controller, paperId: paper.id),
      ),
    );
  }

  Future<void> _signOut() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You can sign in again with your teacher email.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Stay'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: KjaColors.rose),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (leave == true) await widget.controller.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;
    final locked = portal.mustResetPassword;
    final menu = AppDestination.menuFor(
      classTeacher: portal.classTeacher,
      canAward: portal.awardClasses.isNotEmpty,
      locked: locked,
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        automaticallyImplyLeading: false,
        centerTitle: true,
        titleSpacing: 0,
        toolbarHeight: 64,
        shape: const Border(bottom: BorderSide(color: KjaColors.line)),
        title: SizedBox(
          width: double.infinity,
          height: 64,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        border: Border.all(color: KjaColors.line),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: const Padding(
                        padding: EdgeInsets.all(5),
                        child: SchoolMark(size: 28),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'KJA Teachers',
                          style: TextStyle(
                            color: KjaColors.navy,
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                            height: 1.1,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _destination.menuLabel,
                          style: const TextStyle(
                            color: KjaColors.soft,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            height: 1.1,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(left: 10),
                  child: Builder(
                    builder: (context) => HeaderIconButton(
                      icon: Icons.menu_rounded,
                      tooltip: 'Open menu',
                      tone: Tone.sky,
                      onPressed: () => Scaffold.of(context).openDrawer(),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        bottom: widget.controller.refreshing
            ? const PreferredSize(
                preferredSize: Size.fromHeight(2),
                child: LinearProgressIndicator(
                  minHeight: 2,
                  color: KjaColors.sky,
                  backgroundColor: Color(0xFFE8EDF2),
                ),
              )
            : null,
      ),
      drawer: TeacherMenu(
        displayName: portal.displayName,
        subtitle: locked ? 'Finish profile' : portal.roleLabel,
        current: _destination,
        items: menu,
        onSelect: _open,
        onSignOut: () {
          final scaffold = Scaffold.maybeOf(context);
          if (scaffold?.isDrawerOpen ?? false) scaffold!.closeDrawer();
          _signOut();
        },
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              KjaColors.pageTop,
              KjaColors.pageMid,
              KjaColors.pageBottom,
            ],
          ),
        ),
        child: Column(
          children: [
            if ((widget.controller.banner ?? '').isNotEmpty)
              Builder(
                builder: (context) {
                  final text = widget.controller.banner!;
                  final draft = text.startsWith('Marks are saved as a draft');
                  final offline = text.startsWith('You are offline.');
                  return Material(
                    color: draft
                        ? KjaColors.sunWash
                        : offline
                            ? KjaColors.roseWash
                            : KjaColors.roseWash,
                    child: ListTile(
                      leading: ToneIcon(
                        icon: draft
                            ? Icons.edit_note_rounded
                            : offline
                                ? Icons.cloud_off_rounded
                                : Icons.info_rounded,
                        tone: draft ? Tone.sun : Tone.rose,
                      ),
                      title: Text(
                        text,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      trailing: IconButton(
                        onPressed: widget.controller.dismissBanner,
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ),
                  );
                },
              ),
            Expanded(
              child: RefreshIndicator(
                color: KjaColors.navy,
                onRefresh: widget.controller.refresh,
                child: _page(),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: keyboard || locked
          ? null
          : TeacherDock(
              current: _destination,
              onSelect: _open,
              resourcesBadge: portal.draftCount,
              chatBadge: portal.flaggedMessages,
            ),
    );
  }

  Widget _page() {
    switch (_destination) {
      case AppDestination.home:
        return HomePage(portal: portal, open: _open, openPaper: _openPaper);
      case AppDestination.resources:
        return ResourcesPage(controller: widget.controller);
      case AppDestination.chat:
        return ChatPage(controller: widget.controller);
      case AppDestination.assessments:
        return AssessmentsPage(portal: portal, openPaper: _openPaper);
      case AppDestination.performance:
        return PerformancePage(portal: portal);
      case AppDestination.points:
        return PointsPage(controller: widget.controller);
      case AppDestination.attendance:
        return AttendancePage(controller: widget.controller);
      case AppDestination.calendar:
        return CalendarPage(controller: widget.controller);
      case AppDestination.notices:
        return NoticesPage(controller: widget.controller);
      case AppDestination.profile:
        return ProfilePage(controller: widget.controller);
    }
  }
}
