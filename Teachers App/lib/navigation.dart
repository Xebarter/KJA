import 'package:flutter/material.dart';

import 'theme.dart';

enum AppDestination {
  resources,
  home,
  chat,
  assessments,
  performance,
  points,
  attendance,
  calendar,
  notices,
  profile;

  static const dockItems = <AppDestination>[resources, home, chat];

  static List<AppDestination> menuFor({
    required bool classTeacher,
    required bool canAward,
    required bool locked,
  }) {
    if (locked) return const [profile];
    return [
      assessments,
      performance,
      if (canAward) points,
      if (classTeacher) ...[attendance, calendar, notices],
      profile,
    ];
  }
}

String sidebarGroupTitle(AppDestination destination) {
  switch (destination) {
    case AppDestination.assessments:
    case AppDestination.performance:
      return 'Subjects';
    case AppDestination.points:
    case AppDestination.attendance:
    case AppDestination.calendar:
    case AppDestination.notices:
      return 'My class';
    case AppDestination.profile:
      return 'Account';
    case AppDestination.resources:
    case AppDestination.home:
    case AppDestination.chat:
      return '';
  }
}

extension AppDestinationX on AppDestination {
  String get label {
    switch (this) {
      case AppDestination.resources:
        return 'Resources';
      case AppDestination.home:
        return 'Home';
      case AppDestination.chat:
        return 'Chat';
      case AppDestination.assessments:
        return 'Assessments';
      case AppDestination.performance:
        return 'Performance';
      case AppDestination.points:
        return 'Points';
      case AppDestination.attendance:
        return 'Attendance';
      case AppDestination.calendar:
        return 'Calendar';
      case AppDestination.notices:
        return 'Notices';
      case AppDestination.profile:
        return 'Profile';
    }
  }

  String get menuLabel => label;

  IconData get icon {
    switch (this) {
      case AppDestination.resources:
        return Icons.menu_book_rounded;
      case AppDestination.home:
        return Icons.home_rounded;
      case AppDestination.chat:
        return Icons.forum_rounded;
      case AppDestination.assessments:
        return Icons.edit_note_rounded;
      case AppDestination.performance:
        return Icons.bar_chart_rounded;
      case AppDestination.points:
        return Icons.stars_rounded;
      case AppDestination.attendance:
        return Icons.fact_check_rounded;
      case AppDestination.calendar:
        return Icons.calendar_month_rounded;
      case AppDestination.notices:
        return Icons.campaign_rounded;
      case AppDestination.profile:
        return Icons.person_rounded;
    }
  }

  Tone get tone {
    switch (this) {
      case AppDestination.resources:
        return Tone.sun;
      case AppDestination.home:
        return Tone.sky;
      case AppDestination.chat:
        return Tone.mint;
      case AppDestination.assessments:
        return Tone.lilac;
      case AppDestination.performance:
        return Tone.sky;
      case AppDestination.points:
        return Tone.sun;
      case AppDestination.attendance:
        return Tone.rose;
      case AppDestination.calendar:
        return Tone.sun;
      case AppDestination.notices:
        return Tone.coral;
      case AppDestination.profile:
        return Tone.lilac;
    }
  }
}
