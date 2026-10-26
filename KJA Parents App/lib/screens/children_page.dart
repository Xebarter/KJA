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
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
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
                              Text(child.fullName, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                              const SizedBox(height: 2),
                              Text(
                                [child.classLabel, child.campus].where((s) => (s ?? '').isNotEmpty).join(' · '),
                                style: const TextStyle(color: KjaColors.soft),
                              ),
                              if ((child.studentCode ?? '').isNotEmpty)
                                Text(child.studentCode!, style: const TextStyle(color: KjaColors.mute, fontSize: 12)),
                            ],
                          ),
                        ),
                        if (!child.isActive)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: KjaColors.sunWash, borderRadius: BorderRadius.circular(99)),
                            child: Text(child.status ?? 'inactive', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 11)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        _Stat(label: 'Fees due', value: child.feeOutstanding > 0 ? moneyUgx(child.feeOutstanding) : 'Clear', onTap: () => open(AppDestination.fees)),
                        _Stat(label: 'Reports', value: '${child.reportCount}', onTap: () => open(AppDestination.reports)),
                        _Stat(label: 'Clubs', value: '${child.clubCount}', onTap: () => open(AppDestination.clubs)),
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
  const _Stat({required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;

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
            color: const Color(0xFFF7FAFC),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: KjaColors.line),
          ),
          child: Column(
            children: [
              Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13)),
              const SizedBox(height: 2),
              Text(label, style: const TextStyle(color: KjaColors.soft, fontSize: 11, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}
