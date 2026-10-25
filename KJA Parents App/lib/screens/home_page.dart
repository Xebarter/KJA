import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../navigation.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class HomePage extends StatelessWidget {
  const HomePage({
    super.key,
    required this.portal,
    required this.open,
    required this.openWeb,
  });

  final PortalSnapshot portal;
  final ValueChanged<AppDestination> open;
  final Future<void> Function(String path) openWeb;

  @override
  Widget build(BuildContext context) {
    final first = firstNameOf(portal.displayName);
    final outstanding = portal.totalOutstanding;
    final nextEvent = portal.events.isEmpty ? null : portal.events.first;
    final attention = <_AttentionItem>[
      if (portal.unreadMessages > 0)
        _AttentionItem(
          icon: Icons.forum_rounded,
          tone: Tone.mint,
          title: plural(portal.unreadMessages, 'unread message'),
          onTap: () => open(AppDestination.communications),
        ),
      if (outstanding > 0)
        _AttentionItem(
          icon: Icons.receipt_long_rounded,
          tone: Tone.coral,
          title: '${moneyUgx(outstanding)} outstanding',
          onTap: () => open(AppDestination.fees),
        ),
      if (portal.unreadNotices > 0)
        _AttentionItem(
          icon: Icons.notifications_rounded,
          tone: Tone.sun,
          title: plural(portal.unreadNotices, 'new notice'),
          onTap: () => open(AppDestination.notices),
        ),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHero(
          kicker: longToday(),
          title: '${greeting()}, $first',
          lead: portal.children.isEmpty
              ? 'Your family portal is ready. Linked children will appear here.'
              : 'You have ${plural(portal.children.length, 'child')} on the register.',
          icon: Icons.waving_hand_rounded,
          footer: Row(
            children: [
              _HeroStat(label: 'Notices', value: '${portal.unreadNotices}'),
              const SizedBox(width: 8),
              _HeroStat(label: 'Messages', value: '${portal.unreadMessages}'),
              const SizedBox(width: 8),
              _HeroStat(label: 'Fees due', value: outstanding > 0 ? moneyUgx(outstanding) : 'Clear'),
            ],
          ),
        ),
        if (attention.isNotEmpty) ...[
          const SizedBox(height: 16),
          SoftCard(
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(left: 4, bottom: 4),
                  child: Text('Needs attention', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                ),
                for (var i = 0; i < attention.length; i++) ...[
                  if (i > 0) const Divider(height: 12),
                  _ActionRow(item: attention[i]),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
        SectionTitle(title: 'Your children', action: 'See all', onAction: () => open(AppDestination.children)),
        const SizedBox(height: 10),
        if (portal.children.isEmpty)
          const EmptyNote(
            icon: Icons.family_restroom_rounded,
            title: 'No linked pupils yet',
            message: 'Ask the school office if a child should appear here.',
          )
        else
          SizedBox(
            height: 138,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: portal.children.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final child = portal.children[index];
                return SoftCard(
                  expand: false,
                  padding: const EdgeInsets.all(14),
                  onTap: () => open(AppDestination.children),
                  child: SizedBox(
                    width: 148,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        PupilFace(
                          name: child.fullName,
                          studentId: child.id,
                          photoUrl: child.photoUrl,
                          radius: 24,
                          color: Tone.sky.ink,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          firstNameOf(child.fullName),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                        const SizedBox(height: 2),
                        Text(child.classLabel, style: const TextStyle(color: KjaColors.soft, fontSize: 12)),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        const SizedBox(height: 20),
        const SectionTitle(title: 'Quick links'),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            _QuickTile(dest: AppDestination.fees, onTap: () => open(AppDestination.fees)),
            _QuickTile(dest: AppDestination.reports, onTap: () => open(AppDestination.reports)),
            _QuickTile(dest: AppDestination.communications, onTap: () => open(AppDestination.communications)),
            _QuickTile(dest: AppDestination.clubs, onTap: () => open(AppDestination.clubs)),
          ],
        ),
        if (nextEvent != null) ...[
          const SizedBox(height: 20),
          SectionTitle(title: 'Coming up', action: 'Calendar', onAction: () => open(AppDestination.calendar)),
          const SizedBox(height: 10),
          SoftCard(
            onTap: () => open(AppDestination.calendar),
            child: Row(
              children: [
                ToneIcon(icon: Icons.event_rounded, tone: Tone.sky, size: 44, iconSize: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(nextEvent.title, style: const TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(shortDate(nextEvent.startsOn, withYear: true), style: const TextStyle(color: KjaColors.soft)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: KjaColors.mute),
              ],
            ),
          ),
        ],
        const SizedBox(height: 20),
        SoftCard(
          onTap: () => openWeb('/account/fees'),
          child: Row(
            children: [
              ToneIcon(icon: Icons.payments_rounded, tone: Tone.coral, size: 44, iconSize: 22),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Pay school fees', style: TextStyle(fontWeight: FontWeight.w800)),
                    SizedBox(height: 2),
                    Text(
                      'Open Mobile Money checkout on the website.',
                      style: TextStyle(color: KjaColors.soft, height: 1.35),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.open_in_new_rounded, color: KjaColors.mute, size: 18),
            ],
          ),
        ),
      ],
    );
  }
}

class _AttentionItem {
  const _AttentionItem({
    required this.icon,
    required this.tone,
    required this.title,
    required this.onTap,
  });

  final IconData icon;
  final Tone tone;
  final String title;
  final VoidCallback onTap;
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: Column(
          children: [
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({required this.item});

  final _AttentionItem item;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: item.onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          children: [
            ToneIcon(icon: item.icon, tone: item.tone),
            const SizedBox(width: 12),
            Expanded(child: Text(item.title, style: const TextStyle(fontWeight: FontWeight.w700))),
            const Icon(Icons.chevron_right_rounded, color: KjaColors.mute),
          ],
        ),
      ),
    );
  }
}

class _QuickTile extends StatelessWidget {
  const _QuickTile({required this.dest, required this.onTap});
  final AppDestination dest;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: (MediaQuery.sizeOf(context).width - 42) / 2,
      child: SoftCard(
        onTap: onTap,
        padding: const EdgeInsets.fromLTRB(12, 14, 12, 14),
        child: Row(
          children: [
            ToneIcon(icon: dest.icon, tone: dest.tone, size: 40, iconSize: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(dest.menuLabel, style: const TextStyle(fontWeight: FontWeight.w800, height: 1.2)),
            ),
          ],
        ),
      ),
    );
  }
}
