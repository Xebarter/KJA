import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../navigation.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class HomePage extends StatelessWidget {
  const HomePage({
    super.key,
    required this.portal,
    required this.open,
    required this.openPaper,
  });

  final TeacherSnapshot portal;
  final ValueChanged<AppDestination> open;
  final ValueChanged<Paper> openPaper;

  @override
  Widget build(BuildContext context) {
    final weekEnd = addDaysIso(portal.today, 7);
    final due = portal.homework
        .where(
          (row) =>
              row.dueOn.compareTo(portal.today) >= 0 &&
              row.dueOn.compareTo(weekEnd) <= 0,
        )
        .toList();
    final drafts = due.where((row) => !row.published).toList();
    final registers = [
      for (final post in portal.classes)
        _Register(
          post: post,
          pupils: portal.pupilsIn(post.classCode, post.stream).length,
          done: _done(post),
          closed: portal.registerClosed(post.classCode, post.stream),
        ),
    ];
    final waiting = registers
        .where(
          (row) => !row.closed && !(row.pupils > 0 && row.done >= row.pupils),
        )
        .toList();
    final upcoming = portal.dates
        .where((row) {
          final end = row.endsOn ?? row.startsOn;
          return end.compareTo(portal.today) >= 0 &&
              row.startsOn.compareTo(addDaysIso(portal.today, 14)) <= 0;
        })
        .take(5)
        .toList();

    final lead = portal.term == null
        ? 'There is no current term yet. Ask Accounts to open one.'
        : portal.subjects.isEmpty
            ? 'No subjects are assigned to you this term.'
            : waiting.isNotEmpty
                ? '${waiting.length} class${waiting.length == 1 ? '' : 'es'} still need today’s register.'
                : portal.openPapers.isNotEmpty
                    ? '${portal.openPapers.length} markbook${portal.openPapers.length == 1 ? '' : 's'} open on your subjects.'
                    : 'You are up to date for ${portal.term!.label}.';

    final todos = <Widget>[
      if (waiting.isNotEmpty)
        _Todo(
          icon: Icons.fact_check_rounded,
          tone: Tone.rose,
          title: waiting.length == 1
              ? 'Mark ${waiting.first.post.label}'
              : 'Registers waiting',
          note: waiting.length == 1
              ? '${waiting.first.done}/${waiting.first.pupils} pupils marked'
              : 'Finish attendance before the day closes',
          onTap: () => open(AppDestination.attendance),
        ),
      if (portal.openPapers.isNotEmpty)
        _Todo(
          icon: Icons.edit_note_rounded,
          tone: Tone.lilac,
          title: portal.openPapers.length == 1
              ? portal.openPapers.first.name
              : 'Open markbooks',
          note: portal.openPapers.length == 1
              ? '${portal.openPapers.first.subjectName} · ${portal.openPapers.first.classLabel}'
              : 'Enter scores while papers are open',
          onTap: () => portal.openPapers.length == 1
              ? openPaper(portal.openPapers.first)
              : open(AppDestination.assessments),
        ),
      if (drafts.isNotEmpty)
        _Todo(
          icon: Icons.menu_book_rounded,
          tone: Tone.sun,
          title: 'Homework drafts due soon',
          note: 'Publish so pupils can see the work',
          onTap: () => open(AppDestination.resources),
        )
      else if (due.isNotEmpty)
        _Todo(
          icon: Icons.menu_book_rounded,
          tone: Tone.sun,
          title: 'Homework due this week',
          note: due.first.title,
          onTap: () => open(AppDestination.resources),
        ),
    ];

    return DeskScroll(
      children: [
        PageIntro(
          eyebrow: longToday(),
          title: '${greeting()}, ${firstNameOf(portal.displayName)}',
          detail: lead,
          footer: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Pill(portal.roleLabel),
              if (portal.term != null) _Pill(portal.term!.label),
            ],
          ),
        ),
        const SectionTitle(title: 'Needs attention'),
        if (todos.isEmpty)
          const EmptyNote(
            icon: Icons.check_circle_rounded,
            title: 'All caught up',
            message: 'Nothing is waiting on your desk right now.',
          )
        else
          ...todos,
        const SectionTitle(title: 'Quick links'),
        Row(
          children: [
            Expanded(
              child: QuickTile(
                label: 'Assessments',
                icon: Icons.edit_note_rounded,
                tone: Tone.lilac,
                onTap: () => open(AppDestination.assessments),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: QuickTile(
                label: 'Resources',
                icon: Icons.menu_book_rounded,
                tone: Tone.sun,
                onTap: () => open(AppDestination.resources),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: QuickTile(
                label: portal.classTeacher ? 'Attendance' : 'Chat',
                icon: portal.classTeacher
                    ? Icons.fact_check_rounded
                    : Icons.forum_rounded,
                tone: portal.classTeacher ? Tone.rose : Tone.mint,
                onTap: () => open(
                  portal.classTeacher
                      ? AppDestination.attendance
                      : AppDestination.chat,
                ),
              ),
            ),
          ],
        ),
        const SectionTitle(title: 'Today'),
        Row(
          children: [
            Expanded(
              child: StatTile(
                label: 'Subjects',
                value: '${portal.subjects.length}',
                icon: Icons.school_rounded,
                tone: Tone.sky,
                onTap: () => open(AppDestination.performance),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatTile(
                label: 'Markbooks',
                value: '${portal.openPapers.length}',
                icon: Icons.edit_note_rounded,
                tone: Tone.lilac,
                onTap: () => open(AppDestination.assessments),
              ),
            ),
          ],
        ),
        Row(
          children: [
            Expanded(
              child: StatTile(
                label: 'Homework',
                value: '${due.length}',
                icon: Icons.menu_book_rounded,
                tone: Tone.sun,
                onTap: () => open(AppDestination.resources),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatTile(
                label: portal.classTeacher ? 'Registers' : 'Drafts',
                value: portal.classTeacher
                    ? (waiting.isEmpty && registers.isNotEmpty
                        ? 'Done'
                        : '${waiting.length}')
                    : '${portal.draftCount}',
                icon: portal.classTeacher
                    ? Icons.fact_check_rounded
                    : Icons.drafts_rounded,
                tone: portal.classTeacher ? Tone.rose : Tone.coral,
                onTap: () => open(
                  portal.classTeacher
                      ? AppDestination.attendance
                      : AppDestination.resources,
                ),
              ),
            ),
          ],
        ),
        if (portal.openPapers.isNotEmpty) ...[
          const SectionTitle(title: 'Open markbooks'),
          for (final paper in portal.openPapers.take(6))
            SoftCard(
              onTap: () => openPaper(paper),
              child: DeskRow(
                leading: ToneIcon(
                  icon: Icons.edit_note_rounded,
                  tone: Tone.lilac,
                  size: 40,
                  iconSize: 20,
                ),
                title: paper.name,
                subtitle: '${paper.subjectName} · ${paper.classLabel}',
                trailing: StatusChip(label: kindLabel(paper.kind), tone: Tone.lilac),
              ),
            ),
        ],
        if (due.isNotEmpty) ...[
          const SectionTitle(title: 'Due this week'),
          for (final item in due.take(5))
            SoftCard(
              onTap: () => open(AppDestination.resources),
              child: DeskRow(
                leading: ToneIcon(
                  icon: Icons.menu_book_rounded,
                  tone: item.published ? Tone.mint : Tone.sun,
                  size: 40,
                  iconSize: 20,
                ),
                title: item.title,
                subtitle: '${item.subjectName} · ${item.classLabel}',
                trailing: StatusChip(
                  label: shortDate(item.dueOn),
                  tone: item.published ? Tone.mint : Tone.sun,
                ),
              ),
            ),
        ],
        if (registers.isNotEmpty) ...[
          const SectionTitle(title: 'Today’s registers'),
          for (final row in registers)
            SoftCard(
              onTap: () => open(AppDestination.attendance),
              child: DeskRow(
                leading: ToneIcon(
                  icon: Icons.fact_check_rounded,
                  tone: row.closed || (row.pupils > 0 && row.done >= row.pupils)
                      ? Tone.mint
                      : Tone.rose,
                  size: 40,
                  iconSize: 20,
                ),
                title: row.post.label,
                subtitle: row.closed
                    ? 'Register closed'
                    : '${row.done}/${row.pupils} marked',
                trailing: StatusChip(
                  label: row.closed || (row.pupils > 0 && row.done >= row.pupils)
                      ? 'Done'
                      : 'Open',
                  tone: row.closed || (row.pupils > 0 && row.done >= row.pupils)
                      ? Tone.mint
                      : Tone.rose,
                ),
              ),
            ),
        ],
        if (portal.subjects.isNotEmpty) ...[
          const SectionTitle(title: 'Your subjects'),
          for (final post in portal.subjects.take(8))
            SoftCard(
              onTap: () => open(AppDestination.performance),
              child: DeskRow(
                leading: ToneIcon(
                  icon: Icons.bar_chart_rounded,
                  tone: Tone.sky,
                  size: 40,
                  iconSize: 20,
                ),
                title: post.subjectName,
                subtitle: classLabelOf(post.classCode, post.stream),
                trailing: const Icon(Icons.chevron_right_rounded, color: KjaColors.mute),
              ),
            ),
        ],
        if (upcoming.isNotEmpty) ...[
          const SectionTitle(title: 'Coming up'),
          for (final date in upcoming)
            SoftCard(
              onTap: () => open(AppDestination.calendar),
              child: DeskRow(
                leading: ToneIcon(
                  icon: Icons.event_rounded,
                  tone: Tone.sun,
                  size: 40,
                  iconSize: 20,
                ),
                title: date.title,
                subtitle: '${kindLabel(date.kind)} · ${date.scope}',
                trailing: StatusChip(label: shortDate(date.startsOn), tone: Tone.sun),
              ),
            ),
        ],
      ],
    );
  }

  int _done(ClassPost post) {
    var count = 0;
    for (final pupil in portal.pupilsIn(post.classCode, post.stream)) {
      if (portal.markFor(pupil.id) != null) count++;
    }
    return count;
  }
}

class _Register {
  const _Register({
    required this.post,
    required this.pupils,
    required this.done,
    required this.closed,
  });
  final ClassPost post;
  final int pupils;
  final int done;
  final bool closed;
}

class _Pill extends StatelessWidget {
  const _Pill(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _Todo extends StatelessWidget {
  const _Todo({
    required this.icon,
    required this.tone,
    required this.title,
    required this.note,
    required this.onTap,
  });

  final IconData icon;
  final Tone tone;
  final String title;
  final String note;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      onTap: onTap,
      child: Row(
        children: [
          ToneIcon(icon: icon, tone: tone, size: 44, iconSize: 22, active: true),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5),
                ),
                const SizedBox(height: 3),
                Text(
                  note,
                  style: const TextStyle(color: KjaColors.soft, fontSize: 13, height: 1.35),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: tone.ink.withValues(alpha: 0.55)),
        ],
      ),
    );
  }
}
