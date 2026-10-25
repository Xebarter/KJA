import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, required this.portal, required this.controller});

  final PortalSnapshot portal;
  final PortalController controller;

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  String? _filterChild;
  ReportDetail? _detail;
  var _loading = false;

  Future<void> _open(PublishedReport card) async {
    setState(() {
      _loading = true;
      _detail = null;
    });
    final detail = await widget.controller.loadReportDetail(card);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _detail = detail;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: KjaColors.sky));
    }
    if (_detail != null) {
      return _ReportDetailView(detail: _detail!, onBack: () => setState(() => _detail = null));
    }

    final cards = widget.portal.reports.where((c) => _filterChild == null || c.studentId == _filterChild).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        const PageHero(
          kicker: 'Learning',
          title: 'Reports',
          lead: 'Published report cards for your children.',
          icon: Icons.description_rounded,
          colors: [Color(0xFF92400E), KjaColors.sunDeep, KjaColors.gold],
        ),
        const SizedBox(height: 14),
        if (widget.portal.children.length > 1)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ChoiceChip(
                  label: const Text('All'),
                  selected: _filterChild == null,
                  onSelected: (_) => setState(() => _filterChild = null),
                ),
                const SizedBox(width: 8),
                ...widget.portal.children.map(
                  (child) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(firstNameOf(child.fullName)),
                      selected: _filterChild == child.id,
                      onSelected: (_) => setState(() => _filterChild = child.id),
                    ),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 12),
        if (cards.isEmpty)
          const EmptyNote(icon: Icons.description_rounded, message: 'No published reports yet.')
        else
          ...cards.map((card) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                onTap: () => _open(card),
                child: Row(
                  children: [
                    ToneIcon(icon: Icons.workspace_premium_rounded, tone: Tone.sun, size: 44, iconSize: 22),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(card.pupilName, style: const TextStyle(fontWeight: FontWeight.w900)),
                          Text('${card.term} · ${card.classLabel}', style: const TextStyle(color: KjaColors.soft)),
                          if (card.publishedAt != null)
                            Text('Published ${shortDate(card.publishedAt, withYear: true)}', style: const TextStyle(color: KjaColors.mute, fontSize: 12)),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _ReportDetailView extends StatelessWidget {
  const _ReportDetailView({required this.detail, required this.onBack});
  final ReportDetail detail;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final card = detail.card;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(onPressed: onBack, icon: const Icon(Icons.arrow_back_rounded), label: const Text('All reports')),
        ),
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(card.pupilName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              Text('${card.term} · ${card.classLabel}', style: const TextStyle(color: KjaColors.soft)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (detail.lines.isEmpty)
          const EmptyNote(icon: Icons.notes_rounded, message: 'Subject lines are not available for this card yet.')
        else
          ...detail.lines.map((line) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(line.subject, style: const TextStyle(fontWeight: FontWeight.w900))),
                        if ((line.grade ?? '').isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(color: KjaColors.sunWash, borderRadius: BorderRadius.circular(99)),
                            child: Text(line.grade!, style: const TextStyle(fontWeight: FontWeight.w900)),
                          ),
                      ],
                    ),
                    if ((line.remark ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(line.remark!, style: const TextStyle(color: KjaColors.soft, height: 1.35)),
                    ],
                  ],
                ),
              ),
            );
          }),
        if ((detail.closingComment ?? '').isNotEmpty) ...[
          const SizedBox(height: 8),
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Closing comment', style: TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                Text(detail.closingComment!, style: const TextStyle(height: 1.4)),
              ],
            ),
          ),
        ],
        if (detail.activities.isNotEmpty) ...[
          const SizedBox(height: 12),
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Activities', style: TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: detail.activities
                      .map(
                        (a) => Chip(
                          label: Text(a),
                          backgroundColor: KjaColors.mintWash,
                          side: BorderSide.none,
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
