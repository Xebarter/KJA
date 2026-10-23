import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../navigation.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key, required this.portal, required this.open});

  final PortalSnapshot portal;
  final ValueChanged<AppDestination> open;

  @override
  Widget build(BuildContext context) {
    final today = todayYmd();
    final openHomework = portal.homework.where((row) => !row.done).toList()
      ..sort((a, b) {
        final aLate = a.dueOn.compareTo(today) < 0;
        final bLate = b.dueOn.compareTo(today) < 0;
        if (aLate != bLate) return aLate ? -1 : 1;
        return a.dueOn.compareTo(b.dueOn);
      });
    final overdue = openHomework.where((row) => row.dueOn.compareTo(today) < 0).length;
    final lessons = portal.lessonsToday;
    final name = firstNameOf(portal.displayName);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        if (portal.preview)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text('Sample pupil', style: TextStyle(color: KjaColors.soft.withValues(alpha: 0.9), fontWeight: FontWeight.w700)),
          ),
        _Hello(
          name: name,
          classLabel: portal.classLabel,
          house: portal.pupil?.house,
          photoUrl: portal.photoUrl ?? portal.faceUrl(portal.pupil?.id),
          studentId: portal.pupil?.id,
          displayName: portal.displayName,
        ),
        const SizedBox(height: 16),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.15,
          children: [
            _BigTile(
              label: 'Homework',
              icon: Icons.auto_stories_rounded,
              color: overdue > 0 ? KjaColors.rose : KjaColors.sky,
              badge: openHomework.isEmpty ? null : '${openHomework.length}',
              hint: openHomework.isEmpty ? 'Done!' : (overdue > 0 ? 'Overdue' : 'To do'),
              onTap: () => open(AppDestination.homework),
            ),
            _BigTile(
              label: 'Lessons',
              icon: Icons.grid_view_rounded,
              color: KjaColors.lilac,
              badge: lessons.isEmpty ? null : '${lessons.length}',
              hint: lessons.isEmpty ? 'Free day' : 'Today',
              onTap: () => open(AppDestination.timetable),
            ),
            _BigTile(
              label: 'Chat',
              icon: Icons.chat_rounded,
              color: KjaColors.mint,
              badge: portal.unreadMessages > 0 ? '${portal.unreadMessages}' : null,
              hint: portal.unreadMessages > 0 ? 'New' : 'Friends',
              onTap: () => open(AppDestination.messages),
            ),
            _BigTile(
              label: 'Notices',
              icon: Icons.notifications_active_rounded,
              color: KjaColors.sun,
              badge: portal.unreadNotices > 0 ? '${portal.unreadNotices}' : null,
              hint: portal.unreadNotices > 0 ? 'New' : 'School',
              onTap: () => open(AppDestination.notices),
            ),
          ],
        ),
        const SizedBox(height: 18),
        const _SectionLabel('Today'),
        const SizedBox(height: 8),
        if (lessons.isEmpty)
          const _QuietCard(icon: Icons.wb_sunny_rounded, color: KjaColors.sun, label: 'Free day')
        else
          SizedBox(
            height: 92,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: lessons.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final lesson = lessons[index];
                final color = subjectColor(lesson.subjectName);
                return _LessonBubble(
                  period: lesson.period,
                  subject: lesson.subjectName,
                  color: color,
                  onTap: () => open(AppDestination.timetable),
                );
              },
            ),
          ),
        const SizedBox(height: 18),
        Row(
          children: [
            const Expanded(child: _SectionLabel('Next')),
            if (openHomework.isNotEmpty)
              TextButton(
                onPressed: () => open(AppDestination.homework),
                child: const Text('See all', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
          ],
        ),
        const SizedBox(height: 4),
        if (openHomework.isEmpty)
          const _QuietCard(icon: Icons.celebration_rounded, color: KjaColors.mint, label: 'All done!')
        else
          for (final row in openHomework.take(3))
            _NextTask(
              title: row.title,
              subject: row.subjectName ?? 'Subject',
              due: row.dueOn == today
                  ? 'Today'
                  : row.dueOn.compareTo(today) < 0
                      ? 'Late'
                      : shortDate(row.dueOn),
              late: row.dueOn.compareTo(today) < 0,
              color: subjectColor(row.subjectName),
              onTap: () => open(AppDestination.homework),
            ),
        const SizedBox(height: 16),
        Row(
          children: [
            _Quick(label: 'Class', icon: Icons.groups_rounded, color: KjaColors.lilac, onTap: () => open(AppDestination.myClass)),
            _Quick(label: 'Clubs', icon: Icons.extension_rounded, color: KjaColors.coral, onTap: () => open(AppDestination.clubs)),
            _Quick(label: 'Calendar', icon: Icons.calendar_month_rounded, color: KjaColors.sky, onTap: () => open(AppDestination.calendar)),
            _Quick(label: 'Reports', icon: Icons.workspace_premium_rounded, color: KjaColors.rose, onTap: () => open(AppDestination.reports)),
          ],
        ),
      ],
    );
  }
}

class _Hello extends StatelessWidget {
  const _Hello({
    required this.name,
    required this.classLabel,
    required this.displayName,
    this.house,
    this.photoUrl,
    this.studentId,
  });

  final String name;
  final String displayName;
  final String classLabel;
  final String? house;
  final String? photoUrl;
  final String? studentId;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF38BDF8), KjaColors.sky, Color(0xFF0284C7)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [BoxShadow(color: KjaColors.sky.withValues(alpha: 0.28), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Row(
        children: [
          InitialAvatar(
            name: displayName,
            color: houseColor(house),
            radius: 26,
            photoUrl: photoUrl,
            studentId: studentId,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Hi, $name!',
                  style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, height: 1.1),
                ),
                if (classLabel.isNotEmpty || (house ?? '').isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (classLabel.isNotEmpty) _MiniChip(label: classLabel),
                      if ((house ?? '').isNotEmpty) _MiniChip(label: house!),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniChip extends StatelessWidget {
  const _MiniChip({required this.label});
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

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(text, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: KjaColors.ink));
  }
}

class _BigTile extends StatelessWidget {
  const _BigTile({
    required this.label,
    required this.icon,
    required this.color,
    required this.hint,
    required this.onTap,
    this.badge,
  });

  final String label;
  final IconData icon;
  final Color color;
  final String hint;
  final String? badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Ink(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: color.withValues(alpha: 0.18)),
            boxShadow: [BoxShadow(color: color.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 5))],
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(icon, color: color, size: 24),
                    ),
                    const Spacer(),
                    if (badge != null)
                      Container(
                        constraints: const BoxConstraints(minWidth: 28),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(99)),
                        alignment: Alignment.center,
                        child: Text(
                          badge!,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13),
                        ),
                      ),
                  ],
                ),
                const Spacer(),
                Text(label, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, height: 1.1)),
                const SizedBox(height: 2),
                Text(hint, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 13)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LessonBubble extends StatelessWidget {
  const _LessonBubble({
    required this.period,
    required this.subject,
    required this.color,
    required this.onTap,
  });

  final int period;
  final String subject;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          width: 108,
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withValues(alpha: 0.2)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
                child: Text('$period', style: TextStyle(color: color, fontWeight: FontWeight.w900)),
              ),
              const Spacer(),
              Text(
                subject,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, height: 1.15),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NextTask extends StatelessWidget {
  const _NextTask({
    required this.title,
    required this.subject,
    required this.due,
    required this.late,
    required this.color,
    required this.onTap,
  });

  final String title;
  final String subject;
  final String due;
  final bool late;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dueColor = late ? KjaColors.rose : color;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Ink(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: KjaColors.line),
            ),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
                  child: Icon(subjectIcon(subject), color: color, size: 22),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(subject, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
                      Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: dueColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
                  child: Text(due, style: TextStyle(color: dueColor, fontWeight: FontWeight.w900, fontSize: 12)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _QuietCard extends StatelessWidget {
  const _QuietCard({required this.icon, required this.color, required this.label});

  final IconData icon;
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 8),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 16)),
        ],
      ),
    );
  }
}

class _Quick extends StatelessWidget {
  const _Quick({required this.label, required this.icon, required this.color, required this.onTap});

  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Column(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(height: 6),
              Text(label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );
  }
}
