import 'package:flutter/material.dart';

import '../models.dart';
import '../navigation.dart';
import '../pupil_photos.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'account_pages.dart';
import 'chart_page.dart';
import 'home_page.dart';
import 'homework_page.dart';
import 'messages_page.dart';
import 'reports_page.dart';
import 'resources_page.dart';
import 'school_pages.dart';

String? _selfPhotoUrl(PortalSnapshot portal) {
  final id = portal.pupil?.id;
  final fromPortal = portal.photoUrl ?? portal.faceUrl(id);
  if ((fromPortal ?? '').trim().isNotEmpty) return fromPortal;
  if (id == null || id.isEmpty) return null;
  return PupilPhotoUrl.siteProxy(studentId: id, photoPath: portal.pupil?.photoPath);
}

class PupilShell extends StatefulWidget {
  const PupilShell({super.key, required this.controller});

  final PortalController controller;

  @override
  State<PupilShell> createState() => _PupilShellState();
}

class _PupilShellState extends State<PupilShell> {
  var _destination = AppDestination.home;
  String? _pendingChatPeerId;

  PortalSnapshot get portal => widget.controller.snapshot!;

  void _open(AppDestination destination) {
    setState(() {
      _destination = destination;
      if (destination != AppDestination.messages) _pendingChatPeerId = null;
    });
  }

  void _messageClassmate(Classmate peer) {
    setState(() {
      _pendingChatPeerId = peer.id;
      _destination = AppDestination.messages;
    });
  }

  Future<void> _signOut() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You can sign in again with your pupil email.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Stay')),
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
    final noticeBadge = portal.unreadNotices;
    final messageBadge = portal.unreadMessages;

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
        shape: const Border(
          bottom: BorderSide(color: Color(0xFFE8EDF2)),
        ),
        title: SizedBox(
          width: double.infinity,
          height: 64,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Centered: school logo · KJA · page name
              Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        border: Border.all(color: const Color(0xFFE8EDF2)),
                        boxShadow: [
                          BoxShadow(
                            color: KjaColors.ink.withValues(alpha: 0.06),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: const Padding(
                        padding: EdgeInsets.all(4),
                        child: SchoolMark(size: 28),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'KJA',
                          style: TextStyle(
                            color: KjaColors.navy,
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                            height: 1.1,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _destination.menuLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
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
              // Left: hamburger
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
              // Right: notices only
              Align(
                alignment: Alignment.centerRight,
                child: Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: HeaderIconButton(
                    icon: Icons.notifications_rounded,
                    tooltip: 'Notices',
                    tone: Tone.sun,
                    badge: noticeBadge,
                    onPressed: () => _open(AppDestination.notices),
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
      drawer: PupilMenu(
        displayName: portal.displayName,
        classLabel: portal.classLabel,
        photoUrl: _selfPhotoUrl(portal),
        studentId: portal.pupil?.id,
        house: portal.pupil?.house,
        current: _destination,
        messageBadge: messageBadge,
        noticeBadge: noticeBadge,
        onSelect: _open,
        onSignOut: () {
          Navigator.pop(context);
          _signOut();
        },
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFEEF7FF), Color(0xFFF5FBFF), Color(0xFFFFF8EF)],
          ),
        ),
        child: Column(
          children: [
            if (portal.mustResetPassword && _destination != AppDestination.card)
              Material(
                color: const Color(0xFFFFF7ED),
                child: ListTile(
                  leading: ToneIcon(icon: Icons.key_rounded, tone: Tone.coral),
                  title: const Text('Please set a new password before you continue.'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _open(AppDestination.card),
                ),
              ),
            if ((widget.controller.banner ?? '').isNotEmpty)
              Material(
                color: KjaColors.roseWash,
                child: ListTile(
                  leading: ToneIcon(icon: Icons.info_rounded, tone: Tone.rose),
                  title: Text(widget.controller.banner!),
                  trailing: IconButton(
                    onPressed: widget.controller.dismissBanner,
                    icon: const Icon(Icons.close_rounded),
                  ),
                ),
              ),
            Expanded(
              child: _destination == AppDestination.messages
                  ? _page()
                  : RefreshIndicator(
                      color: KjaColors.rose,
                      onRefresh: widget.controller.refresh,
                      child: _page(),
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: keyboard ? null : PupilDock(current: _destination, onSelect: _open),
    );
  }

  Widget _page() {
    switch (_destination) {
      case AppDestination.homework:
        return HomeworkPage(portal: portal, controller: widget.controller);
      case AppDestination.home:
        return HomePage(portal: portal, open: _open);
      case AppDestination.chart:
        return ChartPage(portal: portal);
      case AppDestination.timetable:
        return TimetablePage(portal: portal);
      case AppDestination.attendance:
        return AttendancePage(portal: portal);
      case AppDestination.reports:
        return ReportsPage(portal: portal);
      case AppDestination.myClass:
        return ClassPage(portal: portal, onMessage: _messageClassmate);
      case AppDestination.clubs:
        return ListenableBuilder(
          listenable: widget.controller,
          builder: (context, _) => ClubsPage(portal: widget.controller.snapshot ?? portal),
        );
      case AppDestination.calendar:
        return CalendarPage(portal: portal);
      case AppDestination.resources:
        return ResourcesPage(portal: portal, controller: widget.controller);
      case AppDestination.messages:
        return MessagesPage(
          portal: portal,
          controller: widget.controller,
          initialPeerId: _pendingChatPeerId,
        );
      case AppDestination.notices:
        return NotificationsPage(portal: portal, controller: widget.controller, open: _open);
      case AppDestination.card:
        return ProfilePage(portal: portal, controller: widget.controller);
    }
  }
}
