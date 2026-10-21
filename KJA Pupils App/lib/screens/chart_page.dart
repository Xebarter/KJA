import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ChartPage extends StatelessWidget {
  const ChartPage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  Widget build(BuildContext context) {
    final attendance = portal.attendance;
    final homework = portal.homework;
    final done = homework.where((row) => row.done).length;
    final open = homework.length - done;
    final latest = portal.reports.isEmpty ? null : portal.reports.first;
    final scored = latest?.lines.where((line) => line.percent != null).toList() ?? [];
    final history = portal.reports.where((card) => card.percent != null).toList().reversed.toList();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        PageHero(
          kicker: portal.termLabel ?? 'This term',
          title: 'Chart',
          lead: latest?.percent == null
              ? 'Attendance, homework and report marks, drawn so you can see how the term is going.'
              : 'Your latest report is about ${latest!.percent!.round()}%. The bars below show each subject.',
          icon: Icons.bar_chart_rounded,
          colors: const [Color(0xFF1E3A8A), KjaColors.navy, KjaColors.sky],
          footer: Row(
            children: [
              CountChip(label: 'In school', value: attendance.total == 0 ? '—' : '${attendance.percent}%'),
              const SizedBox(width: 8),
              CountChip(label: 'Homework done', value: homework.isEmpty ? '—' : '$done/${homework.length}'),
              const SizedBox(width: 8),
              CountChip(label: 'Reports', value: '${portal.reports.length}'),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const SectionTitle(title: 'Attendance'),
        if (attendance.total == 0)
          const EmptyNote(icon: Icons.fact_check_rounded, message: 'Your days will appear here after teachers take the register.')
        else
          SoftCard(
            child: Column(
              children: [
                SizedBox(
                  height: 210,
                  child: PieChart(
                    PieChartData(
                      centerSpaceRadius: 52,
                      sectionsSpace: 3,
                      sections: [
                        if (attendance.present > 0) _slice(attendance.present.toDouble(), KjaColors.mint, 'Present'),
                        if (attendance.late > 0) _slice(attendance.late.toDouble(), KjaColors.sun, 'Late'),
                        if (attendance.absent > 0) _slice(attendance.absent.toDouble(), KjaColors.rose, 'Absent'),
                        if (attendance.excused > 0) _slice(attendance.excused.toDouble(), KjaColors.sky, 'Excused'),
                      ],
                    ),
                  ),
                ),
                Text('${attendance.percent}% of register days', style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  runSpacing: 6,
                  alignment: WrapAlignment.center,
                  children: [
                    _Legend('Present', attendance.present, KjaColors.mint),
                    _Legend('Late', attendance.late, KjaColors.sun),
                    _Legend('Absent', attendance.absent, KjaColors.rose),
                    _Legend('Excused', attendance.excused, KjaColors.sky),
                  ],
                ),
              ],
            ),
          ),
        const SizedBox(height: 18),
        const SectionTitle(title: 'Homework'),
        if (homework.isEmpty)
          const EmptyNote(icon: Icons.menu_book_rounded, message: 'Homework charts appear once your teachers publish work.')
        else
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$done done · $open still open', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    minHeight: 14,
                    value: homework.isEmpty ? 0 : done / homework.length,
                    backgroundColor: KjaColors.line,
                    color: KjaColors.mint,
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  height: 160,
                  child: BarChart(
                    BarChartData(
                      maxY: (homework.length).toDouble().clamp(1, 999),
                      gridData: const FlGridData(show: false),
                      borderData: FlBorderData(show: false),
                      titlesData: FlTitlesData(
                        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            interval: 1,
                            getTitlesWidget: (value, meta) {
                              const labels = ['Done', 'Open', 'Overdue'];
                              final index = value.toInt();
                              if (index < 0 || index >= labels.length) return const SizedBox.shrink();
                              return Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(labels[index], style: const TextStyle(fontSize: 12)),
                              );
                            },
                          ),
                        ),
                      ),
                      barGroups: [
                        _bar(0, done.toDouble(), KjaColors.mint),
                        _bar(1, open.toDouble(), KjaColors.sky),
                        _bar(
                          2,
                          homework.where((row) => !row.done && row.dueOn.compareTo(todayYmd()) < 0).length.toDouble(),
                          KjaColors.rose,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 18),
        SectionTitle(title: latest == null ? 'Subject marks' : latest.term),
        if (scored.isEmpty)
          const EmptyNote(icon: Icons.star_rounded, message: 'When a report is published, each subject will grow a bar here.')
        else
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (latest?.overallGrade != null)
                  Text(
                    'Grade ${latest!.overallGrade}${latest.overallAggregate == null ? '' : ' · aggregate ${latest.overallAggregate}'}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 220,
                  child: BarChart(
                    BarChartData(
                      maxY: 100,
                      gridData: const FlGridData(drawVerticalLine: false),
                      borderData: FlBorderData(show: false),
                      titlesData: FlTitlesData(
                        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 28,
                            getTitlesWidget: (value, meta) => Text(value.toInt().toString(), style: const TextStyle(fontSize: 10, color: KjaColors.soft)),
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
                                child: Text(_short(scored[index].subjectName), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
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
                              const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                            );
                          },
                        ),
                      ),
                      barGroups: [
                        for (var i = 0; i < scored.length; i++)
                          _bar(i, scored[i].percent!, subjectColor(scored[i].subjectName)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        if (history.length > 1) ...[
          const SizedBox(height: 18),
          const SectionTitle(title: 'Report by report'),
          SoftCard(
            child: SizedBox(
              height: 180,
              child: LineChart(
                LineChartData(
                  minY: 0,
                  maxY: 100,
                  gridData: const FlGridData(drawVerticalLine: false),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28)),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        getTitlesWidget: (value, meta) {
                          final index = value.toInt();
                          if (index < 0 || index >= history.length) return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(history[index].term.replaceAll('Term ', 'T'), style: const TextStyle(fontSize: 11)),
                          );
                        },
                      ),
                    ),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      isCurved: true,
                      color: KjaColors.rose,
                      barWidth: 4,
                      dotData: const FlDotData(show: true),
                      spots: [
                        for (var i = 0; i < history.length; i++) FlSpot(i.toDouble(), history[i].percent!),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  PieChartSectionData _slice(double value, Color color, String title) {
    return PieChartSectionData(
      value: value,
      color: color,
      title: '',
      radius: 46,
    );
  }

  BarChartGroupData _bar(int x, double y, Color color) {
    return BarChartGroupData(
      x: x,
      barRods: [
        BarChartRodData(toY: y, color: color, width: 22, borderRadius: BorderRadius.circular(8)),
      ],
    );
  }

  String _short(String name) {
    if (name.length <= 4) return name;
    final words = name.split(' ');
    if (words.length > 1) return words.map((word) => word.isEmpty ? '' : word[0]).join().toUpperCase();
    return name.substring(0, 3);
  }
}

class _Legend extends StatelessWidget {
  const _Legend(this.label, this.count, this.color);
  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text('$label $count', style: const TextStyle(fontSize: 12, color: KjaColors.soft)),
      ],
    );
  }
}
