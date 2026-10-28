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
    final unread = notices.where((n) => !n.read).length;
    return PortalScroll(
      children: [
        PageIntro(
          tone: Tone.sun,
          eyebrow: 'INBOX',
          title: 'Notifications',
          detail: unread > 0
              ? '${plural(unread, 'unread notice')} for your family.'
              : 'School notices for your family appear here.',
          footer: unread > 0
              ? Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => controller.markNoticesRead(
                      notices.where((n) => !n.read).map((n) => n.id).toList(),
                    ),
                    icon: const Icon(Icons.done_all_rounded, size: 18),
                    label: const Text('Mark all read'),
                  ),
                )
              : null,
        ),
        const SizedBox(height: 8),
        if (notices.isEmpty)
          const EmptyNote(
            icon: Icons.notifications_none_rounded,
            title: 'All caught up',
            message: 'School notices for your family will appear here.',
          )
        else
          ...notices.map((notice) {
            final unreadNotice = !notice.read;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                accent: unreadNotice ? KjaColors.gold : null,
                color: unreadNotice ? KjaColors.sunWash.withValues(alpha: 0.35) : Colors.white,
                onTap: () async {
                  if (!notice.read) await controller.markNoticesRead([notice.id]);
                  final dest = destinationForHref(notice.href);
                  if (dest != null) open(dest, href: notice.href);
                },
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ToneIcon(
                      icon: unreadNotice ? Icons.notifications_active_rounded : Icons.notifications_none_rounded,
                      tone: Tone.sun,
                      size: 42,
                      iconSize: 20,
                      active: unreadNotice,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  notice.title,
                                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: -0.1),
                                ),
                              ),
                              if (unreadNotice) const StatusPill(label: 'New', tone: Tone.sun, filled: true),
                            ],
                          ),
                          if ((notice.body ?? '').isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              stripHtml(notice.body),
                              style: const TextStyle(color: KjaColors.soft, height: 1.4, fontWeight: FontWeight.w600, fontSize: 13.5),
                            ),
                          ],
                          const SizedBox(height: 7),
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
