import 'package:flutter/material.dart';

import '../format.dart';
import '../navigation.dart';
import '../pupil_photos.dart';
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
  const InitialAvatar({
    super.key,
    required this.name,
    this.color,
    this.radius = 22,
    this.photoUrl,
    this.studentId,
  });

  final String name;
  final Color? color;
  final double radius;
  final String? photoUrl;
  final String? studentId;

  @override
  Widget build(BuildContext context) {
    return PupilFace(
      name: name,
      color: color,
      radius: radius,
      photoUrl: photoUrl,
      studentId: studentId,
    );
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

/// Drawer: colourful hello header → big grouped links → clear sign out.
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
    this.studentId,
  });

  final String displayName;
  final String classLabel;
  final String? photoUrl;
  final String? studentId;
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
      width: 312,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFEEF7FF), Color(0xFFF5FBFF), Color(0xFFFFF8EF)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SideHeader(
                  displayName: displayName,
                  classLabel: classLabel,
                  avatarColor: avatarColor,
                  photoUrl: photoUrl,
                  studentId: studentId,
                  onHome: () => _go(context, AppDestination.home),
                  onClose: () => Navigator.pop(context),
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.only(bottom: 8),
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
                _SideFoot(onSignOut: onSignOut),
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
    required this.classLabel,
    required this.avatarColor,
    required this.onHome,
    required this.onClose,
    this.photoUrl,
    this.studentId,
  });

  final String displayName;
  final String classLabel;
  final Color avatarColor;
  final String? photoUrl;
  final String? studentId;
  final VoidCallback onHome;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final first = firstNameOf(displayName);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onHome,
                customBorder: const CircleBorder(),
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white,
                    border: Border.all(color: KjaColors.sky.withValues(alpha: 0.2)),
                    boxShadow: [
                      BoxShadow(color: KjaColors.sky.withValues(alpha: 0.12), blurRadius: 10, offset: const Offset(0, 3)),
                    ],
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: const Padding(
                    padding: EdgeInsets.all(5),
                    child: SchoolMark(size: 34),
                  ),
                ),
              ),
            ),
            const Spacer(),
            Material(
              color: Colors.white,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onClose,
                child: const SizedBox(
                  width: 40,
                  height: 40,
                  child: Icon(Icons.close_rounded, size: 22, color: KjaColors.soft),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onHome,
            borderRadius: BorderRadius.circular(22),
            child: Ink(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF38BDF8), KjaColors.sky, Color(0xFF0284C7)],
                ),
                borderRadius: BorderRadius.circular(22),
                boxShadow: [
                  BoxShadow(color: KjaColors.sky.withValues(alpha: 0.28), blurRadius: 14, offset: const Offset(0, 5)),
                ],
              ),
              child: Row(
                children: [
                  PupilFace(
                    name: displayName,
                    color: avatarColor,
                    radius: 32,
                    photoUrl: photoUrl,
                    studentId: studentId,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Hi, $first!',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            height: 1.1,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            if (classLabel.isNotEmpty)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.22),
                                  borderRadius: BorderRadius.circular(99),
                                ),
                                child: Text(
                                  classLabel,
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
                                ),
                              ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.22),
                                borderRadius: BorderRadius.circular(99),
                              ),
                              child: const Text(
                                'KJA',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Circular pupil portrait, falling back to initials when no photo is ready.
///
/// Prefers in-memory bytes from [PupilPhotoCache], then http(s) via [Image.network]
/// (Supabase signed URLs or the site proxy). Rebuilds when the cache updates.
class PupilFace extends StatelessWidget {
  const PupilFace({
    super.key,
    required this.name,
    this.color,
    this.radius = 22,
    this.photoUrl,
    this.studentId,
  });

  final String name;
  final Color? color;
  final double radius;
  final String? photoUrl;
  final String? studentId;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: PupilPhotoCache.instance,
      builder: (context, _) => _PupilFaceView(
        name: name,
        color: color,
        radius: radius,
        photoUrl: photoUrl,
        studentId: studentId,
      ),
    );
  }
}

class _PupilFaceView extends StatelessWidget {
  const _PupilFaceView({
    required this.name,
    required this.radius,
    this.color,
    this.photoUrl,
    this.studentId,
  });

  final String name;
  final Color? color;
  final double radius;
  final String? photoUrl;
  final String? studentId;

  @override
  Widget build(BuildContext context) {
    final tone = color ?? KjaColors.sky;
    final size = radius * 2;
    final fallback = _Initials(name: name, tone: tone, radius: radius);
    final cached = PupilPhotoCache.bytes(studentId);
    final url = photoUrl?.trim() ?? '';

    Widget child = fallback;
    if (cached != null && cached.isNotEmpty) {
      child = Image.memory(
        cached,
        fit: BoxFit.cover,
        width: size,
        height: size,
        gaplessPlayback: true,
        errorBuilder: (_, _, _) => fallback,
      );
    } else if (url.startsWith('memory:')) {
      final bytes = PupilPhotoCache.bytes(url.substring('memory:'.length));
      if (bytes != null && bytes.isNotEmpty) {
        child = Image.memory(
          bytes,
          fit: BoxFit.cover,
          width: size,
          height: size,
          gaplessPlayback: true,
          errorBuilder: (_, _, _) => fallback,
        );
      }
    } else if (url.startsWith('data:')) {
      try {
        final data = Uri.parse(url).data;
        if (data != null) {
          child = Image.memory(
            data.contentAsBytes(),
            fit: BoxFit.cover,
            width: size,
            height: size,
            gaplessPlayback: true,
            errorBuilder: (_, _, _) => fallback,
          );
        }
      } catch (_) {}
    } else if (url.startsWith('http')) {
      child = Image.network(
        url,
        key: ValueKey(url),
        fit: BoxFit.cover,
        width: size,
        height: size,
        gaplessPlayback: true,
        filterQuality: FilterQuality.medium,
        errorBuilder: (_, _, _) => fallback,
        loadingBuilder: (context, image, progress) {
          if (progress == null) return image;
          return fallback;
        },
      );
    }

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
        border: Border.all(color: Colors.white, width: 2.5),
      ),
      child: ClipOval(child: child),
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
      padding: const EdgeInsets.fromLTRB(4, 14, 4, 6),
      child: Text(
        title,
        style: const TextStyle(
          color: KjaColors.ink,
          fontSize: 13,
          fontWeight: FontWeight.w900,
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
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            curve: Curves.easeOutCubic,
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: active ? Colors.white : Colors.white.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: active ? tone.ink.withValues(alpha: 0.35) : tone.ink.withValues(alpha: 0.1),
                width: active ? 1.6 : 1,
              ),
              boxShadow: active
                  ? [BoxShadow(color: tone.ink.withValues(alpha: 0.16), blurRadius: 12, offset: const Offset(0, 4))]
                  : [BoxShadow(color: tone.ink.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Row(
              children: [
                ToneIcon(icon: destination.icon, tone: tone, size: 42, iconSize: 22, active: active),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    destination.menuLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: active ? tone.ink : KjaColors.ink,
                    ),
                  ),
                ),
                if (badge > 0)
                  Container(
                    constraints: const BoxConstraints(minWidth: 24),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: KjaColors.rose,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      badge > 99 ? '99+' : '$badge',
                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900),
                    ),
                  )
                else if (active)
                  Icon(Icons.chevron_right_rounded, color: tone.ink.withValues(alpha: 0.7)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SideFoot extends StatelessWidget {
  const _SideFoot({required this.onSignOut});

  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onSignOut,
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: KjaColors.rose.withValues(alpha: 0.2)),
              boxShadow: [
                BoxShadow(color: KjaColors.rose.withValues(alpha: 0.08), blurRadius: 10, offset: const Offset(0, 3)),
              ],
            ),
            child: const Row(
              children: [
                Icon(Icons.logout_rounded, color: KjaColors.rose, size: 22),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Sign out',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: KjaColors.rose),
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
