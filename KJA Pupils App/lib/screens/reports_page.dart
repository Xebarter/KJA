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
    ReportCard? open;
    for (final card in reports) {
      if (card.id == _openId) {
        open = card;
        break;
      }
    }
    if (open != null) return _ReportDetail(card: open, onBack: () => setState(() => _openId = null));

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        _ReportsHero(count: reports.length),
        const SizedBox(height: 18),
        const Text(
          'Your report cards',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: KjaColors.ink),
        ),
        const SizedBox(height: 10),
        if (reports.isEmpty)
          const _ReportsEmpty()
        else
          for (var i = 0; i < reports.length; i++) ...[
            _ReportListCard(
              card: reports[i],
              newest: i == 0,
              onOpen: () => setState(() => _openId = reports[i].id),
            ),
            if (i < reports.length - 1) const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _ReportsHero extends StatelessWidget {
  const _ReportsHero({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final lead = count == 0
        ? 'When teachers publish a report, it will shine here.'
        : count == 1
            ? 'You have 1 report ready. Tap to open it!'
            : 'You have $count reports ready. Open one to celebrate.';

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFBBF24), KjaColors.sun, Color(0xFFB45309)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: KjaColors.sun.withValues(alpha: 0.28), blurRadius: 16, offset: const Offset(0, 6)),
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
            child: const Icon(Icons.emoji_events_rounded, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Reports',
                  style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, height: 1.1),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _SunChip(label: count == 0 ? 'None yet' : plural(count, 'report')),
                    const _SunChip(label: 'Your progress'),
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

class _SunChip extends StatelessWidget {
  const _SunChip({required this.label});
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

class _ReportsEmpty extends StatelessWidget {
  const _ReportsEmpty();

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
          Icon(Icons.star_outline_rounded, color: KjaColors.sun, size: 40),
          SizedBox(height: 10),
          Text(
            'No reports yet',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: KjaColors.ink),
          ),
          SizedBox(height: 4),
          Text(
            'Published report cards will appear here for you to open and celebrate.',
            textAlign: TextAlign.center,
            style: TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _ReportListCard extends StatelessWidget {
  const _ReportListCard({
    required this.card,
    required this.newest,
    required this.onOpen,
  });

  final ReportCard card;
  final bool newest;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final percent = card.percent;
    final accent = newest ? KjaColors.sun : KjaColors.lilac;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(24),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: accent.withValues(alpha: 0.22)),
            boxShadow: [BoxShadow(color: accent.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 5))],
          ),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(newest ? Icons.emoji_events_rounded : Icons.workspace_premium_rounded, color: accent, size: 28),
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
                            card.term,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17, color: KjaColors.ink),
                          ),
                        ),
                        if (newest)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(99)),
                            child: const Text('NEW', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 10)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        card.classLabel,
                        if (card.publishedAt != null) shortDate(card.publishedAt, withYear: true),
                      ].where((part) => part.trim().isNotEmpty).join(' · '),
                      style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (percent != null) _MiniStat(label: '${percent.round()}%', color: accent),
                        if (card.overallGrade != null) _MiniStat(label: 'Grade ${card.overallGrade}', color: accent),
                        if (card.daysPresent != null)
                          _MiniStat(
                            label: card.daysOpened == null ? '${card.daysPresent} days' : '${card.daysPresent}/${card.daysOpened} days',
                            color: KjaColors.mint,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Icon(Icons.chevron_right_rounded, color: accent.withValues(alpha: 0.8)),
            ],
          ),
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 11)),
    );
  }
}

class _ReportDetail extends StatelessWidget {
  const _ReportDetail({required this.card, required this.onBack});

  final ReportCard card;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final percent = card.percent;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: onBack,
            style: TextButton.styleFrom(
              foregroundColor: KjaColors.ink,
              backgroundColor: KjaColors.sun.withValues(alpha: 0.12),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
            icon: const Icon(Icons.arrow_back_rounded),
            label: const Text('All reports', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ),
        const SizedBox(height: 10),
        _DetailHero(card: card, percent: percent),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (percent != null) _SummaryPill(icon: Icons.insights_rounded, label: 'About ${percent.round()}%', color: KjaColors.sun),
            if (card.overallGrade != null) _SummaryPill(icon: Icons.grade_rounded, label: 'Grade ${card.overallGrade}', color: KjaColors.lilac),
            if (card.overallAggregate != null) _SummaryPill(icon: Icons.tag_rounded, label: 'Aggregate ${card.overallAggregate}', color: KjaColors.sky),
            if (card.daysPresent != null)
              _SummaryPill(
                icon: Icons.fact_check_rounded,
                label: card.daysOpened == null ? '${card.daysPresent} days' : '${card.daysPresent}/${card.daysOpened} days',
                color: KjaColors.mint,
              ),
            if ((card.conduct ?? '').isNotEmpty) _SummaryPill(icon: Icons.favorite_rounded, label: card.conduct!, color: KjaColors.coral),
          ],
        ),
        const SizedBox(height: 18),
        const Text(
          'Subjects',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: KjaColors.ink),
        ),
        const SizedBox(height: 10),
        if (card.lines.isEmpty)
          const EmptyNote(icon: Icons.menu_book_rounded, message: 'Subject marks are not on this report yet.')
        else
          for (var i = 0; i < card.lines.length; i++) ...[
            _SubjectCard(line: card.lines[i]),
            if (i < card.lines.length - 1) const SizedBox(height: 10),
          ],
        if ((card.classTeacherComment ?? '').isNotEmpty) ...[
          const SizedBox(height: 18),
          const Text(
            'Teacher notes',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: KjaColors.ink),
          ),
          const SizedBox(height: 10),
          _CommentCard(
            role: 'Class teacher',
            name: card.classTeacherName,
            body: card.classTeacherComment!,
            color: KjaColors.sky,
            icon: Icons.favorite_rounded,
          ),
        ],
        if ((card.headComment ?? '').isNotEmpty) ...[
          if ((card.classTeacherComment ?? '').isEmpty) ...[
            const SizedBox(height: 18),
            const Text(
              'Teacher notes',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: KjaColors.ink),
            ),
            const SizedBox(height: 10),
          ] else
            const SizedBox(height: 10),
          _CommentCard(
            role: 'Head teacher',
            name: null,
            body: card.headComment!,
            color: KjaColors.lilac,
            icon: Icons.school_rounded,
          ),
        ],
      ],
    );
  }
}

class _DetailHero extends StatelessWidget {
  const _DetailHero({required this.card, required this.percent});

  final ReportCard card;
  final double? percent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFBBF24), KjaColors.sun, Color(0xFFB45309)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: KjaColors.sun.withValues(alpha: 0.28), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.4), width: 3),
            ),
            alignment: Alignment.center,
            child: Text(
              percent == null ? '★' : '${percent!.round()}%',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  card.term,
                  style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900, height: 1.1),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (card.classLabel.isNotEmpty) _SunChip(label: card.classLabel),
                    if (card.publishedAt != null) _SunChip(label: shortDate(card.publishedAt, withYear: true)),
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

class _SummaryPill extends StatelessWidget {
  const _SummaryPill({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: color.withValues(alpha: 0.22)),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 13)),
        ],
      ),
    );
  }
}

class _SubjectCard extends StatelessWidget {
  const _SubjectCard({required this.line});

  final ReportLine line;

  @override
  Widget build(BuildContext context) {
    final color = subjectColor(line.subjectName);
    final percent = line.percent;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withValues(alpha: 0.18)),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(subjectIcon(line.subjectName), color: color, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      line.subjectName,
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: KjaColors.ink),
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        if (line.score != null)
                          _MiniStat(
                            label: '${_trim(line.score!)}${line.maxScore == null ? '' : '/${_trim(line.maxScore!)}'}',
                            color: color,
                          ),
                        if (line.grade != null) _MiniStat(label: line.grade!, color: color),
                        if (line.points != null) _MiniStat(label: '${line.points} pts', color: color),
                      ],
                    ),
                  ],
                ),
              ),
              if (line.grade != null)
                Text(
                  line.grade!,
                  style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 20),
                ),
            ],
          ),
          if (percent != null) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                minHeight: 10,
                value: (percent / 100).clamp(0, 1),
                color: color,
                backgroundColor: color.withValues(alpha: 0.12),
              ),
            ),
          ],
          if (line.parts.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final part in line.parts)
                  _MiniStat(
                    label: '${part.label}: ${part.score == null ? '—' : _trim(part.score!)}',
                    color: color,
                  ),
              ],
            ),
          ],
          if ((line.comment ?? '').isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              line.comment!,
              style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, height: 1.35),
            ),
          ],
        ],
      ),
    );
  }

  String _trim(double value) {
    if (value == value.roundToDouble()) return value.round().toString();
    return value.toStringAsFixed(1);
  }
}

class _CommentCard extends StatelessWidget {
  const _CommentCard({
    required this.role,
    required this.body,
    required this.color,
    required this.icon,
    this.name,
  });

  final String role;
  final String? name;
  final String body;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withValues(alpha: 0.2)),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(role, style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 14)),
                    if ((name ?? '').isNotEmpty)
                      Text(name!, style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(body, style: const TextStyle(color: KjaColors.ink, fontWeight: FontWeight.w600, height: 1.4, fontSize: 14.5)),
        ],
      ),
    );
  }
}
