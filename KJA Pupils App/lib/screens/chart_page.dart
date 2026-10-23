import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';

class ChartPage extends StatelessWidget {
  const ChartPage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  Widget build(BuildContext context) {
    final attendance = portal.attendance;
    final homework = portal.homework;
    final done = homework.where((row) => row.done).length;
    final open = homework.length - done;
    final overdue = homework.where((row) => !row.done && row.dueOn.compareTo(todayYmd()) < 0).length;
    final latest = portal.reports.isEmpty ? null : portal.reports.first;
    final scored = latest?.lines.where((line) => line.percent != null).toList() ?? <ReportLine>[];
    final history = portal.reports.where((card) => card.percent != null).toList().reversed.toList();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        _ChartHero(
          termLabel: portal.termLabel ?? 'This term',
          reportPercent: latest?.percent?.round(),
          attendancePercent: attendance.total == 0 ? null : attendance.percent,
          homeworkDone: homework.isEmpty ? null : done,
          homeworkTotal: homework.isEmpty ? null : homework.length,
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _SnapshotTile(
                label: 'In school',
                value: attendance.total == 0 ? '—' : '${attendance.percent}%',
                hint: attendance.total == 0 ? 'No days yet' : plural(attendance.total, 'day'),
                color: KjaColors.mint,
                icon: Icons.fact_check_rounded,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _SnapshotTile(
                label: 'Homework',
                value: homework.isEmpty ? '—' : '$done/${homework.length}',
                hint: homework.isEmpty ? 'None yet' : (open == 0 ? 'All done!' : '$open left'),
                color: KjaColors.sky,
                icon: Icons.auto_stories_rounded,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _SnapshotTile(
                label: 'Report',
                value: latest?.percent == null ? '—' : '${latest!.percent!.round()}%',
                hint: latest == null ? 'None yet' : latest.term,
                color: KjaColors.sun,
                icon: Icons.emoji_events_rounded,
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        const _SectionLabel('Attendance'),
        const SizedBox(height: 10),
        if (attendance.total == 0)
          const _EmptyCard(
            icon: Icons.fact_check_rounded,
            color: KjaColors.mint,
            title: 'No register yet',
            lead: 'Your days will appear here after teachers take the register.',
          )
        else
          _AttendanceCard(attendance: attendance),
        const SizedBox(height: 18),
        const _SectionLabel('Homework'),
        const SizedBox(height: 10),
        if (homework.isEmpty)
          const _EmptyCard(
            icon: Icons.menu_book_rounded,
            color: KjaColors.sky,
            title: 'No homework yet',
            lead: 'When teachers publish work, your progress will show here.',
          )
        else
          _HomeworkCard(done: done, open: open, overdue: overdue, total: homework.length),
        const SizedBox(height: 18),
        _SectionLabel(latest == null ? 'Subjects' : latest.term),
        const SizedBox(height: 10),
        if (scored.isEmpty)
          const _EmptyCard(
            icon: Icons.star_rounded,
            color: KjaColors.sun,
            title: 'No marks yet',
            lead: 'When a report is published, each subject will grow a bar here.',
          )
        else
          _SubjectsCard(latest: latest!, scored: scored),
        if (history.length > 1) ...[
          const SizedBox(height: 18),
          const _SectionLabel('Report by report'),
          const SizedBox(height: 10),
          _HistoryCard(history: history),
        ],
      ],
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

class _ChartHero extends StatelessWidget {
  const _ChartHero({
    required this.termLabel,
    required this.reportPercent,
    required this.attendancePercent,
    required this.homeworkDone,
    required this.homeworkTotal,
  });

  final String termLabel;
  final int? reportPercent;
  final int? attendancePercent;
  final int? homeworkDone;
  final int? homeworkTotal;

  @override
  Widget build(BuildContext context) {
    final lead = reportPercent == null
        ? 'See how school is going — attendance, homework, and marks in one place.'
        : 'Your latest report is about $reportPercent%. Look at the colourful charts below!';

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF60A5FA), KjaColors.sky, Color(0xFF1E3A8A)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: KjaColors.sky.withValues(alpha: 0.28), blurRadius: 16, offset: const Offset(0, 6)),
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
            child: const Icon(Icons.bar_chart_rounded, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'My chart',
                  style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, height: 1.1),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _HeroChip(label: termLabel),
                    if (attendancePercent != null) _HeroChip(label: '$attendancePercent% in school'),
                    if (homeworkDone != null && homeworkTotal != null) _HeroChip(label: '$homeworkDone/$homeworkTotal homework'),
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

class _SnapshotTile extends StatelessWidget {
  const _SnapshotTile({
    required this.label,
    required this.value,
    required this.hint,
    required this.color,
    required this.icon,
  });

  final String label;
  final String value;
  final String hint;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.2)),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 6),
          Text(value, style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 18, height: 1)),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: KjaColors.ink)),
          Text(
            hint,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 10, color: KjaColors.soft),
          ),
        ],
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.lead,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String lead;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 24, 18, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withValues(alpha: 0.2)),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.1), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 36),
          const SizedBox(height: 8),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17, color: KjaColors.ink)),
          const SizedBox(height: 4),
          Text(
            lead,
            textAlign: TextAlign.center,
            style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _AttendanceCard extends StatelessWidget {
  const _AttendanceCard({required this.attendance});

  final AttendanceSummary attendance;

  @override
  Widget build(BuildContext context) {
    final slices = <({double value, Color color, String label, int count})>[
      if (attendance.present > 0) (value: attendance.present.toDouble(), color: KjaColors.mint, label: 'Present', count: attendance.present),
      if (attendance.late > 0) (value: attendance.late.toDouble(), color: KjaColors.sun, label: 'Late', count: attendance.late),
      if (attendance.absent > 0) (value: attendance.absent.toDouble(), color: KjaColors.rose, label: 'Absent', count: attendance.absent),
      if (attendance.excused > 0) (value: attendance.excused.toDouble(), color: KjaColors.sky, label: 'Excused', count: attendance.excused),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.mint.withValues(alpha: 0.18)),
        boxShadow: [BoxShadow(color: KjaColors.mint.withValues(alpha: 0.1), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(
        children: [
          SizedBox(
            height: 200,
            child: Stack(
              alignment: Alignment.center,
              children: [
                PieChart(
                  PieChartData(
                    centerSpaceRadius: 58,
                    sectionsSpace: 3,
                    sections: [
                      for (final slice in slices)
                        PieChartSectionData(
                          value: slice.value,
                          color: slice.color,
                          title: '',
                          radius: 48,
                        ),
                    ],
                  ),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${attendance.percent}%',
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 28, color: KjaColors.ink, height: 1),
                    ),
                    const Text(
                      'in school',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: KjaColors.soft),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              for (final slice in slices)
                _LegendPill(label: slice.label, count: slice.count, color: slice.color),
            ],
          ),
        ],
      ),
    );
  }
}

class _LegendPill extends StatelessWidget {
  const _LegendPill({required this.label, required this.count, required this.color});

  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text('$label $count', style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
        ],
      ),
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard({
    required this.done,
    required this.open,
    required this.overdue,
    required this.total,
  });

  final int done;
  final int open;
  final int overdue;
  final int total;

  @override
  Widget build(BuildContext context) {
    final progress = total == 0 ? 0.0 : done / total;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.sky.withValues(alpha: 0.18)),
        boxShadow: [BoxShadow(color: KjaColors.sky.withValues(alpha: 0.1), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  open == 0 ? 'All homework done!' : '$done done · $open still open',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: KjaColors.ink),
                ),
              ),
              Text(
                '${(progress * 100).round()}%',
                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: KjaColors.mint),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              minHeight: 14,
              value: progress,
              backgroundColor: KjaColors.sky.withValues(alpha: 0.12),
              color: KjaColors.mint,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _HwStat(label: 'Done', count: done, color: KjaColors.mint, icon: Icons.check_circle_rounded)),
              const SizedBox(width: 8),
              Expanded(child: _HwStat(label: 'Open', count: open, color: KjaColors.sky, icon: Icons.pending_rounded)),
              const SizedBox(width: 8),
              Expanded(child: _HwStat(label: 'Late', count: overdue, color: KjaColors.rose, icon: Icons.alarm_rounded)),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 140,
            child: BarChart(
              BarChartData(
                maxY: total.toDouble().clamp(1, 999),
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (value, meta) {
                        const labels = ['Done', 'Open', 'Late'];
                        final index = value.toInt();
                        if (index < 0 || index >= labels.length) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(labels[index], style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                        );
                      },
                    ),
                  ),
                ),
                barGroups: [
                  _bar(0, done.toDouble(), KjaColors.mint),
                  _bar(1, open.toDouble(), KjaColors.sky),
                  _bar(2, overdue.toDouble(), KjaColors.rose),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  BarChartGroupData _bar(int x, double y, Color color) {
    return BarChartGroupData(
      x: x,
      barRods: [
        BarChartRodData(toY: y, color: color, width: 28, borderRadius: BorderRadius.circular(10)),
      ],
    );
  }
}

class _HwStat extends StatelessWidget {
  const _HwStat({
    required this.label,
    required this.count,
    required this.color,
    required this.icon,
  });

  final String label;
  final int count;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 4),
          Text('$count', style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 18, height: 1)),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 11)),
        ],
      ),
    );
  }
}

class _SubjectsCard extends StatelessWidget {
  const _SubjectsCard({required this.latest, required this.scored});

  final ReportCard latest;
  final List<ReportLine> scored;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.sun.withValues(alpha: 0.18)),
        boxShadow: [BoxShadow(color: KjaColors.sun.withValues(alpha: 0.1), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (latest.overallGrade != null || latest.percent != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (latest.percent != null)
                    _Tag(label: 'About ${latest.percent!.round()}%', color: KjaColors.sun),
                  if (latest.overallGrade != null)
                    _Tag(label: 'Grade ${latest.overallGrade}', color: KjaColors.lilac),
                  if (latest.overallAggregate != null)
                    _Tag(label: 'Agg ${latest.overallAggregate}', color: KjaColors.sky),
                ],
              ),
            ),
          for (final line in scored) ...[
            _SubjectRow(line: line),
            const SizedBox(height: 10),
          ],
          const SizedBox(height: 4),
          SizedBox(
            height: 200,
            child: BarChart(
              BarChartData(
                maxY: 100,
                gridData: const FlGridData(drawVerticalLine: false, horizontalInterval: 25),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 28,
                      interval: 25,
                      getTitlesWidget: (value, meta) => Text(
                        value.toInt().toString(),
                        style: const TextStyle(fontSize: 10, color: KjaColors.soft, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (value, meta) {
                        final index = value.toInt();
                        if (index < 0 || index >= scored.length) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            _short(scored[index].subjectName),
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipItem: (group, groupIndex, rod, rodIndex) {
                      final line = scored[group.x.toInt()];
                      final grade = line.grade == null ? '' : ' ${line.grade}';
                      return BarTooltipItem(
                        '${line.subjectName}\n${rod.toY.round()}%$grade',
                        const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
                      );
                    },
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < scored.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: scored[i].percent!,
                          color: subjectColor(scored[i].subjectName),
                          width: 22,
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _short(String name) {
    if (name.length <= 4) return name;
    final words = name.split(' ');
    if (words.length > 1) return words.map((word) => word.isEmpty ? '' : word[0]).join().toUpperCase();
    return name.substring(0, 3);
  }
}

class _SubjectRow extends StatelessWidget {
  const _SubjectRow({required this.line});

  final ReportLine line;

  @override
  Widget build(BuildContext context) {
    final color = subjectColor(line.subjectName);
    final percent = line.percent ?? 0;

    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(subjectIcon(line.subjectName), color: color, size: 18),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      line.subjectName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: KjaColors.ink),
                    ),
                  ),
                  Text(
                    line.grade ?? '${percent.round()}%',
                    style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 13),
                  ),
                ],
              ),
              const SizedBox(height: 5),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  minHeight: 8,
                  value: (percent / 100).clamp(0, 1),
                  color: color,
                  backgroundColor: color.withValues(alpha: 0.12),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.history});

  final List<ReportCard> history;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: KjaColors.lilac.withValues(alpha: 0.18)),
        boxShadow: [BoxShadow(color: KjaColors.lilac.withValues(alpha: 0.1), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(
        children: [
          SizedBox(
            height: 180,
            child: LineChart(
              LineChartData(
                minY: 0,
                maxY: 100,
                gridData: const FlGridData(drawVerticalLine: false, horizontalInterval: 25),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 28,
                      interval: 25,
                      getTitlesWidget: (value, meta) => Text(
                        value.toInt().toString(),
                        style: const TextStyle(fontSize: 10, color: KjaColors.soft, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (value, meta) {
                        final index = value.toInt();
                        if (index < 0 || index >= history.length) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            history[index].term.replaceAll('Term ', 'T'),
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                lineBarsData: [
                  LineChartBarData(
                    isCurved: true,
                    color: KjaColors.lilac,
                    barWidth: 4,
                    dotData: FlDotData(
                      show: true,
                      getDotPainter: (spot, percent, bar, index) => FlDotCirclePainter(
                        radius: 5,
                        color: Colors.white,
                        strokeWidth: 3,
                        strokeColor: KjaColors.lilac,
                      ),
                    ),
                    belowBarData: BarAreaData(
                      show: true,
                      color: KjaColors.lilac.withValues(alpha: 0.12),
                    ),
                    spots: [
                      for (var i = 0; i < history.length; i++) FlSpot(i.toDouble(), history[i].percent!),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final card in history)
                _Tag(label: '${card.term.replaceAll('Term ', 'T')} · ${card.percent!.round()}%', color: KjaColors.lilac),
            ],
          ),
        ],
      ),
    );
  }
}
