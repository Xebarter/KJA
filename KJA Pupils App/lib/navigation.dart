import 'package:flutter/material.dart';

import 'theme.dart';

enum AppDestination {
  homework,
  home,
  chart,
  timetable,
  attendance,
  reports,
  myClass,
  clubs,
  calendar,
  resources,
  messages,
  notices,
  card;

  /// Full sidebar order — mirrors /student `studentNav`, plus Chart and Resources for the app.
  static const sidebarItems = <AppDestination>[
    home,
    homework,
    timetable,
    attendance,
    reports,
    chart,
    myClass,
    clubs,
    calendar,
    resources,
    messages,
    notices,
    card,
  ];

  /// Pages shown in the hamburger menu (legacy alias).
  static const menuItems = sidebarItems;
}

/// Soft section titles for primary pupils (blank = no divider label).
String sidebarGroupTitle(AppDestination destination) {
  switch (destination) {
    case AppDestination.home:
      return '';
    case AppDestination.homework:
    case AppDestination.timetable:
    case AppDestination.attendance:
    case AppDestination.reports:
    case AppDestination.chart:
      return 'School day';
    case AppDestination.myClass:
    case AppDestination.clubs:
    case AppDestination.calendar:
    case AppDestination.resources:
      return 'My world';
    case AppDestination.messages:
    case AppDestination.notices:
      return 'Chat & news';
    case AppDestination.card:
      return 'About me';
  }
}

extension AppDestinationX on AppDestination {
  String get label {
    switch (this) {
      case AppDestination.homework:
        return 'Homework';
      case AppDestination.home:
        return 'Home';
      case AppDestination.chart:
        return 'Chart';
      case AppDestination.timetable:
        return 'Timetable';
      case AppDestination.attendance:
        return 'Attendance';
      case AppDestination.reports:
        return 'Reports';
      case AppDestination.myClass:
        return 'My class';
      case AppDestination.clubs:
        return 'Clubs';
      case AppDestination.calendar:
        return 'Calendar';
      case AppDestination.resources:
        return 'Resources';
      case AppDestination.messages:
        return 'Chat';
      case AppDestination.notices:
        return 'Notices';
      case AppDestination.card:
        return 'My card';
    }
  }

  /// Sidebar labels — same clear words as the pages themselves.
  String get menuLabel => label;

  IconData get icon {
    switch (this) {
      case AppDestination.homework:
        return Icons.auto_stories_rounded;
      case AppDestination.home:
        return Icons.home_rounded;
      case AppDestination.chart:
        return Icons.bar_chart_rounded;
      case AppDestination.timetable:
        return Icons.grid_view_rounded;
      case AppDestination.attendance:
        return Icons.assignment_ind_rounded;
      case AppDestination.reports:
        return Icons.workspace_premium_rounded;
      case AppDestination.myClass:
        return Icons.groups_rounded;
      case AppDestination.clubs:
        return Icons.extension_rounded;
      case AppDestination.calendar:
        return Icons.calendar_month_rounded;
      case AppDestination.resources:
        return Icons.folder_special_rounded;
      case AppDestination.messages:
        return Icons.chat_rounded;
      case AppDestination.notices:
        return Icons.notifications_active_rounded;
      case AppDestination.card:
        return Icons.badge_rounded;
    }
  }

  /// Matches the student-portal sidebar chip colours.
  Tone get tone {
    switch (this) {
      case AppDestination.homework:
        return Tone.rose;
      case AppDestination.home:
        return Tone.sky;
      case AppDestination.chart:
        return Tone.lilac;
      case AppDestination.timetable:
        return Tone.sky;
      case AppDestination.attendance:
        return Tone.mint;
      case AppDestination.reports:
        return Tone.sun;
      case AppDestination.myClass:
        return Tone.lilac;
      case AppDestination.clubs:
        return Tone.coral;
      case AppDestination.calendar:
        return Tone.sky;
      case AppDestination.resources:
        return Tone.coral;
      case AppDestination.messages:
        return Tone.mint;
      case AppDestination.notices:
        return Tone.sun;
      case AppDestination.card:
        return Tone.lilac;
    }
  }

  bool get isDock =>
      this == AppDestination.homework || this == AppDestination.home || this == AppDestination.messages;
}

AppDestination? destinationForHref(String? href) {
  if (href == null || href.isEmpty) return null;
  final path = href.toLowerCase();
  if (path.contains('homework')) return AppDestination.homework;
  if (path.contains('timetable')) return AppDestination.timetable;
  if (path.contains('attendance')) return AppDestination.attendance;
  if (path.contains('report')) return AppDestination.reports;
  if (path.contains('resource')) return AppDestination.resources;
  if (path.contains('class')) return AppDestination.myClass;
  if (path.contains('club')) return AppDestination.clubs;
  if (path.contains('calendar') || path.contains('/event/')) return AppDestination.calendar;
  if (path.contains('message')) return AppDestination.messages;
  if (path.contains('notification')) return AppDestination.notices;
  if (path.contains('profile') || path.contains('card')) return AppDestination.card;
  if (path.endsWith('/student') || path.endsWith('/student/')) return AppDestination.home;
  return null;
}
