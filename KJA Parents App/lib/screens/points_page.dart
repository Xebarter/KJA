import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class PointsPage extends StatefulWidget {
  const PointsPage({super.key, required this.portal, this.initialChildId});

  final PortalSnapshot portal;
  final String? initialChildId;

  @override
  State<PointsPage> createState() => _PointsPageState();
}

class _PointsPageState extends State<PointsPage> {
  String? _childId;

  @override
  void initState() {
    super.initState();
    _childId = _pick(widget.initialChildId);
  }

  @override
  void didUpdateWidget(PointsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialChildId != oldWidget.initialChildId && widget.initialChildId != null) {
      _childId = _pick(widget.initialChildId);
    }
  }

  String? _pick(String? preferred) {
    final children = widget.portal.children;
    if (children.isEmpty) return null;
    if (preferred != null && children.any((child) => child.id == preferred)) return preferred;
    if (_childId != null && children.any((child) => child.id == _childId)) return _childId;
    return children.first.id;
  }

  @override
  Widget build(BuildContext context) {
    final children = widget.portal.children;
    final childId = _pick(_childId);
    final child = children.where((row) => row.id == childId).firstOrNull;
    final awards = widget.portal.points.where((award) => award.studentId == childId).toList();
    final total = awards.fold<int>(0, (sum, award) => sum + award.points);
    final given = awards.where((award) => award.points > 0).fold<int>(0, (sum, award) => sum + award.points);
    final taken = awards.where((award) => award.points < 0).fold<int>(0, (sum, award) => sum + award.points.abs());

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        if (children.length > 1) ...[
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final entry in children)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(firstNameOf(entry.fullName)),
                      selected: entry.id == childId,
                      onSelected: (_) => setState(() => _childId = entry.id),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
        ],
        if (child == null)
          const EmptyNote(icon: Icons.stars_rounded, title: 'No child linked', message: 'Points appear when a child is linked to this account.')
        else ...[
          Row(
            children: [
              _Stat(label: 'Available', value: _signed(total), color: total < 0 ? const Color(0xFFC81E2D) : const Color(0xFF127238)),
              const SizedBox(width: 8),
              _Stat(label: 'Given', value: '$given', color: const Color(0xFF127238)),
              const SizedBox(width: 8),
              _Stat(label: 'Taken', value: '$taken', color: const Color(0xFFC81E2D)),
            ],
          ),
          const SizedBox(height: 14),
          if (awards.isEmpty)
            const EmptyNote(icon: Icons.stars_outlined, title: 'No points yet', message: 'Awards from teachers this term will be listed here.')
          else
            for (final award in awards)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SoftCard(
                  child: Row(
                    children: [
                      Text(_signed(award.points), style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: award.points < 0 ? const Color(0xFFC81E2D) : const Color(0xFF127238))),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(award.reasonLabel, style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text('${award.teacherName} · ${shortDate(award.createdAt, withYear: true)}', style: const TextStyle(color: KjaColors.soft, fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
        ],
      ],
    );
  }
}

String _signed(int points) => points > 0 ? '+$points' : '$points';

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.color});

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: SoftCard(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(color: KjaColors.soft, fontSize: 12, fontWeight: FontWeight.w700)),
            Text(value, style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    );
  }
}
