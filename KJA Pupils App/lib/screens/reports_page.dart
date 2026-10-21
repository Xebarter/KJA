import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  String? _openId;

  @override
  Widget build(BuildContext context) {
    final reports = widget.portal.reports;
    final open = reports.cast<ReportCard?>().where((card) => card?.id == _openId).cast<ReportCard>().toList();
    if (open.isNotEmpty) return _detail(open.first);
    final lead = reports.isEmpty
        ? 'When your teachers publish a report card, it will appear here for you to open.'
        : reports.length == 1
            ? 'You have one report ready. Open it to see how you are doing.'
            : 'You have ${reports.length} reports ready. Open one to celebrate your progress.';
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        PageHero(
          kicker: 'Your progress',
          title: 'Reports',
          lead: lead,
          icon: Icons.star_rounded,
          colors: const [Color(0xFF78350F), KjaColors.sun, Color(0xFFFDE68A)],
          footer: Row(
            children: [
              CountChip(label: reports.length == 1 ? 'Report' : 'Reports', value: '${reports.length}'),
              const SizedBox(width: 8),
              CountChip(label: 'Latest', value: reports.isEmpty ? '—' : 'Ready'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (reports.isEmpty)
          const EmptyNote(icon: Icons.star_outline_rounded, message: 'No published reports yet.')
        else
          for (var i = 0; i < reports.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.emoji_events_rounded, color: KjaColors.sun),
                  title: Text(reports[i].term, style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(
                    [
                      reports[i].classLabel,
                      if (reports[i].publishedAt != null) 'Published ${shortDate(reports[i].publishedAt, withYear: true)}',
                      if (i == 0) 'Newest',
                    ].join(' · '),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => setState(() => _openId = reports[i].id),
                ),
              ),
            ),
      ],
    );
  }

  Widget _detail(ReportCard card) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _openId = null),
            icon: const Icon(Icons.arrow_back_rounded),
            label: const Text('All reports'),
          ),
        ),
        Text(card.term, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
        Text(card.classLabel, style: const TextStyle(color: KjaColors.soft)),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (card.percent != null) _pill('About ${card.percent!.round()}%'),
            if (card.overallGrade != null) _pill('Grade ${card.overallGrade}'),
            if (card.overallAggregate != null) _pill('Aggregate ${card.overallAggregate}'),
            if (card.overallPosition != null) _pill('Position ${card.overallPosition}'),
            if (card.daysPresent != null) _pill('${card.daysPresent}${card.daysOpened == null ? '' : '/${card.daysOpened}'} days'),
            if ((card.conduct ?? '').isNotEmpty) _pill(card.conduct!),
          ],
        ),
        const SizedBox(height: 16),
        if (card.lines.isEmpty)
          const EmptyNote(icon: Icons.menu_book_rounded, message: 'Subject marks are not on this report yet.')
        else
          for (final line in card.lines)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(line.subjectName, style: const TextStyle(fontWeight: FontWeight.w800))),
                        if (line.grade != null) Text(line.grade!, style: TextStyle(color: subjectColor(line.subjectName), fontWeight: FontWeight.w800)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if (line.score != null) '${_trim(line.score!)}${line.maxScore == null ? '' : '/${_trim(line.maxScore!)}'}',
                        if (line.points != null) '${line.points} points',
                        if (line.position != null) 'position ${line.position}',
                      ].join(' · '),
                      style: const TextStyle(color: KjaColors.soft),
                    ),
                    if (line.percent != null) ...[
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(99),
                        child: LinearProgressIndicator(
                          minHeight: 8,
                          value: (line.percent! / 100).clamp(0, 1),
                          color: subjectColor(line.subjectName),
                          backgroundColor: KjaColors.line,
                        ),
                      ),
                    ],
                    for (final part in line.parts)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text('${part.label}: ${part.score == null ? '—' : _trim(part.score!)} (${_trim(part.share)}%)'),
                      ),
                    if ((line.comment ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(line.comment!),
                    ],
                  ],
                ),
              ),
            ),
        if ((card.classTeacherComment ?? '').isNotEmpty)
          _comment('Class teacher', card.classTeacherName, card.classTeacherComment!),
        if ((card.headComment ?? '').isNotEmpty) _comment('Head teacher', null, card.headComment!),
      ],
    );
  }

  Widget _pill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99), border: Border.all(color: KjaColors.line)),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700)),
    );
  }

  Widget _comment(String role, String? name, String body) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: SoftCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(role, style: const TextStyle(fontWeight: FontWeight.w800)),
            if ((name ?? '').isNotEmpty) Text(name!, style: const TextStyle(color: KjaColors.soft)),
            const SizedBox(height: 6),
            Text(body, style: const TextStyle(height: 1.35)),
          ],
        ),
      ),
    );
  }

  String _trim(double value) {
    if (value == value.roundToDouble()) return value.round().toString();
    return value.toStringAsFixed(1);
  }
}
