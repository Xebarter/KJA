import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class TimetablePage extends StatefulWidget {
  const TimetablePage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  State<TimetablePage> createState() => _TimetablePageState();
}

class _TimetablePageState extends State<TimetablePage> {
  late int _day;

  @override
  void initState() {
    super.initState();
    final today = kampalaWeekday();
    _day = today >= 1 && today <= 5 ? today : 1;
  }

  @override
  Widget build(BuildContext context) {
    final pupil = widget.portal.pupil;
    if (pupil == null || (pupil.classCode ?? '').isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: EmptyNote(icon: Icons.calendar_view_week_rounded, message: 'Your class is not set yet, so there is no timetable to show.'),
      );
    }
    final lessons = widget.portal.timetable.where((lesson) => lesson.weekday == _day).toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        PageHero(
          kicker: widget.portal.classLabel,
          title: 'Timetable',
          lead: lessons.isEmpty ? 'No lessons on this day.' : '${plural(lessons.length, 'lesson')} on ${weekdayName(_day)}.',
          icon: Icons.calendar_view_week_rounded,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            for (final day in [1, 2, 3, 4, 5])
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: ChoiceChip(
                    label: Text(weekdayShort(day)),
                    selected: _day == day,
                    onSelected: (_) => setState(() => _day = day),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        if (lessons.isEmpty)
          const EmptyNote(icon: Icons.free_breakfast_rounded, message: 'Nothing is timetabled for this day.')
        else
          for (final lesson in lessons)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SoftCard(
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: subjectColor(lesson.subjectName).withValues(alpha: 0.15),
                      child: Text('${lesson.period}', style: TextStyle(color: subjectColor(lesson.subjectName), fontWeight: FontWeight.w800)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(lesson.subjectName, style: const TextStyle(fontWeight: FontWeight.w800)),
                          Text(
                            [lesson.when, if ((lesson.room ?? '').isNotEmpty) lesson.room, if ((lesson.teacherName ?? '').isNotEmpty) lesson.teacherName]
                                .whereType<String>()
                                .join(' · '),
                            style: const TextStyle(color: KjaColors.soft),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
      ],
    );
  }
}

class AttendancePage extends StatelessWidget {
  const AttendancePage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  Widget build(BuildContext context) {
    final attendance = portal.attendance;
    final message = attendance.total == 0
        ? 'Your days will appear here after teachers take the register.'
        : attendance.percent >= 95
            ? 'Fantastic attendance — keep shining every school day!'
            : attendance.percent >= 85
                ? 'Great job coming to school. Every day helps you learn.'
                : attendance.percent >= 70
                    ? "You're doing alright. Try to be here as often as you can."
                    : 'Coming to school more often will help you catch up and feel confident.';
    const tones = {
      'present': (KjaColors.mint, 'Present', 'You were in school'),
      'late': (KjaColors.sun, 'Late', 'You arrived a little late'),
      'absent': (KjaColors.rose, 'Absent', 'You were away'),
      'excused': (KjaColors.sky, 'Excused', 'Absence was explained'),
    };
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        PageHero(
          kicker: portal.termLabel ?? 'This term',
          title: 'Attendance',
          lead: message,
          icon: Icons.fact_check_rounded,
          colors: const [Color(0xFF064E3B), KjaColors.mint, Color(0xFF6EE7B7)],
          footer: Row(
            children: [
              CountChip(label: 'In school', value: attendance.total == 0 ? '—' : '${attendance.percent}%'),
              const SizedBox(width: 8),
              CountChip(label: 'Days marked', value: '${attendance.total}'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            for (final entry in [
              ('present', attendance.present),
              ('late', attendance.late),
              ('absent', attendance.absent),
              ('excused', attendance.excused),
            ])
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: SoftCard(
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
                    child: Column(
                      children: [
                        Text('${entry.$2}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: tones[entry.$1]!.$1)),
                        Text(tones[entry.$1]!.$2, style: const TextStyle(fontSize: 11)),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        const SectionTitle(title: 'Recent days'),
        if (attendance.recent.isEmpty)
          const EmptyNote(icon: Icons.event_available_rounded, message: 'No register days yet.')
        else
          for (final day in attendance.recent)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(weekdayName(parseDate(day.attendedOn)?.weekday ?? 1)),
              subtitle: Text(shortDate(day.attendedOn, withYear: true)),
              trailing: Text(tones[day.status]?.$2 ?? day.status, style: TextStyle(color: tones[day.status]?.$1 ?? KjaColors.ink, fontWeight: FontWeight.w800)),
            ),
      ],
    );
  }
}

class ClassPage extends StatefulWidget {
  const ClassPage({super.key, required this.portal, this.onMessage});

  final PortalSnapshot portal;
  final ValueChanged<Classmate>? onMessage;

  @override
  State<ClassPage> createState() => _ClassPageState();
}

class _ClassPageState extends State<ClassPage> {
  final _search = TextEditingController();

  PortalSnapshot get portal => widget.portal;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Classmate> get _mates {
    final q = _search.text.trim().toLowerCase();
    final list = [...portal.classmates]
      ..sort((a, b) => a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase()));
    if (q.isEmpty) return list;
    return list.where((mate) => mate.displayName.toLowerCase().contains(q)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final className = portal.classLabel.isEmpty ? 'My class' : portal.classLabel;
    final teacherCount = (portal.classTeacher == null ? 0 : 1) + portal.teachers.length;
    final mates = _mates;
    final query = _search.text.trim();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        _ClassHero(
          classLabel: className,
          friends: portal.classmates.length,
          teachers: teacherCount,
          lead: portal.classTeacher == null
              ? 'Meet your teachers and friends in $className.'
              : '${firstNameOf(portal.classTeacher!.fullName)} looks after $className.',
        ),
        const SizedBox(height: 16),
        const _ClassSectionLabel('Class teacher', Icons.favorite_rounded, KjaColors.lilac),
        const SizedBox(height: 8),
        if (portal.classTeacher == null)
          const EmptyNote(
            icon: Icons.person_outline_rounded,
            message: 'Your class teacher will appear here once the office sets one.',
          )
        else
          _TeacherCard(
            name: portal.classTeacher!.label,
            detail: 'Looks after your class',
            color: KjaColors.lilac,
            wash: KjaColors.lilacWash,
            icon: Icons.star_rounded,
          ),
        const SizedBox(height: 18),
        _ClassSectionLabel(
          'Subject teachers',
          Icons.auto_stories_rounded,
          KjaColors.sky,
          count: portal.teachers.isEmpty ? null : '${portal.teachers.length}',
        ),
        const SizedBox(height: 8),
        if (portal.teachers.isEmpty)
          const EmptyNote(
            icon: Icons.menu_book_rounded,
            message: 'Subject teachers show up here when your lessons are set.',
          )
        else
          SizedBox(
            height: 132,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: portal.teachers.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final teacher = portal.teachers[index];
                final color = subjectColor(teacher.subjectName);
                return _SubjectTeacherChip(
                  name: teacher.label,
                  subject: teacher.subjectName ?? 'Subject',
                  color: color,
                  icon: subjectIcon(teacher.subjectName),
                );
              },
            ),
          ),
        const SizedBox(height: 18),
        _ClassSectionLabel(
          'Classmates',
          Icons.groups_rounded,
          KjaColors.mint,
          count: '${portal.classmates.length}',
        ),
        const SizedBox(height: 10),
        if (portal.classmates.isNotEmpty) ...[
          _ClassSearch(controller: _search, onChanged: () => setState(() {})),
          const SizedBox(height: 12),
        ],
        if (portal.classmates.isEmpty)
          const EmptyNote(
            icon: Icons.groups_rounded,
            message: 'Classmates appear when your class is linked.',
          )
        else if (mates.isEmpty)
          EmptyNote(
            icon: Icons.search_rounded,
            message: 'No classmates match “$query”.',
          )
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final width = constraints.maxWidth;
              final columns = width >= 520 ? 3 : 2;
              const gap = 10.0;
              final tileW = (width - gap * (columns - 1)) / columns;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: [
                  for (final mate in mates)
                    SizedBox(
                      width: tileW,
                      child: _ClassmateTile(
                        name: mate.displayName,
                        house: mate.house,
                        photoUrl: mate.photoUrl ?? portal.faceUrl(mate.id),
                        onTap: widget.onMessage == null
                            ? null
                            : () {
                                if (portal.pupil == null) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('Messaging is unavailable right now.')),
                                  );
                                  return;
                                }
                                widget.onMessage!(mate);
                              },
                      ),
                    ),
                ],
              );
            },
          ),
      ],
    );
  }
}

class _ClassHero extends StatelessWidget {
  const _ClassHero({
    required this.classLabel,
    required this.friends,
    required this.teachers,
    required this.lead,
  });

  final String classLabel;
  final int friends;
  final int teachers;
  final String lead;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF7C3AED), Color(0xFF8B5CF6), Color(0xFF38BDF8)],
        ),
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: KjaColors.lilac.withValues(alpha: 0.32),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -20,
            top: -28,
            child: Container(
              width: 110,
              height: 110,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.14),
              ),
            ),
          ),
          Positioned(
            left: 50,
            bottom: -40,
            child: Container(
              width: 90,
              height: 90,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: KjaColors.gold.withValues(alpha: 0.28),
              ),
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.groups_rounded, color: Colors.white.withValues(alpha: 0.95), size: 16),
                        const SizedBox(width: 6),
                        Text(
                          'Your people',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.92),
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      classLabel,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        height: 1.05,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      lead,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.92),
                        fontSize: 13.5,
                        height: 1.35,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                children: [
                  _ClassStat(value: '$friends', label: 'Friends', highlight: true),
                  const SizedBox(height: 8),
                  _ClassStat(value: '$teachers', label: 'Teachers'),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ClassStat extends StatelessWidget {
  const _ClassStat({required this.value, required this.label, this.highlight = false});

  final String value;
  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 74,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              color: highlight ? const Color(0xFFFFE7B0) : Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w800,
              height: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label.toUpperCase(),
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _ClassSectionLabel extends StatelessWidget {
  const _ClassSectionLabel(this.title, this.icon, this.color, {this.count});

  final String title;
  final IconData icon;
  final Color color;
  final String? count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, size: 17, color: color),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: KjaColors.ink),
          ),
        ),
        if (count != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              count!,
              style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12),
            ),
          ),
      ],
    );
  }
}

class _TeacherCard extends StatelessWidget {
  const _TeacherCard({
    required this.name,
    required this.detail,
    required this.color,
    required this.wash,
    required this.icon,
  });

  final String name;
  final String detail;
  final Color color;
  final Color wash;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: const EdgeInsets.all(14),
      color: wash.withValues(alpha: 0.55),
      child: Row(
        children: [
          InitialAvatar(name: name, color: color, radius: 26),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 3),
                Text(detail, style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 13)),
              ],
            ),
          ),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: color.withValues(alpha: 0.2)),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
        ],
      ),
    );
  }
}

class _SubjectTeacherChip extends StatelessWidget {
  const _SubjectTeacherChip({
    required this.name,
    required this.subject,
    required this.color,
    required this.icon,
  });

  final String name;
  final String subject;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 148,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.22)),
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.12), blurRadius: 12, offset: const Offset(0, 5)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const Spacer(),
          Text(
            subject,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12),
          ),
          const SizedBox(height: 2),
          Text(
            firstNameOf(name),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5, color: KjaColors.ink),
          ),
        ],
      ),
    );
  }
}

class _ClassSearch extends StatelessWidget {
  const _ClassSearch({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: KjaColors.mint.withValues(alpha: 0.28)),
        boxShadow: [
          BoxShadow(color: KjaColors.mint.withValues(alpha: 0.06), blurRadius: 10, offset: const Offset(0, 3)),
        ],
      ),
      child: Row(
        children: [
          Icon(Icons.search_rounded, size: 20, color: KjaColors.soft.withValues(alpha: 0.9)),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: (_) => onChanged(),
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
              decoration: const InputDecoration(
                hintText: 'Find a friend…',
                hintStyle: TextStyle(color: KjaColors.mute, fontWeight: FontWeight.w500),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          if (controller.text.isNotEmpty)
            IconButton(
              visualDensity: VisualDensity.compact,
              onPressed: () {
                controller.clear();
                onChanged();
              },
              icon: const Icon(Icons.close_rounded, size: 18, color: KjaColors.soft),
            ),
        ],
      ),
    );
  }
}

class _ClassmateTile extends StatelessWidget {
  const _ClassmateTile({
    required this.name,
    required this.house,
    this.photoUrl,
    this.onTap,
  });

  final String name;
  final String? house;
  final String? photoUrl;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tone = houseColor(house);
    final houseLabel = (house ?? '').trim();

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: tone.withValues(alpha: 0.18)),
            boxShadow: [
              BoxShadow(color: tone.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4)),
            ],
          ),
          child: Column(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  PupilFace(name: name, color: tone, radius: 28, photoUrl: photoUrl),
                  if (onTap != null)
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: KjaColors.mint,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: const Icon(Icons.chat_rounded, size: 12, color: Colors.white),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                firstNameOf(name),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5, color: KjaColors.ink),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: tone.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  houseLabel.isEmpty ? 'Friend' : houseLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: tone, fontWeight: FontWeight.w800, fontSize: 11),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ClubsPage extends StatelessWidget {
  const ClubsPage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  Widget build(BuildContext context) {
    final paid = portal.clubs.where((club) => club.paid).length;
    final unpaid = portal.clubs.length - paid;
    final lead = portal.clubs.isEmpty
        ? 'Ask your parents to choose clubs in the parent portal — then they will show up here.'
        : unpaid > 0
            ? 'You are in ${plural(portal.clubs.length, 'club')}. $unpaid still ${unpaid == 1 ? 'needs' : 'need'} payment from parents.'
            : 'You are in ${plural(portal.clubs.length, 'club')} and everything looks paid. Have fun!';
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        PageHero(
          kicker: 'After lessons',
          title: 'Clubs',
          lead: lead,
          icon: Icons.extension_rounded,
          colors: const [Color(0xFF9A3412), KjaColors.coral, Color(0xFFFDBA74)],
          footer: Row(
            children: [
              CountChip(label: 'Clubs', value: '${portal.clubs.length}'),
              const SizedBox(width: 8),
              CountChip(label: 'Paid', value: '$paid'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (portal.clubs.isEmpty)
          const EmptyNote(icon: Icons.extension_rounded, message: 'No clubs yet.')
        else
          for (final club in portal.clubs)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: KjaColors.coral.withValues(alpha: 0.15),
                          child: Icon(clubIcon(club.title), color: KjaColors.coral),
                        ),
                        const SizedBox(width: 12),
                        Expanded(child: Text(club.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
                        Text(club.paid ? 'Paid' : 'To pay', style: TextStyle(color: club.paid ? KjaColors.mint : KjaColors.sun, fontWeight: FontWeight.w800)),
                      ],
                    ),
                    if ((club.meeting ?? '').isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(club.meeting!, style: const TextStyle(fontWeight: FontWeight.w700)),
                    ],
                    if ((club.campus ?? '').isNotEmpty) Text(club.campus!, style: const TextStyle(color: KjaColors.soft)),
                    if ((club.description ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(club.description!),
                    ],
                  ],
                ),
              ),
            ),
      ],
    );
  }
}

class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  late DateTime _month;
  String? _selected;

  @override
  void initState() {
    super.initState();
    final now = kampalaNow();
    _month = DateTime(now.year, now.month);
  }

  @override
  Widget build(BuildContext context) {
    final items = <_CalItem>[
      for (final date in widget.portal.academicDates)
        _CalItem(date.startsOn, date.title, academicKindLabel(date.kind), date.note),
      for (final event in widget.portal.events)
        _CalItem(event.startsOn, event.title, event.location ?? 'School event', null),
    ]..sort((a, b) => a.ymd.compareTo(b.ymd));
    final marked = {for (final item in items) item.ymd};
    final shown = _selected == null ? items.where((item) => item.ymd.compareTo(todayYmd()) >= 0).toList() : items.where((item) => item.ymd == _selected).toList();
    final first = DateTime(_month.year, _month.month, 1);
    final days = DateTime(_month.year, _month.month + 1, 0).day;
    final lead = first.weekday - 1;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        PageHero(
          kicker: widget.portal.termLabel ?? 'School year',
          title: 'Calendar',
          lead: 'Tests, reports and school events for your campus.',
          icon: Icons.calendar_month_rounded,
          colors: const [Color(0xFF92400E), KjaColors.sun, Color(0xFFFDE68A)],
        ),
        const SizedBox(height: 12),
        SoftCard(
          child: Column(
            children: [
              Row(
                children: [
                  IconButton(onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1)), icon: const Icon(Icons.chevron_left_rounded)),
                  Expanded(
                    child: Text('${monthLong(_month.month)} ${_month.year}', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  IconButton(onPressed: () => setState(() => _month = DateTime(_month.year, _month.month + 1)), icon: const Icon(Icons.chevron_right_rounded)),
                ],
              ),
              Row(
                children: [
                  for (final label in ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
                    Expanded(child: Center(child: Text(label, style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w700)))),
                ],
              ),
              const SizedBox(height: 6),
              GridView.count(
                crossAxisCount: 7,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  for (var i = 0; i < lead; i++) const SizedBox.shrink(),
                  for (var day = 1; day <= days; day++)
                    _dayCell(day, marked.contains(ymd(DateTime(_month.year, _month.month, day)))),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (_selected != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(onPressed: () => setState(() => _selected = null), child: const Text('Show upcoming')),
          ),
        if (shown.isEmpty)
          const EmptyNote(icon: Icons.event_busy_rounded, message: 'Nothing listed for this day.')
        else
          for (final item in shown.take(30))
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(monthShort(parseDate(item.ymd)?.month ?? 1), style: const TextStyle(fontSize: 11, color: KjaColors.soft)),
                  Text('${parseDate(item.ymd)?.day ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                ],
              ),
              title: Text(item.title, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text([item.kind, if ((item.note ?? '').isNotEmpty) item.note].whereType<String>().join(' · ')),
            ),
      ],
    );
  }

  Widget _dayCell(int day, bool marked) {
    final value = ymd(DateTime(_month.year, _month.month, day));
    final selected = _selected == value;
    final today = value == todayYmd();
    return InkWell(
      onTap: () => setState(() => _selected = selected ? null : value),
      child: Center(
        child: Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? KjaColors.navy : (today ? KjaColors.sky.withValues(alpha: 0.2) : null),
            shape: BoxShape.circle,
          ),
          child: Text(
            '$day',
            style: TextStyle(
              color: selected ? Colors.white : KjaColors.ink,
              fontWeight: marked ? FontWeight.w800 : FontWeight.w500,
              decoration: marked ? TextDecoration.underline : null,
              decorationColor: KjaColors.rose,
            ),
          ),
        ),
      ),
    );
  }
}

class _CalItem {
  _CalItem(this.ymd, this.title, this.kind, this.note);
  final String ymd;
  final String title;
  final String kind;
  final String? note;
}
