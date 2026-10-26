import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../navigation.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class NoticesPage extends StatelessWidget {
  const NoticesPage({
    super.key,
    required this.portal,
    required this.controller,
    required this.open,
  });

  final PortalSnapshot portal;
  final PortalController controller;
  final void Function(AppDestination destination, {String? href}) open;

  @override
  Widget build(BuildContext context) {
    final notices = portal.notices;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        if (notices.any((n) => !n.read)) ...[
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => controller.markNoticesRead(
                notices.where((n) => !n.read).map((n) => n.id).toList(),
              ),
              child: const Text('Mark all read'),
            ),
          ),
          const SizedBox(height: 8),
        ],
        if (notices.isEmpty)
          const EmptyNote(
            icon: Icons.notifications_none_rounded,
            title: 'All caught up',
            message: 'School notices for your family will appear here.',
          )
        else
          ...notices.map((notice) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                color: notice.read ? Colors.white : KjaColors.sunWash.withValues(alpha: 0.55),
                onTap: () async {
                  if (!notice.read) await controller.markNoticesRead([notice.id]);
                  final dest = destinationForHref(notice.href);
                  if (dest != null) open(dest, href: notice.href);
                },
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ToneIcon(
                      icon: notice.read ? Icons.notifications_none_rounded : Icons.notifications_active_rounded,
                      tone: Tone.sun,
                      size: 42,
                      iconSize: 20,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(notice.title, style: const TextStyle(fontWeight: FontWeight.w900)),
                          if ((notice.body ?? '').isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(stripHtml(notice.body), style: const TextStyle(color: KjaColors.soft, height: 1.35)),
                          ],
                          const SizedBox(height: 6),
                          Text(
                            () {
                              final parsed = DateTime.tryParse(notice.createdAt);
                              return parsed == null ? '' : timeAgo(parsed);
                            }(),
                            style: const TextStyle(color: KjaColors.mute, fontSize: 12, fontWeight: FontWeight.w600),
                          ),
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
