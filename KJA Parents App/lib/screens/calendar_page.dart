import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class CalendarPage extends StatelessWidget {
  const CalendarPage({super.key, required this.portal});

  final PortalSnapshot portal;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        if (portal.events.isEmpty)
          const EmptyNote(
            icon: Icons.event_rounded,
            title: 'No upcoming dates',
            message:
                'Class calendars and school office dates appear here as soon as they are published.',
          )
        else
          ...portal.events.map((event) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const ToneIcon(
                      icon: Icons.event_rounded,
                      tone: Tone.sky,
                      size: 44,
                      iconSize: 22,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            event.title,
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 16,
                            ),
                          ),
                          Text(
                            [
                              shortDate(event.startsOn, withYear: true),
                              if ((event.location ?? '').isNotEmpty) event.location,
                            ]
                                .whereType<String>()
                                .where((s) => s.isNotEmpty)
                                .join(' · '),
                            style: const TextStyle(color: KjaColors.soft),
                          ),
                          if ((event.summary ?? '').isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(
                              event.summary!,
                              style: const TextStyle(
                                height: 1.35,
                                color: KjaColors.soft,
                              ),
                            ),
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
