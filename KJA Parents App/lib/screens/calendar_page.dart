import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class CalendarPage extends StatelessWidget {
  const CalendarPage({super.key, required this.portal, required this.openWeb});

  final PortalSnapshot portal;
  final Future<void> Function(String path) openWeb;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHero(
          kicker: 'School life',
          title: 'Calendar',
          lead: 'Upcoming school events for your family.',
          icon: Icons.calendar_month_rounded,
          footer: Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: KjaColors.navy),
              onPressed: () => openWeb('/account/calendar'),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('Open on website'),
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (portal.events.isEmpty)
          SoftCard(
            child: Column(
              children: [
                ToneIcon(icon: Icons.event_rounded, tone: Tone.sky, size: 48, iconSize: 24),
                const SizedBox(height: 10),
                const Text(
                  'School events sync from the website calendar. Open the full calendar online for the latest dates.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: KjaColors.soft, height: 1.4),
                ),
                const SizedBox(height: 12),
                TextButton(onPressed: () => openWeb('/account/calendar'), child: const Text('View calendar')),
              ],
            ),
          )
        else
          ...portal.events.map((event) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ToneIcon(icon: Icons.event_rounded, tone: Tone.sky, size: 44, iconSize: 22),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(event.title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                          Text(
                            [
                              shortDate(event.startsOn, withYear: true),
                              if ((event.location ?? '').isNotEmpty) event.location,
                            ].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
                            style: const TextStyle(color: KjaColors.soft),
                          ),
                          if ((event.summary ?? '').isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(event.summary!, style: const TextStyle(height: 1.35, color: KjaColors.soft)),
                          ],
                        ],
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
