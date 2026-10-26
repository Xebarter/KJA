import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class PointsPage extends StatelessWidget {
  const PointsPage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  Widget build(BuildContext context) {
    final awards = portal.points;
    final total = awards.fold<int>(0, (sum, award) => sum + award.points);
    final given = awards.where((award) => award.points > 0).fold<int>(0, (sum, award) => sum + award.points);
    final taken = awards.where((award) => award.points < 0).fold<int>(0, (sum, award) => sum + award.points.abs());

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHero(
          kicker: portal.termLabel ?? 'This term',
          title: 'Your points',
          lead: total == 0
              ? 'Points from your teachers will show up here.'
              : total > 0
                  ? 'Well done. You have ${_signed(total)} this term.'
                  : 'You have ${_signed(total)} this term.',
          icon: Icons.stars_rounded,
          colors: const [Color(0xFF1D56B0), Color(0xFF127238), KjaColors.gold],
        ),
        const SizedBox(height: 14),
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
          const EmptyNote(icon: Icons.stars_outlined, message: 'No points this term yet.')
        else
          for (final award in awards)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SoftCard(
                child: Row(
                  children: [
                    Text(
                      _signed(award.points),
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: award.points < 0 ? const Color(0xFFC81E2D) : const Color(0xFF127238)),
                    ),
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
