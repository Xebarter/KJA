import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../models.dart';
import '../navigation.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'applications_page.dart';
import 'calendar_page.dart';
import 'children_page.dart';
import 'clubs_page.dart';
import 'communications_page.dart';
import 'fees_page.dart';
import 'home_page.dart';
import 'notices_page.dart';
import 'points_page.dart';
import 'profile_page.dart';
import 'reports_page.dart';

class ParentShell extends StatefulWidget {
  const ParentShell({super.key, required this.controller});

  final PortalController controller;

  @override
  State<ParentShell> createState() => _ParentShellState();
}

class _ParentShellState extends State<ParentShell> {
  String? _pointsChildId;
  var _destination = AppDestination.home;

  PortalSnapshot get portal => widget.controller.snapshot!;

  void _go(AppDestination destination) => _open(destination);

  void _open(AppDestination destination, {String? href}) {
    setState(() {
      _destination = destination;
      if (destination == AppDestination.points) {
        final childId = childIdFromHref(href);
        if (childId != null) _pointsChildId = childId;
      }
    });
  }

  Future<void> _signOut() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You can sign in again with your parent email.'),
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

  Future<void> openWeb(String path) async {
    final uri = Uri.parse(AppConfig.sitePath(path));
    await launchUrl(uri, mode: LaunchMode.externalApplication);
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
                        boxShadow: [
                          BoxShadow(
                            color: KjaColors.ink.withValues(alpha: 0.05),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: const Padding(padding: EdgeInsets.all(5), child: SchoolMark(size: 28)),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'KJA Parents',
                          style: TextStyle(
                            color: KjaColors.navy,
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.2,
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
              Align(
                alignment: Alignment.centerRight,
                child: Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: HeaderIconButton(
                    icon: Icons.notifications_rounded,
                    tooltip: 'Notifications',
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
      drawer: ParentMenu(
        displayName: portal.displayName,
        current: _destination,
        noticeBadge: noticeBadge,
        onSelect: _open,
        onSignOut: () {
          final scaffold = Scaffold.maybeOf(context);
          if (scaffold?.isDrawerOpen ?? false) {
            scaffold!.closeDrawer();
          }
          _signOut();
        },
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [KjaColors.pageTop, KjaColors.pageMid, KjaColors.pageBottom],
          ),
        ),
        child: Column(
          children: [
            if (portal.mustResetPassword && _destination != AppDestination.profile)
              Material(
                color: KjaColors.coralWash,
                child: ListTile(
                  leading: ToneIcon(icon: Icons.key_rounded, tone: Tone.coral),
                  title: const Text('Please set a new password before you continue.', style: TextStyle(fontWeight: FontWeight.w700)),
                  trailing: const Icon(Icons.chevron_right_rounded, color: KjaColors.soft),
                  onTap: () => _open(AppDestination.profile),
                ),
              ),
            if ((widget.controller.banner ?? '').isNotEmpty)
              Material(
                color: KjaColors.roseWash,
                child: ListTile(
                  leading: ToneIcon(icon: Icons.info_rounded, tone: Tone.rose),
                  title: Text(widget.controller.banner!, style: const TextStyle(fontWeight: FontWeight.w700)),
                  trailing: IconButton(
                    onPressed: widget.controller.dismissBanner,
                    icon: const Icon(Icons.close_rounded),
                  ),
                ),
              ),
            Expanded(
              child: _destination == AppDestination.communications
                  ? _page()
                  : _destination == AppDestination.clubs
                      ? _page()
                      : RefreshIndicator(
                          color: KjaColors.navy,
                          onRefresh: widget.controller.refresh,
                          child: _page(),
                        ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: keyboard
          ? null
          : ParentDock(
              current: _destination,
              onSelect: _open,
              commsBadge: messageBadge,
            ),
    );
  }

  Widget _page() {
    switch (_destination) {
      case AppDestination.home:
        return HomePage(portal: portal, open: _go);
      case AppDestination.children:
        return ChildrenPage(portal: portal, open: _go);
      case AppDestination.communications:
        return CommunicationsPage(portal: portal, controller: widget.controller);
      case AppDestination.reports:
        return ReportsPage(portal: portal, controller: widget.controller);
      case AppDestination.points:
        return PointsPage(portal: portal, initialChildId: _pointsChildId);
      case AppDestination.fees:
        return FeesPage(portal: portal, controller: widget.controller, openWeb: openWeb);
      case AppDestination.applications:
        return ApplicationsPage(portal: portal, openWeb: openWeb);
      case AppDestination.clubs:
        return ClubsPage(portal: portal, controller: widget.controller, openWeb: openWeb);
      case AppDestination.calendar:
        return CalendarPage(portal: portal, openWeb: openWeb);
      case AppDestination.notices:
        return NoticesPage(portal: portal, controller: widget.controller, open: _open);
      case AppDestination.profile:
        return ProfilePage(portal: portal, controller: widget.controller);
    }
  }
}
