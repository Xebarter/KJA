import 'package:flutter/material.dart';

import '../format.dart';
import '../navigation.dart';
import '../pupil_photos.dart';
import '../theme.dart';

/// School crest used in splash, gates, drawer, and header.
class SchoolMark extends StatelessWidget {
  const SchoolMark({super.key, this.size = 44});

  static const assetPath = 'assets/kja-logo.png';

  final double size;

  @override
  Widget build(BuildContext context) {
    return Center(
      widthFactor: 1,
      heightFactor: 1,
      child: SizedBox(
        width: size,
        height: size,
        child: ClipOval(
          child: Image.asset(
            assetPath,
            width: size,
            height: size,
            fit: BoxFit.cover,
            filterQuality: FilterQuality.high,
            gaplessPlayback: true,
            semanticLabel: 'Kampala Junior Academy',
            errorBuilder: (context, error, stackTrace) => ColoredBox(
              color: Colors.white,
              child: Icon(Icons.school_rounded, size: size * 0.55, color: KjaColors.navy),
            ),
          ),
        ),
      ),
    );
  }
}

/// Standard list padding for portal destinations.
const kPortalPadding = EdgeInsets.fromLTRB(16, 12, 16, 32);

/// Scroll host used by every destination — consistent inset and bounce.
class PortalScroll extends StatelessWidget {
  const PortalScroll({super.key, required this.children, this.padding = kPortalPadding, this.controller});

  final List<Widget> children;
  final EdgeInsetsGeometry padding;
  final ScrollController? controller;

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: controller,
      padding: padding,
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: children,
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
        color: active ? Color.lerp(tone.wash, Colors.white, 0.15) : tone.wash,
        borderRadius: BorderRadius.circular(size * 0.32),
        border: Border.all(color: tone.ink.withValues(alpha: active ? 0.22 : 0.08)),
      ),
      child: Icon(icon, size: iconSize, color: tone.ink),
    );
  }
}

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
            borderRadius: BorderRadius.circular(15),
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
                  child: Icon(icon, size: 21, color: enabled ? tone.ink : KjaColors.mute),
                ),
                if (badge > 0)
                  Positioned(
                    right: -2,
                    top: -2,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 17),
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

/// Quiet page context with optional tone accent.
class PageIntro extends StatelessWidget {
  const PageIntro({
    super.key,
    required this.title,
    this.eyebrow,
    this.detail,
    this.footer,
    this.tone,
  });

  final String title;
  final String? eyebrow;
  final String? detail;
  final Widget? footer;
  final Tone? tone;

  @override
  Widget build(BuildContext context) {
    final accent = tone ?? Tone.navy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if ((eyebrow ?? '').isNotEmpty) ...[
          Text(
            eyebrow!,
            style: TextStyle(
              color: accent.ink.withValues(alpha: 0.78),
              fontWeight: FontWeight.w800,
              fontSize: 11.5,
              letterSpacing: 0.55,
            ),
          ),
          const SizedBox(height: 6),
        ],
        Text(
          title,
          style: const TextStyle(
            color: KjaColors.ink,
            fontSize: 24,
            fontWeight: FontWeight.w800,
            height: 1.15,
            letterSpacing: -0.4,
          ),
        ),
        if ((detail ?? '').isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            detail!,
            style: const TextStyle(
              color: KjaColors.soft,
              height: 1.45,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        if (footer != null) ...[const SizedBox(height: 12), footer!],
      ],
    );
  }
}

/// Navy greeting panel used on Home and key destinations.
class BrandHero extends StatelessWidget {
  const BrandHero({
    super.key,
    required this.title,
    this.eyebrow,
    this.detail,
    this.trailing,
    this.child,
    this.colors = const [KjaColors.navyDeep, KjaColors.navy, Color(0xFF1E5A8A)],
  });

  final String title;
  final String? eyebrow;
  final String? detail;
  final Widget? trailing;
  final Widget? child;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 16, 16, 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colors,
        ),
        boxShadow: [
          BoxShadow(
            color: colors.first.withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -22,
            top: -30,
            child: Container(
              width: 110,
              height: 110,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.05),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if ((eyebrow ?? '').isNotEmpty) ...[
                          Text(
                            eyebrow!,
                            style: TextStyle(
                              color: KjaColors.gold.withValues(alpha: 0.95),
                              fontWeight: FontWeight.w800,
                              fontSize: 11.5,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 5),
                        ],
                        Text(
                          title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            height: 1.15,
                            letterSpacing: -0.3,
                          ),
                        ),
                        if ((detail ?? '').isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            detail!,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.78),
                              height: 1.4,
                              fontWeight: FontWeight.w600,
                              fontSize: 13.5,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (trailing != null) ...[const SizedBox(width: 10), trailing!],
                ],
              ),
              if (child != null) ...[const SizedBox(height: 14), child!],
            ],
          ),
        ],
      ),
    );
  }
}

class SoftCard extends StatelessWidget {
  const SoftCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color = Colors.white,
    this.onTap,
    this.expand = true,
    this.accent,
    this.glow = false,
  });

  final Widget child;
  final EdgeInsets padding;
  final Color color;
  final VoidCallback? onTap;
  final bool expand;
  final Color? accent;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    final edge = accent;
    const radius = 18.0;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color: KjaColors.ink.withValues(alpha: glow ? 0.06 : 0.035),
            blurRadius: glow ? 16 : 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: color,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: BorderSide(color: edge?.withValues(alpha: 0.22) ?? KjaColors.line),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(radius),
          child: Container(
            width: expand ? double.infinity : null,
            padding: padding,
            decoration: edge == null
                ? null
                : BoxDecoration(
                    border: Border(
                      left: BorderSide(color: edge, width: 3),
                    ),
                  ),
            child: child,
          ),
        ),
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.label,
    this.tone = Tone.sky,
    this.filled = false,
  });

  final String label;
  final Tone tone;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: filled ? tone.ink : tone.wash,
        borderRadius: BorderRadius.circular(999),
        border: filled ? null : Border.all(color: tone.ink.withValues(alpha: 0.12)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: filled ? Colors.white : tone.ink,
          fontWeight: FontWeight.w800,
          fontSize: 11.5,
          letterSpacing: 0.1,
        ),
      ),
    );
  }
}

class EmptyNote extends StatelessWidget {
  const EmptyNote({super.key, required this.icon, required this.message, this.title});

  final IconData icon;
  final String message;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Tone.sky.wash,
              border: Border.all(color: Tone.sky.ink.withValues(alpha: 0.1)),
            ),
            child: Icon(icon, size: 24, color: Tone.sky.ink),
          ),
          const SizedBox(height: 14),
          if (title != null) ...[
            Text(
              title!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, letterSpacing: -0.15),
            ),
            const SizedBox(height: 6),
          ],
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: KjaColors.soft, height: 1.45, fontSize: 14, fontWeight: FontWeight.w600),
          ),
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
        Container(
          width: 3,
          height: 16,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(99),
            color: KjaColors.gold,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: -0.2),
          ),
        ),
        if (action != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(action!),
          ),
      ],
    );
  }
}

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
      builder: (context, _) {
        final tone = color ?? KjaColors.sky;
        final size = radius * 2;
        final fallback = DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [tone.withValues(alpha: 0.85), tone],
            ),
          ),
          child: Center(
            child: Text(
              initialsOf(name),
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: radius * 0.72),
            ),
          ),
        );
        final cached = PupilPhotoCache.bytes(studentId);
        final url = photoUrl?.trim() ?? '';
        Widget child = fallback;
        if (cached != null && cached.isNotEmpty) {
          child = Image.memory(cached, fit: BoxFit.cover, width: size, height: size, errorBuilder: (_, _, _) => fallback);
        } else if (url.startsWith('http')) {
          child = Image.network(
            url,
            fit: BoxFit.cover,
            width: size,
            height: size,
            errorBuilder: (_, _, _) => fallback,
            loadingBuilder: (context, image, progress) => progress == null ? image : fallback,
          );
        }
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white,
            boxShadow: [
              BoxShadow(color: KjaColors.ink.withValues(alpha: 0.07), blurRadius: 8, offset: const Offset(0, 3)),
            ],
            border: Border.all(color: Colors.white, width: 2),
          ),
          child: ClipOval(child: child),
        );
      },
    );
  }
}

class DateStamp extends StatelessWidget {
  const DateStamp({super.key, required this.day, required this.month, this.tone = Tone.sky});

  final String day;
  final String month;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [tone.wash, Colors.white],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tone.ink.withValues(alpha: 0.12)),
      ),
      child: Column(
        children: [
          Text(day, style: TextStyle(color: tone.ink, fontWeight: FontWeight.w900, fontSize: 20, height: 1)),
          const SizedBox(height: 2),
          Text(
            month.toUpperCase(),
            style: TextStyle(color: tone.ink.withValues(alpha: 0.75), fontWeight: FontWeight.w800, fontSize: 10, letterSpacing: 0.4),
          ),
        ],
      ),
    );
  }
}

/// Children · Home · Communications dock.
class ParentDock extends StatelessWidget {
  const ParentDock({super.key, required this.current, required this.onSelect, this.commsBadge = 0});

  final AppDestination current;
  final ValueChanged<AppDestination> onSelect;
  final int commsBadge;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.97),
          border: Border(top: BorderSide(color: KjaColors.line.withValues(alpha: 0.9))),
          boxShadow: [
            BoxShadow(color: KjaColors.ink.withValues(alpha: 0.07), blurRadius: 24, offset: const Offset(0, -8)),
          ],
        ),
          child: Padding(
          padding: EdgeInsets.fromLTRB(12, 8, 12, bottom > 0 ? bottom : 10),
          child: Row(
            children: [
              _side(AppDestination.children),
              _home(),
              _side(AppDestination.communications, badge: commsBadge),
            ],
          ),
        ),
      ),
    );
  }

  Widget _side(AppDestination dest, {int badge = 0}) {
    final active = current == dest;
    final tone = dest.tone;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => onSelect(dest),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
              decoration: BoxDecoration(
                color: active ? tone.wash : Colors.transparent,
                borderRadius: BorderRadius.circular(20),
                border: active ? Border.all(color: tone.ink.withValues(alpha: 0.12)) : null,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      ToneIcon(icon: dest.icon, tone: tone, size: 40, iconSize: 20, active: active),
                      if (badge > 0)
                        Positioned(
                          right: -4,
                          top: -4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                            decoration: BoxDecoration(
                              color: KjaColors.rose,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: Colors.white, width: 1.5),
                            ),
                            child: Text(
                              badge > 99 ? '99+' : '$badge',
                              style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    dest.label,
                    style: TextStyle(
                      color: active ? tone.ink : KjaColors.soft,
                      fontWeight: active ? FontWeight.w900 : FontWeight.w600,
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
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: active ? KjaColors.navy : KjaColors.skyDeep,
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: [
                      BoxShadow(
                        color: KjaColors.navy.withValues(alpha: active ? 0.22 : 0.12),
                        blurRadius: 12,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.home_rounded, color: Colors.white, size: 24),
                ),
                const SizedBox(height: 5),
                Text(
                  'Home',
                  style: TextStyle(
                    color: active ? KjaColors.navy : KjaColors.soft,
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

class ParentMenu extends StatelessWidget {
  const ParentMenu({
    super.key,
    required this.displayName,
    required this.current,
    required this.noticeBadge,
    required this.onSelect,
    required this.onSignOut,
    this.subtitle = 'Parent account',
  });

  final String displayName;
  final String subtitle;
  final AppDestination current;
  final int noticeBadge;
  final ValueChanged<AppDestination> onSelect;
  final VoidCallback onSignOut;

  int _badgeFor(AppDestination destination) {
    if (destination == AppDestination.notices) return noticeBadge;
    return 0;
  }

  void _closeDrawer(BuildContext context) {
    final scaffold = Scaffold.maybeOf(context);
    if (scaffold?.isDrawerOpen ?? false) {
      scaffold!.closeDrawer();
      return;
    }
    final nav = Navigator.maybeOf(context);
    if (nav != null && nav.canPop()) nav.pop();
  }

  void _go(BuildContext context, AppDestination destination) {
    _closeDrawer(context);
    onSelect(destination);
  }

  @override
  Widget build(BuildContext context) {
    final items = AppDestination.menuItems;
    return Drawer(
      width: 304,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [KjaColors.pageTop, KjaColors.pageMid, KjaColors.pageBottom],
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
                  subtitle: subtitle,
                  onHome: () => _go(context, AppDestination.home),
                  onClose: () => _closeDrawer(context),
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
    required this.subtitle,
    required this.onHome,
    required this.onClose,
  });

  final String displayName;
  final String subtitle;
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
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white,
                    border: Border.all(color: KjaColors.gold.withValues(alpha: 0.35), width: 1.5),
                    boxShadow: [
                      BoxShadow(color: KjaColors.navy.withValues(alpha: 0.1), blurRadius: 10, offset: const Offset(0, 3)),
                    ],
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: const Padding(padding: EdgeInsets.all(5), child: SchoolMark(size: 36)),
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
            borderRadius: BorderRadius.circular(24),
            child: Ink(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [KjaColors.navyDeep, KjaColors.navy, Color(0xFF1E5A8A)],
                ),
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(color: KjaColors.navy.withValues(alpha: 0.28), blurRadius: 18, offset: const Offset(0, 8)),
                ],
              ),
              child: Row(
                children: [
                  PupilFace(name: displayName, color: KjaColors.sky, radius: 26),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Hi, $first',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                            height: 1.1,
                            letterSpacing: -0.2,
                          ),
                        ),
                        const SizedBox(height: 7),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(color: KjaColors.gold.withValues(alpha: 0.35)),
                          ),
                          child: Text(
                            subtitle,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
                          ),
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

class _SideGroupLabel extends StatelessWidget {
  const _SideGroupLabel(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 16, 4, 7),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          color: KjaColors.mute,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.7,
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
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: active ? Colors.white : Colors.white.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: active ? tone.ink.withValues(alpha: 0.22) : tone.ink.withValues(alpha: 0.06),
                width: 1,
              ),
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
                    style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: active ? tone.ink : KjaColors.ink),
                  ),
                ),
                if (badge > 0)
                  Container(
                    constraints: const BoxConstraints(minWidth: 24),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: KjaColors.rose, borderRadius: BorderRadius.circular(999)),
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
            ),
            child: const Row(
              children: [
                Icon(Icons.logout_rounded, color: KjaColors.rose, size: 22),
                SizedBox(width: 12),
                Expanded(
                  child: Text('Sign out', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: KjaColors.rose)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
