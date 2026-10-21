import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class HomeworkPage extends StatefulWidget {
  const HomeworkPage({super.key, required this.portal, required this.controller});

  final PortalSnapshot portal;
  final PortalController controller;

  @override
  State<HomeworkPage> createState() => _HomeworkPageState();
}

class _HomeworkPageState extends State<HomeworkPage> {
  var _filter = 'open';
  String? _busyId;
  String? _error;

  Future<void> _toggle(HomeworkItem item) async {
    setState(() {
      _busyId = item.id;
      _error = null;
    });
    final error = await widget.controller.setHomeworkDone(item, !item.done);
    if (!mounted) return;
    setState(() {
      _busyId = null;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final today = todayYmd();
    final items = widget.portal.homework;
    final open = items.where((row) => !row.done).toList();
    final done = items.where((row) => row.done).toList();
    final overdue = open.where((row) => row.dueOn.compareTo(today) < 0).length;
    final dueToday = open.where((row) => row.dueOn == today).length;
    final visible = items.where((row) {
      if (_filter == 'done') return row.done;
      if (_filter == 'all') return true;
      return !row.done;
    }).toList();

    final cheer = overdue > 0
        ? 'Start with the overdue ones — you can do it!'
        : dueToday > 0
            ? 'A few things are due today. Steady work.'
            : open.isEmpty
                ? 'All caught up. Brilliant!'
                : 'One step at a time.';

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        _Header(cheer: cheer, open: open.length, dueToday: dueToday, done: done.length, overdue: overdue),
        const SizedBox(height: 14),
        _FilterRow(
          filter: _filter,
          openCount: open.length,
          doneCount: done.length,
          allCount: items.length,
          onChanged: (value) => setState(() => _filter = value),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!, style: const TextStyle(color: KjaColors.rose, fontWeight: FontWeight.w600)),
        ],
        const SizedBox(height: 14),
        if (visible.isEmpty)
          EmptyNote(
            icon: Icons.emoji_events_rounded,
            message: _filter == 'done' ? 'Finished work will show here.' : 'Nothing here right now. Enjoy the break!',
          )
        else
          for (final row in visible)
            _HomeworkCard(
              item: row,
              today: today,
              busy: _busyId == row.id,
              onToggle: () => _toggle(row),
            ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.cheer,
    required this.open,
    required this.dueToday,
    required this.done,
    required this.overdue,
  });

  final String cheer;
  final int open;
  final int dueToday;
  final int done;
  final int overdue;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.line),
        boxShadow: [
          BoxShadow(color: KjaColors.sky.withValues(alpha: 0.08), blurRadius: 18, offset: const Offset(0, 8)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ToneIcon(icon: Icons.auto_stories_rounded, tone: Tone.sky, size: 42, iconSize: 22, active: true),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  'Homework',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.4, color: KjaColors.ink),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(cheer, style: const TextStyle(color: KjaColors.soft, height: 1.35, fontSize: 14)),
          const SizedBox(height: 14),
          Row(
            children: [
              _StatPill(label: 'To do', value: '$open', tone: Tone.sky),
              const SizedBox(width: 8),
              _StatPill(
                label: overdue > 0 ? 'Late' : 'Today',
                value: '${overdue > 0 ? overdue : dueToday}',
                tone: overdue > 0 ? Tone.coral : Tone.sun,
              ),
              const SizedBox(width: 8),
              _StatPill(label: 'Done', value: '$done', tone: Tone.mint),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatPill extends StatelessWidget {
  const _StatPill({required this.label, required this.value, required this.tone});

  final String label;
  final String value;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: tone.wash,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(color: tone.ink, fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: tone.ink.withValues(alpha: 0.85), fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.filter,
    required this.openCount,
    required this.doneCount,
    required this.allCount,
    required this.onChanged,
  });

  final String filter;
  final int openCount;
  final int doneCount;
  final int allCount;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _FilterChip(label: 'To do', count: openCount, selected: filter == 'open', tone: Tone.sky, onTap: () => onChanged('open')),
        const SizedBox(width: 8),
        _FilterChip(label: 'Done', count: doneCount, selected: filter == 'done', tone: Tone.mint, onTap: () => onChanged('done')),
        const SizedBox(width: 8),
        _FilterChip(label: 'All', count: allCount, selected: filter == 'all', tone: Tone.lilac, onTap: () => onChanged('all')),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.tone,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final Tone tone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 8),
            decoration: BoxDecoration(
              color: selected ? tone.ink : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: selected ? tone.ink : KjaColors.line),
              boxShadow: selected
                  ? [BoxShadow(color: tone.ink.withValues(alpha: 0.22), blurRadius: 10, offset: const Offset(0, 4))]
                  : null,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: selected ? Colors.white : KjaColors.ink,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: selected ? Colors.white.withValues(alpha: 0.22) : tone.wash,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(
                      color: selected ? Colors.white : tone.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard({
    required this.item,
    required this.today,
    required this.busy,
    required this.onToggle,
  });

  final HomeworkItem item;
  final String today;
  final bool busy;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final late = !item.done && item.dueOn.compareTo(today) < 0;
    final dueSoon = !item.done && !late && item.dueOn == today;
    final color = subjectColor(item.subjectName);
    final dueLabel = late
        ? 'Overdue · ${shortDate(item.dueOn)}'
        : dueSoon
            ? 'Due today'
            : 'Due ${shortDate(item.dueOn)}';

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: busy ? null : onToggle,
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: late ? KjaColors.coral.withValues(alpha: 0.35) : KjaColors.line),
              boxShadow: [
                BoxShadow(color: color.withValues(alpha: 0.08), blurRadius: 14, offset: const Offset(0, 6)),
              ],
            ),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    width: 7,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: item.done
                            ? const [KjaColors.mint, Color(0xFF34D399)]
                            : [color, color.withValues(alpha: 0.75)],
                      ),
                      borderRadius: const BorderRadius.horizontal(left: Radius.circular(22)),
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(
                                  color: (item.done ? KjaColors.mint : color).withValues(alpha: 0.14),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Icon(
                                  item.done ? Icons.check_rounded : subjectIcon(item.subjectName),
                                  color: item.done ? KjaColors.mintDeep : color,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      item.title,
                                      style: TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16,
                                        height: 1.2,
                                        decoration: item.done ? TextDecoration.lineThrough : null,
                                        color: item.done ? KjaColors.soft : KjaColors.ink,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      item.subjectName ?? 'Subject',
                                      style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 13),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          if ((item.instructions ?? '').trim().isNotEmpty) ...[
                            const SizedBox(height: 10),
                            Text(
                              item.instructions!.trim(),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: KjaColors.soft, height: 1.4, fontSize: 14),
                            ),
                          ],
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: late
                                      ? KjaColors.coralWash
                                      : dueSoon
                                          ? KjaColors.sunWash
                                          : item.done
                                              ? KjaColors.mintWash
                                              : KjaColors.skyWash,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  item.done ? 'Finished' : dueLabel,
                                  style: TextStyle(
                                    color: late
                                        ? KjaColors.coralDeep
                                        : dueSoon
                                            ? KjaColors.sunDeep
                                            : item.done
                                                ? KjaColors.mintDeep
                                                : KjaColors.skyDeep,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                              const Spacer(),
                              FilledButton(
                                onPressed: busy ? null : onToggle,
                                style: FilledButton.styleFrom(
                                  backgroundColor: item.done ? KjaColors.soft : KjaColors.mint,
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(0, 40),
                                  padding: const EdgeInsets.symmetric(horizontal: 14),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                                  elevation: 0,
                                ),
                                child: Text(
                                  busy ? '…' : (item.done ? 'Undo' : 'Done'),
                                  style: const TextStyle(fontWeight: FontWeight.w800),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
