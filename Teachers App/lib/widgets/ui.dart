import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../format.dart';
import '../navigation.dart';
import '../theme.dart';

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
              child: Icon(
                Icons.school_rounded,
                size: size * 0.55,
                color: KjaColors.navy,
              ),
            ),
          ),
        ),
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
        border: active
            ? Border.all(color: tone.ink.withValues(alpha: 0.22))
            : null,
        boxShadow: active
            ? [
                BoxShadow(
                  color: tone.ink.withValues(alpha: 0.18),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
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
                      color: enabled
                          ? tone.ink.withValues(alpha: 0.12)
                          : const Color(0xFFE8EDF2),
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
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 2,
                      ),
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

/// Quiet page context. Prefer this over a colored hero when the app bar
/// already names the screen.
class PageIntro extends StatelessWidget {
  const PageIntro({
    super.key,
    required this.title,
    this.eyebrow,
    this.detail,
    this.footer,
  });

  final String title;
  final String? eyebrow;
  final String? detail;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if ((eyebrow ?? '').isNotEmpty) ...[
          Text(
            eyebrow!,
            style: const TextStyle(
              color: KjaColors.mute,
              fontWeight: FontWeight.w700,
              fontSize: 12,
              letterSpacing: 0.15,
            ),
          ),
          const SizedBox(height: 6),
        ],
        Text(
          title,
          style: const TextStyle(
            color: KjaColors.ink,
            fontSize: 22,
            fontWeight: FontWeight.w800,
            height: 1.15,
            letterSpacing: -0.35,
          ),
        ),
        if ((detail ?? '').isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            detail!,
            style: const TextStyle(
              color: KjaColors.soft,
              height: 1.4,
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

class StatusChip extends StatelessWidget {
  const StatusChip({
    super.key,
    required this.label,
    this.tone = Tone.sky,
    this.filled = true,
  });

  final String label;
  final Tone tone;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: filled ? tone.wash : Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone.ink.withValues(alpha: filled ? 0.12 : 0.22)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: tone.ink,
          fontWeight: FontWeight.w800,
          fontSize: 12,
        ),
      ),
    );
  }
}

class DeskRow extends StatelessWidget {
  const DeskRow({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.meta,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final String? meta;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (leading != null) ...[leading!, const SizedBox(width: 12)],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15.5,
                  height: 1.2,
                ),
              ),
              if (subtitle != null && subtitle!.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  subtitle!,
                  style: const TextStyle(
                    color: KjaColors.soft,
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
              ],
              if (meta != null && meta!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  meta!,
                  style: const TextStyle(
                    color: KjaColors.ink,
                    fontWeight: FontWeight.w700,
                    fontSize: 12.5,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 10), trailing!],
      ],
    );
  }
}

class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    required this.tone,
    required this.icon,
    this.onTap,
  });

  final String label;
  final String value;
  final Tone tone;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ToneIcon(icon: icon, tone: tone, size: 36, iconSize: 18),
          const SizedBox(height: 12),
          Text(
            value,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: KjaColors.navy,
              height: 1.05,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: const TextStyle(
              color: KjaColors.soft,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

class ProgressBar extends StatelessWidget {
  const ProgressBar({
    super.key,
    required this.value,
    this.color = KjaColors.sky,
    this.height = 8,
  });

  final double value;
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: LinearProgressIndicator(
        value: value.clamp(0.0, 1.0),
        minHeight: height,
        backgroundColor: KjaColors.line,
        color: color,
      ),
    );
  }
}

class QuickTile extends StatelessWidget {
  const QuickTile({
    super.key,
    required this.label,
    required this.icon,
    required this.tone,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Tone tone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      child: Column(
        children: [
          ToneIcon(icon: icon, tone: tone, size: 42, iconSize: 20),
          const SizedBox(height: 8),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: tone.ink,
              fontWeight: FontWeight.w800,
              fontSize: 12.5,
            ),
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
    this.onTap,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: KjaColors.ink.withValues(alpha: 0.045),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Material(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: BorderSide(color: KjaColors.line.withValues(alpha: 0.95)),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(22),
          child: Container(
            width: double.infinity,
            padding: padding,
            child: child,
          ),
        ),
      ),
    );
  }
}

class EmptyNote extends StatelessWidget {
  const EmptyNote({
    super.key,
    required this.icon,
    required this.message,
    this.title,
  });

  final IconData icon;
  final String message;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
      child: Column(
        children: [
          ToneIcon(icon: icon, tone: Tone.sky, size: 52, iconSize: 24),
          const SizedBox(height: 14),
          if (title != null) ...[
            Text(
              title!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            const SizedBox(height: 6),
          ],
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: KjaColors.soft,
              height: 1.45,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle({
    super.key,
    required this.title,
    this.action,
    this.onAction,
  });

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
          ),
        ),
        if (action != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8),
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
    this.photoBytes,
  });

  final String name;
  final Color? color;
  final double radius;
  final String? photoUrl;
  final List<int>? photoBytes;

  @override
  Widget build(BuildContext context) {
    final tone = color ?? KjaColors.sky;
    final size = radius * 2;
    final fallback = DecoratedBox(
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
          ),
        ),
      ),
    );
    final bytes = photoBytes;
    final url = photoUrl?.trim() ?? '';
    final Widget child;
    if (bytes != null && bytes.isNotEmpty) {
      final memory = bytes is Uint8List ? bytes : Uint8List.fromList(bytes);
      child = Image.memory(
        memory,
        fit: BoxFit.cover,
        width: size,
        height: size,
        gaplessPlayback: true,
        errorBuilder: (_, _, _) => fallback,
      );
    } else if (url.startsWith('http')) {
      child = Image.network(
        url,
        fit: BoxFit.cover,
        width: size,
        height: size,
        gaplessPlayback: true,
        errorBuilder: (_, _, _) => fallback,
      );
    } else {
      child = fallback;
    }
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: Colors.white, width: 2.5),
        boxShadow: [
          BoxShadow(
            color: KjaColors.ink.withValues(alpha: 0.08),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: ClipOval(child: child),
    );
  }
}

class DeskScroll extends StatelessWidget {
  const DeskScroll({super.key, required this.children, this.padding});

  final List<Widget> children;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: padding ?? const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) SizedBox(height: i == 1 ? 16 : 12),
          children[i],
        ],
      ],
    );
  }
}

class ChoiceChips extends StatelessWidget {
  const ChoiceChips({
    super.key,
    required this.labels,
    required this.selected,
    required this.onSelect,
  });

  final List<String> labels;
  final String selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            ChoiceChip(
              label: Text(labels[i]),
              selected: selected == labels[i],
              onSelected: (_) => onSelect(labels[i]),
              visualDensity: VisualDensity.compact,
            ),
          ],
        ],
      ),
    );
  }
}

class SheetScaffold extends StatelessWidget {
  const SheetScaffold({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 10, 16, 16 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: KjaColors.line,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900, letterSpacing: -0.2),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!, style: const TextStyle(color: KjaColors.soft, height: 1.35)),
          ],
          const SizedBox(height: 14),
          Flexible(child: SingleChildScrollView(child: child)),
        ],
      ),
    );
  }
}

/// Resources · Home · Chat dock.
class TeacherDock extends StatelessWidget {
  const TeacherDock({
    super.key,
    required this.current,
    required this.onSelect,
    this.resourcesBadge = 0,
    this.chatBadge = 0,
  });

  final AppDestination current;
  final ValueChanged<AppDestination> onSelect;
  final int resourcesBadge;
  final int chatBadge;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.96),
          border: const Border(top: BorderSide(color: KjaColors.line)),
          boxShadow: [
            BoxShadow(
              color: KjaColors.ink.withValues(alpha: 0.05),
              blurRadius: 18,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: Padding(
          padding: EdgeInsets.fromLTRB(12, 8, 12, bottom > 0 ? bottom : 10),
          child: Row(
            children: [
              _side(AppDestination.resources, badge: resourcesBadge),
              _home(),
              _side(AppDestination.chat, badge: chatBadge),
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
            borderRadius: BorderRadius.circular(18),
            onTap: () => onSelect(dest),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
              decoration: BoxDecoration(
                color: active ? tone.wash : Colors.transparent,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      ToneIcon(
                        icon: dest.icon,
                        tone: tone,
                        size: 38,
                        iconSize: 19,
                        active: active,
                      ),
                      if (badge > 0)
                        Positioned(
                          right: -4,
                          top: -4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 5,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: KjaColors.rose,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: Colors.white,
                                width: 1.5,
                              ),
                            ),
                            child: Text(
                              badge > 99 ? '99+' : '$badge',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    dest.label,
                    style: TextStyle(
                      color: active ? tone.ink : KjaColors.soft,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w600,
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
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: active
                          ? const [Color(0xFF1E4D7B), KjaColors.navy]
                          : const [Color(0xFF38BDF8), KjaColors.skyDeep],
                    ),
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: [
                      BoxShadow(
                        color: KjaColors.navy.withValues(
                          alpha: active ? 0.28 : 0.16,
                        ),
                        blurRadius: 14,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.home_rounded,
                    color: Colors.white,
                    size: 26,
                  ),
                ),
                const SizedBox(height: 4),
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

class TeacherMenu extends StatelessWidget {
  const TeacherMenu({
    super.key,
    required this.displayName,
    required this.subtitle,
    required this.current,
    required this.items,
    required this.onSelect,
    required this.onSignOut,
  });

  final String displayName;
  final String subtitle;
  final AppDestination current;
  final List<AppDestination> items;
  final ValueChanged<AppDestination> onSelect;
  final VoidCallback onSignOut;

  void _closeDrawer(BuildContext context) {
    final scaffold = Scaffold.maybeOf(context);
    if (scaffold?.isDrawerOpen ?? false) {
      scaffold!.closeDrawer();
      return;
    }
    final nav = Navigator.maybeOf(context);
    if (nav != null && nav.canPop()) nav.pop();
  }

  @override
  Widget build(BuildContext context) {
    return Drawer(
      width: 304,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              KjaColors.pageTop,
              KjaColors.pageMid,
              KjaColors.pageBottom,
            ],
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
                  onClose: () => _closeDrawer(context),
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Column(
                      children: [
                        for (var index = 0; index < items.length; index++)
                          _MenuEntry(
                            destination: items[index],
                            showGroup:
                                sidebarGroupTitle(items[index]).isNotEmpty &&
                                sidebarGroupTitle(items[index]) !=
                                    (index > 0
                                        ? sidebarGroupTitle(items[index - 1])
                                        : null),
                            active: current == items[index],
                            onTap: () {
                              _closeDrawer(context);
                              onSelect(items[index]);
                            },
                          ),
                      ],
                    ),
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
    required this.onClose,
  });

  final String displayName;
  final String subtitle;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
                border: Border.all(color: KjaColors.sky.withValues(alpha: 0.2)),
              ),
              clipBehavior: Clip.antiAlias,
              child: const Padding(
                padding: EdgeInsets.all(5),
                child: SchoolMark(size: 34),
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
                  child: Icon(
                    Icons.close_rounded,
                    size: 22,
                    color: KjaColors.soft,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF1E4D7B), KjaColors.navy, Color(0xFF0F2740)],
            ),
            borderRadius: BorderRadius.circular(22),
            boxShadow: [
              BoxShadow(
                color: KjaColors.navy.withValues(alpha: 0.22),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
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
                      'Hi, ${firstNameOf(displayName)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Text(
                        subtitle,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MenuEntry extends StatelessWidget {
  const _MenuEntry({
    required this.destination,
    required this.showGroup,
    required this.active,
    required this.onTap,
  });

  final AppDestination destination;
  final bool showGroup;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showGroup) _SideGroupLabel(sidebarGroupTitle(destination)),
        _SideLink(destination: destination, active: active, onTap: onTap),
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
    required this.onTap,
  });

  final AppDestination destination;
  final bool active;
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
              color: active
                  ? Colors.white
                  : Colors.white.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: active
                    ? tone.ink.withValues(alpha: 0.35)
                    : tone.ink.withValues(alpha: 0.1),
                width: active ? 1.6 : 1,
              ),
            ),
            child: Row(
              children: [
                ToneIcon(
                  icon: destination.icon,
                  tone: tone,
                  size: 42,
                  iconSize: 22,
                  active: active,
                ),
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
                if (active)
                  Icon(
                    Icons.chevron_right_rounded,
                    color: tone.ink.withValues(alpha: 0.7),
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
                  child: Text(
                    'Sign out',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                      color: KjaColors.rose,
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
