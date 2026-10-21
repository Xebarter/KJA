import 'package:flutter/material.dart';

import '../format.dart';
import '../navigation.dart';
import '../theme.dart';

/// School crest used in splash, gates, drawer, and student card.
/// Clipped to a circle so the page colour shows around the crest (no white square).
class SchoolMark extends StatelessWidget {
  const SchoolMark({super.key, this.size = 44});

  static const assetPath = 'assets/kja-logo.png';

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Image.asset(
        assetPath,
        width: size,
        height: size,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
        gaplessPlayback: true,
        semanticLabel: 'Kampala Junior Academy',
        errorBuilder: (context, error, stackTrace) => Icon(Icons.school_rounded, size: size * 0.55, color: KjaColors.navy),
      ),
    );
  }
}

class ToneIcon extends StatelessWidget {
  const ToneIcon({
    super.key,
    required this.icon,
    required this.tone,
    this.size = 34,
    this.iconSize = 18,
    this.active = false,
  });

  final IconData icon;
  final Tone tone;
  final double size;
  final double iconSize;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: tone.wash,
        borderRadius: BorderRadius.circular(size * 0.32),
        border: active ? Border.all(color: tone.ink.withValues(alpha: 0.22)) : null,
        boxShadow: active
            ? [BoxShadow(color: tone.ink.withValues(alpha: 0.18), blurRadius: 10, offset: const Offset(0, 4))]
            : null,
      ),
      child: Icon(icon, size: iconSize, color: tone.ink),
    );
  }
}

/// Soft rounded icon button for the app header — calm, child-friendly tap targets.
class HeaderIconButton extends StatelessWidget {
  const HeaderIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    required this.tooltip,
    this.tone = Tone.sky,
    this.badge = 0,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String tooltip;
  final Tone tone;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Tooltip(
      message: tooltip,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onPressed,
            borderRadius: BorderRadius.circular(14),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: enabled ? tone.wash : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: enabled ? tone.ink.withValues(alpha: 0.12) : const Color(0xFFE8EDF2),
                    ),
                  ),
                  child: Icon(
                    icon,
                    size: 22,
                    color: enabled ? tone.ink : KjaColors.mute,
                  ),
                ),
                if (badge > 0)
                  Positioned(
                    right: -2,
                    top: -2,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 18),
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: KjaColors.rose,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: Colors.white, width: 1.5),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        badge > 99 ? '99+' : '$badge',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          height: 1.1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class InitialAvatar extends StatelessWidget {
  const InitialAvatar({super.key, required this.name, this.color, this.radius = 22, this.photoUrl});

  final String name;
  final Color? color;
  final double radius;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    return PupilFace(name: name, color: color, radius: radius, photoUrl: photoUrl);
  }
}

class PageHero extends StatelessWidget {
  const PageHero({
    super.key,
    required this.kicker,
    required this.title,
    required this.lead,
    this.icon = Icons.auto_awesome_rounded,
    this.colors = const [KjaColors.navy, Color(0xFF1E4D7B), KjaColors.sky],
    this.footer,
  });

  final String kicker;
  final String title;
  final String lead;
  final IconData icon;
  final List<Color> colors;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: colors, begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(color: colors.first.withValues(alpha: 0.22), blurRadius: 18, offset: const Offset(0, 8)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: Colors.white, size: 16),
              const SizedBox(width: 8),
              Text(kicker, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 8),
          Text(title, style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800, height: 1.05)),
          const SizedBox(height: 8),
          Text(lead, style: const TextStyle(color: Colors.white, height: 1.35, fontSize: 15)),
          if (footer != null) ...[const SizedBox(height: 14), footer!],
        ],
      ),
    );
  }
}

class SoftCard extends StatelessWidget {
  const SoftCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.color = Colors.white});

  final Widget child;
  final EdgeInsets padding;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: KjaColors.line.withValues(alpha: 0.9)),
        boxShadow: [
          BoxShadow(color: KjaColors.sky.withValues(alpha: 0.06), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: child,
    );
  }
}

class EmptyNote extends StatelessWidget {
  const EmptyNote({super.key, required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      child: Column(
        children: [
          ToneIcon(icon: icon, tone: Tone.sky, size: 44, iconSize: 22),
          const SizedBox(height: 10),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: KjaColors.soft, height: 1.35)),
        ],
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle({super.key, required this.title, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
        if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
      ],
    );
  }
}

class CountChip extends StatelessWidget {
  const CountChip({super.key, required this.label, required this.value, this.color = KjaColors.navy});

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            Text(value, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

/// Persistent Homework · Home · Chat bar — bright chips like the portal nav.
class PupilDock extends StatelessWidget {
  const PupilDock({super.key, required this.current, required this.onSelect});

  final AppDestination current;
  final ValueChanged<AppDestination> onSelect;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFFDF8), Color(0xFFEEF8FF)],
          ),
          border: Border(top: BorderSide(color: KjaColors.sky.withValues(alpha: 0.14))),
          boxShadow: [
            BoxShadow(color: KjaColors.navy.withValues(alpha: 0.08), blurRadius: 22, offset: const Offset(0, -6)),
          ],
        ),
        child: Padding(
          padding: EdgeInsets.fromLTRB(10, 8, 10, bottom > 0 ? bottom : 10),
          child: Row(
            children: [
              _side(AppDestination.homework),
              _home(),
              _side(AppDestination.messages),
            ],
          ),
        ),
      ),
    );
  }

  Widget _side(AppDestination dest) {
    final active = current == dest;
    final tone = dest.tone;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () => onSelect(dest),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
              decoration: BoxDecoration(
                color: active ? Colors.white : Colors.transparent,
                borderRadius: BorderRadius.circular(18),
                border: active ? Border.all(color: KjaColors.gold.withValues(alpha: 0.7), width: 2) : null,
                boxShadow: active
                    ? [
                        BoxShadow(color: KjaColors.ink.withValues(alpha: 0.08), blurRadius: 14, offset: const Offset(0, 6)),
                      ]
                    : null,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ToneIcon(icon: dest.icon, tone: tone, size: 40, iconSize: 20, active: active),
                  const SizedBox(height: 5),
                  Text(
                    dest.label,
                    style: TextStyle(
                      color: active ? KjaColors.ink : KjaColors.soft,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _home() {
    final active = current == AppDestination.home;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: () => onSelect(AppDestination.home),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeOutCubic,
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: active
                          ? const [Color(0xFFFF6B7A), KjaColors.rose, Color(0xFFB91C1C)]
                          : const [Color(0xFF38BDF8), KjaColors.sky, Color(0xFF0369A1)],
                    ),
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: [
                      BoxShadow(
                        color: (active ? KjaColors.rose : KjaColors.sky).withValues(alpha: 0.38),
                        blurRadius: 16,
                        offset: const Offset(0, 7),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.home_rounded, color: Colors.white, size: 28),
                ),
                const SizedBox(height: 4),
                Text(
                  'Home',
                  style: TextStyle(
                    color: active ? KjaColors.rose : KjaColors.soft,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Drawer: pupil header → grouped links → sign out.
class PupilMenu extends StatelessWidget {
  const PupilMenu({
    super.key,
    required this.displayName,
    required this.classLabel,
    required this.current,
    required this.messageBadge,
    required this.noticeBadge,
    required this.onSelect,
    required this.onSignOut,
    this.house,
    this.photoUrl,
  });

  final String displayName;
  final String classLabel;
  final String? photoUrl;
  final AppDestination current;
  final int messageBadge;
  final int noticeBadge;
  final ValueChanged<AppDestination> onSelect;
  final VoidCallback onSignOut;
  final String? house;

  int _badgeFor(AppDestination destination) {
    if (destination == AppDestination.messages) return messageBadge;
    if (destination == AppDestination.notices) return noticeBadge;
    return 0;
  }

  void _go(BuildContext context, AppDestination destination) {
    Navigator.pop(context);
    onSelect(destination);
  }

  @override
  Widget build(BuildContext context) {
    final avatarColor = houseColor(house);
    final items = AppDestination.sidebarItems;

    return Drawer(
      width: 304,
      child: ColoredBox(
        color: const Color(0xFFF7FAFC),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SideHeader(
                  displayName: displayName,
                  avatarColor: avatarColor,
                  photoUrl: photoUrl,
                  onHome: () => _go(context, AppDestination.home),
                  onClose: () => Navigator.pop(context),
                ),
                const SizedBox(height: 6),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.only(top: 4, bottom: 8),
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final destination = items[index];
                      final group = sidebarGroupTitle(destination);
                      final prevGroup = index > 0 ? sidebarGroupTitle(items[index - 1]) : null;
                      final showGroup = group.isNotEmpty && group != prevGroup;
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (showGroup) _SideGroupLabel(group),
                          _SideLink(
                            destination: destination,
                            active: current == destination,
                            badge: _badgeFor(destination),
                            onTap: () => _go(context, destination),
                          ),
                        ],
                      );
                    },
                  ),
                ),
                _SideFoot(
                  displayName: displayName,
                  classLabel: classLabel,
                  avatarColor: avatarColor,
                  photoUrl: photoUrl,
                  onSignOut: onSignOut,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SideHeader extends StatelessWidget {
  const _SideHeader({
    required this.displayName,
    required this.avatarColor,
    required this.onHome,
    required this.onClose,
    this.photoUrl,
  });

  final String displayName;
  final Color avatarColor;
  final String? photoUrl;
  final VoidCallback onHome;
  final VoidCallback onClose;

  static const _markSize = 56.0;

  @override
  Widget build(BuildContext context) {
    final first = firstNameOf(displayName);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(0, 4, 0, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // School logo — same size as pupil photo
              Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: onHome,
                  customBorder: const CircleBorder(),
                  child: Container(
                    width: _markSize,
                    height: _markSize,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white,
                      border: Border.all(color: const Color(0xFFE8EDF2)),
                      boxShadow: [
                        BoxShadow(
                          color: KjaColors.ink.withValues(alpha: 0.08),
                          blurRadius: 10,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: const Padding(
                      padding: EdgeInsets.all(6),
                      child: SchoolMark(size: 44),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Student name + school name
              Expanded(
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: onHome,
                    borderRadius: BorderRadius.circular(10),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            first,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: KjaColors.ink,
                              height: 1.15,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 3),
                          const Text(
                            'Kampala Junior Academy',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w500,
                              color: KjaColors.soft,
                              height: 1.25,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Student image — fixed size, not inside Expanded
              PupilFace(
                name: displayName,
                color: avatarColor,
                radius: _markSize / 2,
                photoUrl: photoUrl,
              ),
              IconButton(
                tooltip: 'Close',
                onPressed: onClose,
                visualDensity: VisualDensity.compact,
                style: IconButton.styleFrom(
                  foregroundColor: KjaColors.mute,
                  padding: const EdgeInsets.all(6),
                  minimumSize: const Size(36, 36),
                ),
                icon: const Icon(Icons.close_rounded, size: 20),
              ),
            ],
          ),
        ),
        Container(height: 1, color: const Color(0xFFE8EDF2)),
      ],
    );
  }
}

/// Circular pupil portrait, falling back to initials when no photo URL is ready.
class PupilFace extends StatelessWidget {
  const PupilFace({
    super.key,
    required this.name,
    this.color,
    this.radius = 22,
    this.photoUrl,
  });

  final String name;
  final Color? color;
  final double radius;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final tone = color ?? KjaColors.sky;
    final url = photoUrl?.trim() ?? '';
    final size = radius * 2;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: KjaColors.ink.withValues(alpha: 0.08),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
        border: Border.all(color: Colors.white, width: 2),
      ),
      child: ClipOval(
        child: url.isEmpty
            ? _Initials(name: name, tone: tone, radius: radius)
            : Image.network(
                url,
                fit: BoxFit.cover,
                width: size,
                height: size,
                gaplessPlayback: true,
                errorBuilder: (_, _, _) => _Initials(name: name, tone: tone, radius: radius),
                loadingBuilder: (context, child, progress) {
                  if (progress == null) return child;
                  return _Initials(name: name, tone: tone, radius: radius);
                },
              ),
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.name, required this.tone, required this.radius});

  final String name;
  final Color tone;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [tone.withValues(alpha: 0.9), tone],
        ),
      ),
      child: Center(
        child: Text(
          initialsOf(name),
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: radius * 0.72,
            letterSpacing: 0.4,
          ),
        ),
      ),
    );
  }
}

class _SideGroupLabel extends StatelessWidget {
  const _SideGroupLabel(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 12, 10, 4),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          color: KjaColors.mute.withValues(alpha: 0.95),
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.9,
        ),
      ),
    );
  }
}

class _SideLink extends StatelessWidget {
  const _SideLink({
    required this.destination,
    required this.active,
    required this.badge,
    required this.onTap,
  });

  final AppDestination destination;
  final bool active;
  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = destination.tone;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            curve: Curves.easeOutCubic,
            constraints: const BoxConstraints(minHeight: 52),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: active ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(16),
              border: active ? Border.all(color: KjaColors.gold.withValues(alpha: 0.7), width: 2) : null,
              boxShadow: active
                  ? [
                      BoxShadow(
                        color: KjaColors.ink.withValues(alpha: 0.1),
                        blurRadius: 14,
                        offset: const Offset(0, 5),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              children: [
                ToneIcon(icon: destination.icon, tone: tone, size: 40, iconSize: 20, active: active),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    destination.menuLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 15.5,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w700,
                      color: KjaColors.ink,
                    ),
                  ),
                ),
                if (badge > 0)
                  Container(
                    constraints: const BoxConstraints(minWidth: 22),
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: KjaColors.rose,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: KjaColors.rose.withValues(alpha: 0.35),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      badge > 99 ? '99+' : '$badge',
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SideFoot extends StatelessWidget {
  const _SideFoot({
    required this.displayName,
    required this.classLabel,
    required this.avatarColor,
    required this.onSignOut,
    this.photoUrl,
  });

  final String displayName;
  final String classLabel;
  final Color avatarColor;
  final String? photoUrl;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(top: 12),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0xFFE8EDF2))),
      ),
      child: Row(
        children: [
          PupilFace(name: displayName, color: avatarColor, radius: 18, photoUrl: photoUrl),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, color: KjaColors.ink),
                ),
                Text(
                  classLabel.isEmpty ? 'Pupil' : classLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w500, fontSize: 11.5),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Sign out',
            onPressed: onSignOut,
            style: IconButton.styleFrom(
              backgroundColor: const Color(0xFFF1F5F9),
              foregroundColor: KjaColors.soft,
            ),
            icon: const Icon(Icons.logout_rounded, size: 20),
          ),
        ],
      ),
    );
  }
}
