import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../navigation.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ChildrenPage extends StatelessWidget {
  const ChildrenPage({super.key, required this.portal, required this.open});

  final PortalSnapshot portal;
  final ValueChanged<AppDestination> open;

  @override
  Widget build(BuildContext context) {
    return PortalScroll(
      children: [
        PageIntro(
          tone: Tone.rose,
          eyebrow: 'FAMILY',
          title: 'Your children',
          detail: portal.children.isEmpty
              ? 'Pupils linked to this parent account appear here.'
              : '${plural(portal.children.length, 'child')} linked to your account.',
        ),
        const SizedBox(height: 14),
        if (portal.children.isEmpty)
          const EmptyNote(
            icon: Icons.family_restroom_rounded,
            title: 'No children linked yet',
            message: 'Contact the school office if a pupil should appear here.',
          )
        else
          ...portal.children.map((child) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SoftCard(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        PupilFace(
                          name: child.fullName,
                          studentId: child.id,
                          photoUrl: child.photoUrl,
                          radius: 28,
                          color: Tone.sky.ink,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                child.fullName,
                                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16.5, letterSpacing: -0.15),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                [child.classLabel, child.campus].where((s) => (s ?? '').isNotEmpty).join(' · '),
                                style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 13.5),
                              ),
                              if ((child.studentCode ?? '').isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  child.studentCode!,
                                  style: const TextStyle(color: KjaColors.mute, fontSize: 12, fontWeight: FontWeight.w600),
                                ),
                              ],
                            ],
                          ),
                        ),
                        if (!child.isActive) StatusPill(label: child.status ?? 'inactive', tone: Tone.sun),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        _Stat(
                          label: 'Fees due',
                          value: child.feeOutstanding > 0 ? moneyUgx(child.feeOutstanding) : 'Clear',
                          tone: child.feeOutstanding > 0 ? Tone.coral : Tone.mint,
                          onTap: () => open(AppDestination.fees),
                        ),
                        _Stat(
                          label: 'Reports',
                          value: '${child.reportCount}',
                          tone: Tone.sun,
                          onTap: () => open(AppDestination.reports),
                        ),
                        _Stat(
                          label: 'Clubs',
                          value: '${child.clubCount}',
                          tone: Tone.sky,
                          onTap: () => open(AppDestination.clubs),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.label,
    required this.value,
    required this.onTap,
    required this.tone,
  });
  final String label;
  final String value;
  final VoidCallback onTap;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 3),
          padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 8),
          decoration: BoxDecoration(
            color: tone.wash,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: tone.ink.withValues(alpha: 0.08)),
          ),
          child: Column(
            children: [
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: tone.ink),
              ),
              const SizedBox(height: 3),
              Text(label, style: const TextStyle(color: KjaColors.soft, fontSize: 11, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ),
    );
  }
}
