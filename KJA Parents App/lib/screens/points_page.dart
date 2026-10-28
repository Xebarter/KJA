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
  const PointsPage({super.key, required this.portal, this.initialChildId});

  final PortalSnapshot portal;
  final String? initialChildId;

  @override
  State<PointsPage> createState() => _PointsPageState();
}

class _PointsPageState extends State<PointsPage> with SingleTickerProviderStateMixin {
  String? _childId;
  late final AnimationController _confetti;
  String? _burstKey;

  @override
  void initState() {
    super.initState();
    _childId = _pick(widget.initialChildId);
    _confetti = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncMood(force: true));
  }

  @override
  void didUpdateWidget(PointsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialChildId != oldWidget.initialChildId && widget.initialChildId != null) {
      _childId = _pick(widget.initialChildId);
      _syncMood(force: true);
    } else if (!identical(oldWidget.portal.points, widget.portal.points)) {
      _syncMood();
    }
  }

  @override
  void dispose() {
    _confetti.dispose();
    super.dispose();
  }

  String? _pick(String? preferred) {
    final children = widget.portal.children;
    if (children.isEmpty) return null;
    if (preferred != null && children.any((child) => child.id == preferred)) return preferred;
    if (_childId != null && children.any((child) => child.id == _childId)) return _childId;
    return children.first.id;
  }

  List<PointAward> _awardsFor(String? childId) {
    return widget.portal.points.where((award) => award.studentId == childId).toList();
  }

  void _selectChild(String id) {
    setState(() => _childId = id);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncMood(force: true));
  }

  void _syncMood({bool force = false}) {
    final childId = _pick(_childId);
    final awards = _awardsFor(childId);
    final mood = _moodOf(awards);
    final key = awards.isEmpty
        ? 'empty:$childId'
        : '$childId:${awards.first.id}:${awards.first.points}';
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
    final children = widget.portal.children;
    final childId = _pick(_childId);
    final child = children.where((row) => row.id == childId).firstOrNull;
    final awards = _awardsFor(childId);
    final mood = _moodOf(awards);
    final total = awards.fold<int>(0, (sum, award) => sum + award.points);
    final given = awards.where((a) => a.points > 0).fold<int>(0, (sum, a) => sum + a.points);
    final taken = awards.where((a) => a.points < 0).fold<int>(0, (sum, a) => sum + a.points.abs());

    return Stack(
      children: [
        ListView(
          padding: kPortalPadding,
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          children: [
            const PageIntro(
              tone: Tone.sun,
              eyebrow: 'FAMILY',
              title: 'Pupil points',
              detail: 'Awards and deductions from teachers this term.',
            ),
            const SizedBox(height: 12),
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
                          onSelected: (_) => _selectChild(entry.id),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
            ],
            if (child == null)
              const EmptyNote(
                icon: Icons.stars_rounded,
                title: 'No child linked',
                message: 'Points appear when a child is linked to this account.',
              )
            else ...[
              _MoodBanner(
                mood: mood,
                childName: firstNameOf(child.fullName),
                total: total,
              ),
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
                  title: 'No points yet',
                  message: 'Awards from teachers this term will be listed here.',
                )
              else
                for (final award in awards)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _AwardCard(award: award),
                  ),
            ],
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

class _MoodBanner extends StatelessWidget {
  const _MoodBanner({
    required this.mood,
    required this.childName,
    required this.total,
  });

  final _Mood mood;
  final String childName;
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
        ? 'Party for $childName'
        : sombre
            ? 'A quieter note for $childName'
            : '$childName’s points';

    final lead = party
        ? 'Nice one — balance ${_signed(total)} this term.'
        : sombre
            ? total < 0
                ? 'A deduction was recorded. Balance ${_signed(total)} this term.'
                : 'A deduction was recorded. Balance is still ${_signed(total)} this term.'
            : 'Awards from teachers appear here as the term goes.';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: colors.first.withValues(alpha: party ? 0.18 : 0.12),
            blurRadius: party ? 16 : 12,
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
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 20,
                    letterSpacing: -0.3,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 6),
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
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: party ? 0.22 : 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'Balance ${_signed(total)}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: party ? 0.24 : 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: party ? 28 : 24),
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
              style: TextStyle(
                color: color.withValues(alpha: 0.85),
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
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
          RRect.fromRectAndRadius(
            Rect.fromCenter(center: Offset.zero, width: w, height: h),
            const Radius.circular(1.5),
          ),
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
