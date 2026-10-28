import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

enum _Mood { calm, party, sombre }

_Mood _moodOf(List<PointAward> awards) {
  if (awards.isEmpty) return _Mood.calm;
  return awards.first.points > 0 ? _Mood.party : _Mood.sombre;
}

String _signed(int points) => points > 0 ? '+$points' : '$points';

class PointsPage extends StatefulWidget {
  const PointsPage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  State<PointsPage> createState() => _PointsPageState();
}

class _PointsPageState extends State<PointsPage> with SingleTickerProviderStateMixin {
  late final AnimationController _confetti;
  String? _burstKey;

  @override
  void initState() {
    super.initState();
    _confetti = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncMood(force: true));
  }

  @override
  void didUpdateWidget(PointsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.portal.points, widget.portal.points)) {
      _syncMood();
    }
  }

  @override
  void dispose() {
    _confetti.dispose();
    super.dispose();
  }

  void _syncMood({bool force = false}) {
    final awards = widget.portal.points;
    final mood = _moodOf(awards);
    final key = awards.isEmpty ? 'empty' : '${awards.first.id}:${awards.first.points}';
    if (!force && key == _burstKey) return;
    _burstKey = key;
    if (mood == _Mood.party) {
      _confetti.forward(from: 0);
    } else {
      _confetti.stop();
      _confetti.value = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final awards = widget.portal.points;
    final mood = _moodOf(awards);
    final total = awards.fold<int>(0, (sum, award) => sum + award.points);
    final given = awards.where((a) => a.points > 0).fold<int>(0, (sum, a) => sum + a.points);
    final taken = awards.where((a) => a.points < 0).fold<int>(0, (sum, a) => sum + a.points.abs());
    final term = widget.portal.termLabel ?? 'This term';

    return Stack(
      children: [
        ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          children: [
            _MoodHero(mood: mood, term: term, total: total),
            const SizedBox(height: 14),
            Row(
              children: [
                _Stat(
                  label: 'Available',
                  value: _signed(total),
                  color: total < 0 ? KjaColors.rose : KjaColors.mintDeep,
                  wash: total < 0 ? KjaColors.roseWash : KjaColors.mintWash,
                ),
                const SizedBox(width: 8),
                _Stat(
                  label: 'Given',
                  value: '$given',
                  color: KjaColors.mintDeep,
                  wash: KjaColors.mintWash,
                ),
                const SizedBox(width: 8),
                _Stat(
                  label: 'Taken',
                  value: '$taken',
                  color: KjaColors.rose,
                  wash: KjaColors.roseWash,
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (awards.isEmpty)
              const EmptyNote(
                icon: Icons.stars_outlined,
                message: 'No points this term yet. Keep going — your teachers will add them here.',
              )
            else
              for (final award in awards)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _AwardCard(award: award),
                ),
          ],
        ),
        if (mood == _Mood.party)
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _confetti,
                builder: (context, _) => CustomPaint(
                  painter: _ConfettiPainter(progress: _confetti.value),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _MoodHero extends StatelessWidget {
  const _MoodHero({
    required this.mood,
    required this.term,
    required this.total,
  });

  final _Mood mood;
  final String term;
  final int total;

  @override
  Widget build(BuildContext context) {
    final party = mood == _Mood.party;
    final sombre = mood == _Mood.sombre;

    final colors = party
        ? const [Color(0xFFD97706), KjaColors.gold, KjaColors.mintDeep]
        : sombre
            ? const [Color(0xFF1E293B), KjaColors.navy, Color(0xFF334155)]
            : const [KjaColors.navy, Color(0xFF1E4D7B), KjaColors.sky];

    final icon = party
        ? Icons.celebration_rounded
        : sombre
            ? Icons.nightlight_round
            : Icons.stars_rounded;

    final title = party
        ? 'Party time'
        : sombre
            ? 'A quieter moment'
            : 'Your points';

    final lead = party
        ? 'Nice one — you have ${_signed(total)} this term.'
        : sombre
            ? total < 0
                ? 'A deduction was recorded. Balance ${_signed(total)} this term.'
                : 'A deduction was recorded. You still have ${_signed(total)} this term.'
            : 'Points from your teachers will show up here.';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: colors.first.withValues(alpha: party ? 0.28 : 0.18),
            blurRadius: party ? 22 : 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  term.toUpperCase(),
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.78),
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 24,
                    letterSpacing: -0.4,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  lead,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: sombre ? 0.82 : 0.92),
                    fontWeight: FontWeight.w600,
                    height: 1.4,
                    fontSize: 14,
                  ),
                ),
                if (mood != _Mood.calm) ...[
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: party ? 0.22 : 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'Balance ${_signed(total)}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: party ? 0.24 : 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: party ? 30 : 26),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.label,
    required this.value,
    required this.color,
    required this.wash,
  });

  final String label;
  final String value;
  final Color color;
  final Color wash;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: SoftCard(
        color: wash,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(color: color.withValues(alpha: 0.85), fontSize: 12, fontWeight: FontWeight.w700),
            ),
            Text(
              value,
              style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}

class _AwardCard extends StatelessWidget {
  const _AwardCard({required this.award});

  final PointAward award;

  @override
  Widget build(BuildContext context) {
    final up = award.points > 0;
    final wash = up ? KjaColors.sunWash : const Color(0xFFE8EEF4);
    final ink = up ? KjaColors.sunDeep : const Color(0xFF475569);
    final amountColor = up ? KjaColors.mintDeep : KjaColors.rose;
    final icon = up ? Icons.celebration_rounded : Icons.remove_circle_outline_rounded;

    return SoftCard(
      color: wash,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: ink.withValues(alpha: 0.18)),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 14, color: ink),
                Text(
                  _signed(award.points),
                  style: TextStyle(
                    color: amountColor,
                    fontWeight: FontWeight.w900,
                    fontSize: 15,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  award.reasonLabel,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: up ? KjaColors.ink : const Color(0xFF334155),
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${award.teacherName} · ${shortDate(award.createdAt, withYear: true)}',
                  style: TextStyle(
                    color: up ? KjaColors.soft : const Color(0xFF64748B),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter({required this.progress});

  final double progress;

  static const _colors = [
    KjaColors.gold,
    KjaColors.sun,
    KjaColors.mint,
    KjaColors.coral,
    KjaColors.lilac,
    Colors.white,
  ];

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0 || progress >= 1) return;
    final opacity = progress < 0.7 ? 1.0 : (1 - progress) / 0.3;
    final rand = math.Random(42);
    for (var i = 0; i < 48; i++) {
      final x = rand.nextDouble() * size.width;
      final startY = -20.0 - rand.nextDouble() * 40;
      final endY = size.height * (0.35 + rand.nextDouble() * 0.55);
      final y = startY + (endY - startY) * Curves.easeIn.transform(progress);
      final spin = progress * math.pi * (2 + rand.nextDouble() * 4);
      final w = 5.0 + rand.nextDouble() * 5;
      final h = 3.0 + rand.nextDouble() * 3;
      final color = _colors[i % _colors.length].withValues(alpha: 0.85 * opacity);
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(spin);
      final paint = Paint()..color = color;
      if (i.isEven) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(Rect.fromCenter(center: Offset.zero, width: w, height: h), const Radius.circular(1.5)),
          paint,
        );
      } else {
        canvas.drawCircle(Offset.zero, w * 0.35, paint);
      }
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter oldDelegate) => oldDelegate.progress != progress;
}
