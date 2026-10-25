import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ApplicationsPage extends StatelessWidget {
  const ApplicationsPage({super.key, required this.portal, required this.openWeb});

  final PortalSnapshot portal;
  final Future<void> Function(String path) openWeb;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHero(
          kicker: 'Admissions',
          title: 'Applications',
          lead: 'Track sibling applications and open a new one on the website.',
          icon: Icons.assignment_rounded,
          colors: const [Color(0xFF5B21B6), KjaColors.lilacDeep, KjaColors.lilac],
          footer: Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: KjaColors.lilacDeep),
              onPressed: () => openWeb('/account/applications'),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('Apply on website'),
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (portal.applications.isEmpty)
          const EmptyNote(icon: Icons.assignment_rounded, message: 'No applications linked to this account yet.')
        else
          ...portal.applications.map((app) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                child: Row(
                  children: [
                    ToneIcon(icon: Icons.child_care_rounded, tone: Tone.lilac, size: 44, iconSize: 22),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(app.childName, style: const TextStyle(fontWeight: FontWeight.w900)),
                          Text(
                            [
                              if ((app.grade ?? '').isNotEmpty) app.grade,
                              if ((app.campus ?? '').isNotEmpty) app.campus,
                              shortDate(app.createdAt, withYear: true),
                            ].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
                            style: const TextStyle(color: KjaColors.soft, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(color: KjaColors.lilacWash, borderRadius: BorderRadius.circular(99)),
                      child: Text(
                        app.status.replaceAll('_', ' '),
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: KjaColors.lilacDeep),
                      ),
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
