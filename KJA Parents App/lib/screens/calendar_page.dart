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
    return PortalScroll(
      children: [
        PageIntro(
          tone: Tone.sky,
          eyebrow: 'SCHOOL',
          title: 'Calendar',
          detail: portal.events.isEmpty
              ? 'Class and school dates appear here when published.'
              : '${portal.events.length} upcoming ${portal.events.length == 1 ? 'date' : 'dates'}.',
        ),
        const SizedBox(height: 12),
        if (portal.events.isEmpty)
          const EmptyNote(
            icon: Icons.event_rounded,
            title: 'No upcoming dates',
            message: 'Class calendars and school office dates appear here as soon as they are published.',
          )
        else
          ...portal.events.map((event) {
            final starts = parseDate(event.startsOn);
            final day = starts == null ? '—' : '${starts.day}';
            final month = starts == null
                ? ''
                : [
                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
                  ][starts.month - 1];
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DateStamp(day: day, month: month),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            event.title,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 15.5,
                              letterSpacing: -0.15,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            [
                              shortDate(event.startsOn, withYear: true),
                              if ((event.location ?? '').isNotEmpty) event.location,
                            ]
                                .whereType<String>()
                                .where((s) => s.isNotEmpty)
                                .join(' · '),
                            style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 13),
                          ),
                          if ((event.summary ?? '').isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(
                              event.summary!,
                              style: const TextStyle(
                                height: 1.4,
                                color: KjaColors.soft,
                                fontWeight: FontWeight.w600,
                                fontSize: 13.5,
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
