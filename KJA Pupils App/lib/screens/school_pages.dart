import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../pupil_photos.dart';
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

  List<Lesson> _lessonsFor(int day) {
    final rows = widget.portal.timetable.where((lesson) => lesson.weekday == day).toList()
      ..sort((a, b) {
        final byPeriod = a.period.compareTo(b.period);
        if (byPeriod != 0) return byPeriod;
        return (a.startsAt ?? '').compareTo(b.startsAt ?? '');
      });
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final pupil = widget.portal.pupil;
    if (pupil == null || (pupil.classCode ?? '').isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: EmptyNote(
          icon: Icons.calendar_view_week_rounded,
          message: 'Your class is not set yet, so there is no timetable to show.',
        ),
      );
    }

    final today = kampalaWeekday();
    final isToday = _day == today;
    final lessons = _lessonsFor(_day);
    final nowLesson = isToday ? _currentLesson(lessons) : null;
    final nextLesson = isToday ? _nextLesson(lessons) : null;
    final counts = {for (final day in [1, 2, 3, 4, 5]) day: _lessonsFor(day).length};

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        _TimetableHero(
          classLabel: widget.portal.classLabel,
          dayName: weekdayName(_day),
          lessonCount: lessons.length,
          isToday: isToday,
        ),
        const SizedBox(height: 14),
        _DayStrip(
          selected: _day,
          today: today,
          counts: counts,
          onSelect: (day) => setState(() => _day = day),
        ),
        if (isToday && (nowLesson != null || nextLesson != null)) ...[
          const SizedBox(height: 14),
          _NowBanner(
            nowLesson: nowLesson,
            nextLesson: nextLesson,
          ),
        ],
        const SizedBox(height: 18),
        Text(
          isToday ? 'Today’s lessons' : '${weekdayName(_day)}’s lessons',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: KjaColors.ink),
        ),
        const SizedBox(height: 10),
        if (lessons.isEmpty)
          const _FreeDayCard()
        else
          for (var i = 0; i < lessons.length; i++) ...[
            _LessonCard(
              lesson: lessons[i],
              index: i,
              isNow: nowLesson?.id == lessons[i].id,
              isNext: nowLesson == null && nextLesson?.id == lessons[i].id,
            ),
            if (i < lessons.length - 1) const SizedBox(height: 10),
          ],
      ],
    );
  }
}

Lesson? _currentLesson(List<Lesson> lessons) {
  final minutes = _kampalaMinutes();
  for (final lesson in lessons) {
    final start = _clockMinutes(lesson.startsAt);
    final end = _clockMinutes(lesson.endsAt);
    if (start == null) continue;
    final close = end ?? (start + 40);
    if (minutes >= start && minutes < close) return lesson;
  }
  return null;
}

Lesson? _nextLesson(List<Lesson> lessons) {
  final minutes = _kampalaMinutes();
  for (final lesson in lessons) {
    final start = _clockMinutes(lesson.startsAt);
    if (start != null && start > minutes) return lesson;
  }
  return null;
}

int _kampalaMinutes() {
  final now = kampalaNow();
  return now.hour * 60 + now.minute;
}

int? _clockMinutes(String? value) {
  final raw = (value ?? '').trim();
  if (raw.length < 4) return null;
  final parts = raw.split(':');
  if (parts.length < 2) return null;
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) return null;
  return hour * 60 + minute;
}

class _TimetableHero extends StatelessWidget {
  const _TimetableHero({
    required this.classLabel,
    required this.dayName,
    required this.lessonCount,
    required this.isToday,
  });

  final String classLabel;
  final String dayName;
  final int lessonCount;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFA78BFA), KjaColors.lilac, Color(0xFF0284C7)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: KjaColors.lilac.withValues(alpha: 0.28), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.22),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
            ),
            child: const Icon(Icons.grid_view_rounded, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'My lessons',
                  style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, height: 1.1),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (classLabel.isNotEmpty) _HeroChip(label: classLabel),
                    _HeroChip(label: isToday ? 'Today · $dayName' : dayName),
                    _HeroChip(label: lessonCount == 0 ? 'Free day' : plural(lessonCount, 'lesson')),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  const _HeroChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}

class _DayStrip extends StatelessWidget {
  const _DayStrip({
    required this.selected,
    required this.today,
    required this.counts,
    required this.onSelect,
  });

  final int selected;
  final int today;
  final Map<int, int> counts;
  final ValueChanged<int> onSelect;

  static const _dayColors = [
    KjaColors.sky,
    KjaColors.mint,
    KjaColors.sun,
    KjaColors.coral,
    KjaColors.lilac,
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < 5; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: _DayButton(
              day: i + 1,
              color: _dayColors[i],
              selected: selected == i + 1,
              isToday: today == i + 1,
              lessonCount: counts[i + 1] ?? 0,
              onTap: () => onSelect(i + 1),
            ),
          ),
        ],
      ],
    );
  }
}

class _DayButton extends StatelessWidget {
  const _DayButton({
    required this.day,
    required this.color,
    required this.selected,
    required this.isToday,
    required this.lessonCount,
    required this.onTap,
  });

  final int day;
  final Color color;
  final bool selected;
  final bool isToday;
  final int lessonCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final label = weekdayShort(day);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
          decoration: BoxDecoration(
            color: selected ? color : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: selected ? color : color.withValues(alpha: 0.22)),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: selected ? 0.28 : 0.1),
                blurRadius: selected ? 14 : 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            children: [
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : color,
                  fontWeight: FontWeight.w900,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                isToday ? 'Today' : '$lessonCount',
                style: TextStyle(
                  color: selected ? Colors.white.withValues(alpha: 0.92) : KjaColors.soft,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var d = 0; d < lessonCount.clamp(0, 5); d++)
                    Container(
                      width: 5,
                      height: 5,
                      margin: const EdgeInsets.symmetric(horizontal: 1.5),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: selected ? Colors.white.withValues(alpha: 0.9) : color.withValues(alpha: 0.55),
                      ),
                    ),
                  if (lessonCount == 0)
                    Icon(
                      Icons.wb_sunny_rounded,
                      size: 12,
                      color: selected ? Colors.white.withValues(alpha: 0.9) : KjaColors.sun,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NowBanner extends StatelessWidget {
  const _NowBanner({this.nowLesson, this.nextLesson});

  final Lesson? nowLesson;
  final Lesson? nextLesson;

  @override
  Widget build(BuildContext context) {
    final lesson = nowLesson ?? nextLesson!;
    final color = subjectColor(lesson.subjectName);
    final live = nowLesson != null;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.28)),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(subjectIcon(lesson.subjectName), color: color, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  live ? 'Happening now' : 'Coming up next',
                  style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12),
                ),
                const SizedBox(height: 2),
                Text(
                  lesson.subjectName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: KjaColors.ink),
                ),
                Text(
                  lesson.when,
                  style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ],
            ),
          ),
          if (live)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(99)),
              child: const Text('NOW', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 11)),
            ),
        ],
      ),
    );
  }
}

class _FreeDayCard extends StatelessWidget {
  const _FreeDayCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 28, 18, 28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.sun.withValues(alpha: 0.22)),
        boxShadow: [BoxShadow(color: KjaColors.sun.withValues(alpha: 0.1), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: const Column(
        children: [
          Icon(Icons.wb_sunny_rounded, color: KjaColors.sun, size: 40),
          SizedBox(height: 10),
          Text(
            'Free day!',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: KjaColors.ink),
          ),
          SizedBox(height: 4),
          Text(
            'No lessons are on the timetable for this day.',
            textAlign: TextAlign.center,
            style: TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _LessonCard extends StatelessWidget {
  const _LessonCard({
    required this.lesson,
    required this.index,
    required this.isNow,
    required this.isNext,
  });

  final Lesson lesson;
  final int index;
  final bool isNow;
  final bool isNext;

  @override
  Widget build(BuildContext context) {
    final color = subjectColor(lesson.subjectName);
    final room = (lesson.room ?? '').trim();
    final teacher = (lesson.teacherName ?? '').trim();

    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: color.withValues(alpha: isNow || isNext ? 0.45 : 0.18), width: isNow ? 2 : 1),
          boxShadow: [BoxShadow(color: color.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 5))],
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(subjectIcon(lesson.subjectName), color: color, size: 26),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      'P${lesson.period}',
                      style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 11),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            lesson.subjectName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17, color: KjaColors.ink, height: 1.15),
                          ),
                        ),
                        if (isNow || isNext) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: isNow ? color : color.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                              isNow ? 'NOW' : 'NEXT',
                              style: TextStyle(
                                color: isNow ? Colors.white : color,
                                fontWeight: FontWeight.w900,
                                fontSize: 10,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        _InfoPill(icon: Icons.schedule_rounded, label: lesson.when, color: color),
                        if (room.isNotEmpty) _InfoPill(icon: Icons.meeting_room_rounded, label: room, color: color),
                        if (teacher.isNotEmpty) _InfoPill(icon: Icons.person_rounded, label: teacher, color: color),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({required this.icon, required this.label, required this.color});

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
        ],
      ),
    );
  }
}

class AttendancePage extends StatefulWidget {
  const AttendancePage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  State<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<AttendancePage> {
  String? _filter;

  static const _statuses = <({String key, String label, String hint, Color color, IconData icon})>[
    (key: 'present', label: 'Present', hint: 'In school', color: KjaColors.mint, icon: Icons.check_circle_rounded),
    (key: 'late', label: 'Late', hint: 'A little late', color: KjaColors.sun, icon: Icons.schedule_rounded),
    (key: 'absent', label: 'Absent', hint: 'Away', color: KjaColors.rose, icon: Icons.cancel_rounded),
    (key: 'excused', label: 'Excused', hint: 'Explained', color: KjaColors.sky, icon: Icons.verified_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final attendance = widget.portal.attendance;
    final message = attendance.total == 0
        ? 'Your days show up here after teachers take the register.'
        : attendance.percent >= 95
            ? 'Fantastic! Keep shining every school day.'
            : attendance.percent >= 85
                ? 'Great job coming to school.'
                : attendance.percent >= 70
                    ? 'Nice try — come as often as you can.'
                    : 'Coming more often helps you learn and feel ready.';

    final counts = {
      'present': attendance.present,
      'late': attendance.late,
      'absent': attendance.absent,
      'excused': attendance.excused,
    };

    final days = [
      for (final day in attendance.recent)
        if (_filter == null || day.status == _filter) day,
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        _AttendanceHero(
          termLabel: widget.portal.termLabel ?? 'This term',
          percent: attendance.total == 0 ? null : attendance.percent,
          daysMarked: attendance.total,
          cheer: message,
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            for (var i = 0; i < _statuses.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: _StatusTile(
                  label: _statuses[i].label,
                  hint: _statuses[i].hint,
                  count: counts[_statuses[i].key] ?? 0,
                  color: _statuses[i].color,
                  icon: _statuses[i].icon,
                  selected: _filter == _statuses[i].key,
                  onTap: () => setState(() {
                    _filter = _filter == _statuses[i].key ? null : _statuses[i].key;
                  }),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: Text(
                _filter == null ? 'Recent days' : _statuses.firstWhere((row) => row.key == _filter).label,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: KjaColors.ink),
              ),
            ),
            if (_filter != null)
              TextButton(
                onPressed: () => setState(() => _filter = null),
                child: const Text('Show all', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
          ],
        ),
        const SizedBox(height: 10),
        if (attendance.recent.isEmpty)
          const _AttendanceEmpty()
        else if (days.isEmpty)
          _FilterEmpty(label: _statuses.firstWhere((row) => row.key == _filter).label)
        else
          for (var i = 0; i < days.length; i++) ...[
            _AttendanceDayCard(day: days[i]),
            if (i < days.length - 1) const SizedBox(height: 8),
          ],
      ],
    );
  }
}

class _AttendanceHero extends StatelessWidget {
  const _AttendanceHero({
    required this.termLabel,
    required this.percent,
    required this.daysMarked,
    required this.cheer,
  });

  final String termLabel;
  final int? percent;
  final int daysMarked;
  final String cheer;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF34D399), KjaColors.mint, Color(0xFF047857)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: KjaColors.mint.withValues(alpha: 0.28), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.4), width: 3),
            ),
            alignment: Alignment.center,
            child: Text(
              percent == null ? '—' : '$percent%',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Attendance',
                  style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, height: 1.1),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _AttendanceChip(label: termLabel),
                    _AttendanceChip(label: daysMarked == 0 ? 'No days yet' : plural(daysMarked, 'day')),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  cheer,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.95), fontWeight: FontWeight.w700, fontSize: 13, height: 1.3),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AttendanceChip extends StatelessWidget {
  const _AttendanceChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}

class _StatusTile extends StatelessWidget {
  const _StatusTile({
    required this.label,
    required this.hint,
    required this.count,
    required this.color,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String hint;
  final int count;
  final Color color;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.fromLTRB(8, 12, 8, 12),
          decoration: BoxDecoration(
            color: selected ? color : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: selected ? color : color.withValues(alpha: 0.22)),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: selected ? 0.28 : 0.1),
                blurRadius: selected ? 14 : 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            children: [
              Icon(icon, color: selected ? Colors.white : color, size: 22),
              const SizedBox(height: 6),
              Text(
                '$count',
                style: TextStyle(
                  color: selected ? Colors.white : color,
                  fontWeight: FontWeight.w900,
                  fontSize: 20,
                  height: 1,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: selected ? Colors.white : KjaColors.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                ),
              ),
              Text(
                hint,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: selected ? Colors.white.withValues(alpha: 0.9) : KjaColors.soft,
                  fontWeight: FontWeight.w600,
                  fontSize: 9,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

({String key, String label, String hint, Color color, IconData icon})? _attendanceStatus(String status) {
  for (final row in _AttendancePageState._statuses) {
    if (row.key == status) return row;
  }
  return null;
}

class _AttendanceDayCard extends StatelessWidget {
  const _AttendanceDayCard({required this.day});

  final AttendanceDay day;

  @override
  Widget build(BuildContext context) {
    final meta = _attendanceStatus(day.status);
    final color = meta?.color ?? KjaColors.soft;
    final icon = meta?.icon ?? Icons.event_rounded;
    final label = meta?.label ?? day.status;
    final hint = meta?.hint ?? '';
    final date = parseDate(day.attendedOn);
    final weekday = weekdayName(date?.weekday ?? 1);

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: color.withValues(alpha: 0.2)),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  weekday,
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: KjaColors.ink),
                ),
                const SizedBox(height: 2),
                Text(
                  shortDate(day.attendedOn, withYear: true),
                  style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 12)),
              ),
              if (hint.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(hint, style: TextStyle(color: color.withValues(alpha: 0.85), fontWeight: FontWeight.w700, fontSize: 11)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _AttendanceEmpty extends StatelessWidget {
  const _AttendanceEmpty();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 28, 18, 28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.mint.withValues(alpha: 0.22)),
        boxShadow: [BoxShadow(color: KjaColors.mint.withValues(alpha: 0.1), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: const Column(
        children: [
          Icon(Icons.event_available_rounded, color: KjaColors.mint, size: 40),
          SizedBox(height: 10),
          Text(
            'No days yet',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: KjaColors.ink),
          ),
          SizedBox(height: 4),
          Text(
            'When your teacher takes the register, your days will show here.',
            textAlign: TextAlign.center,
            style: TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _FilterEmpty extends StatelessWidget {
  const _FilterEmpty({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 24, 18, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.line),
      ),
      child: Column(
        children: [
          const Icon(Icons.filter_alt_off_rounded, color: KjaColors.mute, size: 32),
          const SizedBox(height: 8),
          Text(
            'No $label days',
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: KjaColors.ink),
          ),
          const SizedBox(height: 4),
          const Text(
            'Tap Show all to see every day again.',
            textAlign: TextAlign.center,
            style: TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600),
          ),
        ],
      ),
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
            staffId: portal.classTeacher!.staffId,
            photoUrl: portal.classTeacher!.photoUrl ??
                PupilPhotoUrl.teacherProxy(
                  staffId: portal.classTeacher!.staffId,
                  photoPath: portal.classTeacher!.photoPath,
                ),
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
                final portrait = (teacher.photoPath ?? '').trim().isNotEmpty
                    ? (teacher.photoUrl ??
                        PupilPhotoUrl.teacherProxy(
                          staffId: teacher.staffId,
                          photoPath: teacher.photoPath,
                        ))
                    : null;
                return _SubjectTeacherChip(
                  name: teacher.label,
                  subject: teacher.subjectName ?? 'Subject',
                  color: color,
                  icon: subjectIcon(teacher.subjectName),
                  staffId: teacher.staffId,
                  photoUrl: portrait,
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
                        studentId: mate.id,
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
    this.staffId,
    this.photoUrl,
  });

  final String name;
  final String detail;
  final Color color;
  final Color wash;
  final IconData icon;
  final String? staffId;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: const EdgeInsets.all(14),
      color: wash.withValues(alpha: 0.55),
      child: Row(
        children: [
          InitialAvatar(
            name: name,
            color: color,
            radius: 26,
            photoUrl: photoUrl,
            studentId: staffId,
          ),
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
    this.staffId,
    this.photoUrl,
  });

  final String name;
  final String subject;
  final Color color;
  final IconData icon;
  final String? staffId;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final cached = PupilPhotoCache.bytes(staffId);
    final hasPhoto = (photoUrl ?? '').trim().isNotEmpty || (cached != null && cached.isNotEmpty);
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
          if (hasPhoto)
            InitialAvatar(
              name: name,
              color: color,
              radius: 18,
              photoUrl: photoUrl,
              studentId: staffId,
            )
          else
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
    this.studentId,
    this.onTap,
  });

  final String name;
  final String? house;
  final String? photoUrl;
  final String? studentId;
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
                  PupilFace(name: name, color: tone, radius: 28, photoUrl: photoUrl, studentId: studentId),
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

class ClubsPage extends StatefulWidget {
  const ClubsPage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  State<ClubsPage> createState() => _ClubsPageState();
}

class _ClubsPageState extends State<ClubsPage> {
  /// null = all, true = paid, false = to pay
  bool? _paidFilter;

  static const _clubColors = [
    KjaColors.coral,
    KjaColors.sky,
    KjaColors.mint,
    KjaColors.lilac,
    KjaColors.sun,
    KjaColors.rose,
  ];

  @override
  Widget build(BuildContext context) {
    final clubs = widget.portal.clubs;
    final paid = clubs.where((club) => club.paid).length;
    final unpaid = clubs.length - paid;
    final lead = clubs.isEmpty
        ? 'Ask your parents to choose clubs — then they will show up here.'
        : unpaid > 0
            ? 'You are in ${plural(clubs.length, 'club')}. Ask parents about payment for $unpaid.'
            : 'You are in ${plural(clubs.length, 'club')} and everything looks paid. Have fun!';

    final shown = [
      for (final club in clubs)
        if (_paidFilter == null || club.paid == _paidFilter) club,
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        _ClubsHero(
          lead: lead,
          clubCount: clubs.length,
          paidCount: paid,
        ),
        if (clubs.isNotEmpty) ...[
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _ClubFilterTile(
                  label: 'All',
                  count: clubs.length,
                  color: KjaColors.coral,
                  icon: Icons.extension_rounded,
                  selected: _paidFilter == null,
                  onTap: () => setState(() => _paidFilter = null),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ClubFilterTile(
                  label: 'Paid',
                  count: paid,
                  color: KjaColors.mint,
                  icon: Icons.check_circle_rounded,
                  selected: _paidFilter == true,
                  onTap: () => setState(() => _paidFilter = _paidFilter == true ? null : true),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ClubFilterTile(
                  label: 'To pay',
                  count: unpaid,
                  color: KjaColors.sun,
                  icon: Icons.payments_rounded,
                  selected: _paidFilter == false,
                  onTap: () => setState(() => _paidFilter = _paidFilter == false ? null : false),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: Text(
                _paidFilter == null
                    ? 'Your clubs'
                    : (_paidFilter! ? 'Paid clubs' : 'Still to pay'),
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: KjaColors.ink),
              ),
            ),
            if (_paidFilter != null)
              TextButton(
                onPressed: () => setState(() => _paidFilter = null),
                child: const Text('Show all', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
          ],
        ),
        const SizedBox(height: 10),
        if (clubs.isEmpty)
          const _ClubsEmpty()
        else if (shown.isEmpty)
          _ClubsFilterEmpty(paidFilter: _paidFilter!)
        else
          for (var i = 0; i < shown.length; i++) ...[
            _ClubCard(
              club: shown[i],
              color: _clubColors[i % _clubColors.length],
            ),
            if (i < shown.length - 1) const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _ClubsHero extends StatelessWidget {
  const _ClubsHero({
    required this.lead,
    required this.clubCount,
    required this.paidCount,
  });

  final String lead;
  final int clubCount;
  final int paidCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFB923C), KjaColors.coral, Color(0xFF9A3412)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: KjaColors.coral.withValues(alpha: 0.28), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.22),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
            ),
            child: const Icon(Icons.extension_rounded, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Clubs',
                  style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, height: 1.1),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    const _ClubHeroChip(label: 'After lessons'),
                    _ClubHeroChip(label: clubCount == 0 ? 'None yet' : plural(clubCount, 'club')),
                    if (clubCount > 0) _ClubHeroChip(label: '$paidCount paid'),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  lead,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.95), fontWeight: FontWeight.w700, fontSize: 13, height: 1.3),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ClubHeroChip extends StatelessWidget {
  const _ClubHeroChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}

class _ClubFilterTile extends StatelessWidget {
  const _ClubFilterTile({
    required this.label,
    required this.count,
    required this.color,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final Color color;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          decoration: BoxDecoration(
            color: selected ? color : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: selected ? color : color.withValues(alpha: 0.22)),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: selected ? 0.28 : 0.1),
                blurRadius: selected ? 12 : 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            children: [
              Icon(icon, color: selected ? Colors.white : color, size: 20),
              const SizedBox(height: 4),
              Text(
                '$count',
                style: TextStyle(color: selected ? Colors.white : color, fontWeight: FontWeight.w900, fontSize: 18, height: 1),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : KjaColors.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ClubCard extends StatelessWidget {
  const _ClubCard({required this.club, required this.color});

  final ClubMembership club;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final meeting = (club.meeting ?? '').trim();
    final campus = (club.campus ?? '').trim();
    final description = (club.description ?? '').trim();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withValues(alpha: 0.2)),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(clubIcon(club.title), color: color, size: 28),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      club.title,
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: KjaColors.ink, height: 1.15),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: (club.paid ? KjaColors.mint : KjaColors.sun).withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                club.paid ? Icons.check_circle_rounded : Icons.payments_rounded,
                                size: 14,
                                color: club.paid ? KjaColors.mint : KjaColors.sun,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                club.paid ? 'Paid' : 'To pay',
                                style: TextStyle(
                                  color: club.paid ? KjaColors.mint : KjaColors.sun,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (campus.isNotEmpty)
                          _ClubInfoPill(icon: Icons.location_on_rounded, label: campus, color: color),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (meeting.isNotEmpty) ...[
            const SizedBox(height: 12),
            _ClubInfoPill(icon: Icons.schedule_rounded, label: meeting, color: color),
          ],
          if (description.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              description,
              style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, height: 1.35, fontSize: 14),
            ),
          ],
        ],
      ),
    );
  }
}

class _ClubInfoPill extends StatelessWidget {
  const _ClubInfoPill({required this.icon, required this.label, required this.color});

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
        ],
      ),
    );
  }
}

class _ClubsEmpty extends StatelessWidget {
  const _ClubsEmpty();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 28, 18, 28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.coral.withValues(alpha: 0.22)),
        boxShadow: [BoxShadow(color: KjaColors.coral.withValues(alpha: 0.1), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: const Column(
        children: [
          Icon(Icons.extension_rounded, color: KjaColors.coral, size: 40),
          SizedBox(height: 10),
          Text(
            'No clubs yet',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: KjaColors.ink),
          ),
          SizedBox(height: 4),
          Text(
            'Ask your parents to choose clubs in the parent portal. They will appear here.',
            textAlign: TextAlign.center,
            style: TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _ClubsFilterEmpty extends StatelessWidget {
  const _ClubsFilterEmpty({required this.paidFilter});

  final bool paidFilter;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 24, 18, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.line),
      ),
      child: Column(
        children: [
          Icon(
            paidFilter ? Icons.check_circle_outline_rounded : Icons.payments_outlined,
            color: KjaColors.mute,
            size: 32,
          ),
          const SizedBox(height: 8),
          Text(
            paidFilter ? 'No paid clubs' : 'Nothing left to pay',
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: KjaColors.ink),
          ),
          const SizedBox(height: 4),
          const Text(
            'Tap Show all to see every club again.',
            textAlign: TextAlign.center,
            style: TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600),
          ),
        ],
      ),
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
