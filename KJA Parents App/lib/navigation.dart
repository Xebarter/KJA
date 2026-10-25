import 'package:flutter/material.dart';

import 'theme.dart';

enum AppDestination {
  children,
  home,
  communications,
  reports,
  fees,
  applications,
  clubs,
  calendar,
  notices,
  profile;

  /// Dock: Children · Home · Communications
  static const dockItems = <AppDestination>[children, home, communications];

  /// Hamburger menu only (not dock).
  static const menuItems = <AppDestination>[
    reports,
    fees,
    applications,
    clubs,
    calendar,
    notices,
    profile,
  ];

  static const sidebarItems = menuItems;
}

String sidebarGroupTitle(AppDestination destination) {
  switch (destination) {
    case AppDestination.reports:
    case AppDestination.fees:
      return 'Family';
    case AppDestination.applications:
    case AppDestination.clubs:
    case AppDestination.calendar:
      return 'School';
    case AppDestination.notices:
      return 'Inbox';
    case AppDestination.profile:
      return 'Account';
    case AppDestination.children:
    case AppDestination.home:
    case AppDestination.communications:
      return '';
  }
}

extension AppDestinationX on AppDestination {
  String get label {
    switch (this) {
      case AppDestination.children:
        return 'Children';
      case AppDestination.home:
        return 'Home';
      case AppDestination.communications:
        return 'Comms';
      case AppDestination.reports:
        return 'Reports';
      case AppDestination.fees:
        return 'School fees';
      case AppDestination.applications:
        return 'Applications';
      case AppDestination.clubs:
        return 'Clubs';
      case AppDestination.calendar:
        return 'Calendar';
      case AppDestination.notices:
        return 'Notifications';
      case AppDestination.profile:
        return 'My details';
    }
  }

  String get menuLabel {
    switch (this) {
      case AppDestination.communications:
        return 'Communications';
      default:
        return label;
    }
  }

  IconData get icon {
    switch (this) {
      case AppDestination.children:
        return Icons.family_restroom_rounded;
      case AppDestination.home:
        return Icons.home_rounded;
      case AppDestination.communications:
        return Icons.forum_rounded;
      case AppDestination.reports:
        return Icons.description_rounded;
      case AppDestination.fees:
        return Icons.receipt_long_rounded;
      case AppDestination.applications:
        return Icons.assignment_rounded;
      case AppDestination.clubs:
        return Icons.extension_rounded;
      case AppDestination.calendar:
        return Icons.calendar_month_rounded;
      case AppDestination.notices:
        return Icons.notifications_active_rounded;
      case AppDestination.profile:
        return Icons.person_rounded;
    }
  }

  Tone get tone {
    switch (this) {
      case AppDestination.children:
        return Tone.rose;
      case AppDestination.home:
        return Tone.sky;
      case AppDestination.communications:
        return Tone.mint;
      case AppDestination.reports:
        return Tone.sun;
      case AppDestination.fees:
        return Tone.coral;
      case AppDestination.applications:
        return Tone.lilac;
      case AppDestination.clubs:
        return Tone.coral;
      case AppDestination.calendar:
        return Tone.sky;
      case AppDestination.notices:
        return Tone.sun;
      case AppDestination.profile:
        return Tone.lilac;
    }
  }

  bool get isDock =>
      this == AppDestination.children || this == AppDestination.home || this == AppDestination.communications;
}

AppDestination? destinationForHref(String? href) {
  if (href == null || href.isEmpty) return null;
  final path = href.toLowerCase();
  if (path.contains('children') || path.contains('child')) return AppDestination.children;
  if (path.contains('report')) return AppDestination.reports;
  if (path.contains('fee')) return AppDestination.fees;
  if (path.contains('application')) return AppDestination.applications;
  if (path.contains('club')) return AppDestination.clubs;
  if (path.contains('calendar') || path.contains('/event/')) return AppDestination.calendar;
  if (path.contains('communication') || path.contains('message')) return AppDestination.communications;
  if (path.contains('notification')) return AppDestination.notices;
  if (path.contains('profile')) return AppDestination.profile;
  if (path.contains('/account')) return AppDestination.home;
  return null;
}
