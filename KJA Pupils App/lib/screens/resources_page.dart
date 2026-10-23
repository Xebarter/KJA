import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/portal_repository.dart';
import '../format.dart';
import '../models.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ResourcesPage extends StatefulWidget {
  const ResourcesPage({super.key, required this.portal, required this.controller});

  final PortalSnapshot portal;
  final PortalController controller;

  @override
  State<ResourcesPage> createState() => _ResourcesPageState();
}

class _ResourcesPageState extends State<ResourcesPage> {
  var _filter = 'all';
  String? _busyId;
  String? _error;

  List<ClassResource> get _items {
    final rows = widget.portal.resources;
    if (_filter == 'all') return rows;
    return rows.where((row) => row.kind == _filter).toList();
  }

  Future<void> _open(ClassResource item) async {
    setState(() {
      _busyId = item.id;
      _error = null;
    });
    try {
      if (item.isNote) {
        if (!mounted) return;
        await showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.white,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          ),
          builder: (context) => _NoteSheet(item: item),
        );
        return;
      }

      if (item.isImage) {
        final url = await _resolveUrl(item);
        if (!mounted) return;
        if (url == null || url.isEmpty) {
          setState(() => _error = 'Could not open that picture.');
          return;
        }
        await showDialog<void>(
          context: context,
          builder: (context) => _ImageViewer(title: item.title, url: url),
        );
        return;
      }

      final url = await _resolveUrl(item);
      if (!mounted) return;
      if (url == null || url.isEmpty) {
        setState(() => _error = item.isLink ? 'That link is missing.' : 'Could not open that file.');
        return;
      }
      final uri = Uri.tryParse(url);
      if (uri == null) {
        setState(() => _error = 'That link looks broken.');
        return;
      }
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) setState(() => _error = 'Could not open that on this device.');
    } on PortalException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Something went wrong. Try again.');
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<String?> _resolveUrl(ClassResource item) async {
    if (item.isLink) return item.linkUrl?.trim();
    final existing = item.fileUrl?.trim();
    if (existing != null && existing.isNotEmpty) return existing;
    if (widget.portal.preview) return null;
    return widget.controller.repository.resourceFileUrl(item.filePath);
  }

  @override
  Widget build(BuildContext context) {
    final all = widget.portal.resources;
    final notes = all.where((row) => row.isNote).length;
    final files = all.where((row) => row.isFile).length;
    final images = all.where((row) => row.isImage).length;
    final links = all.where((row) => row.isLink).length;
    final visible = _items;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        _Header(
          classLabel: widget.portal.classLabel,
          total: all.length,
          notes: notes,
          files: files,
          images: images,
        ),
        const SizedBox(height: 14),
        _FilterRow(
          filter: _filter,
          allCount: all.length,
          notes: notes,
          files: files,
          images: images,
          links: links,
          onChanged: (value) => setState(() => _filter = value),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!, style: const TextStyle(color: KjaColors.rose, fontWeight: FontWeight.w700)),
        ],
        const SizedBox(height: 14),
        if (visible.isEmpty)
          EmptyNote(
            icon: Icons.folder_open_rounded,
            message: all.isEmpty
                ? 'Your teachers have not shared anything yet. Notes, pictures and files will show up here.'
                : 'Nothing in this group right now.',
          )
        else
          for (final item in visible)
            _ResourceCard(
              item: item,
              busy: _busyId == item.id,
              onTap: () => _open(item),
            ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.classLabel,
    required this.total,
    required this.notes,
    required this.files,
    required this.images,
  });

  final String classLabel;
  final int total;
  final int notes;
  final int files;
  final int images;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFEA580C), Color(0xFFF59E0B), Color(0xFFFDA31B)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: KjaColors.coral.withValues(alpha: 0.28),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.folder_special_rounded, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text(
                classLabel.isEmpty ? 'From your teachers' : 'For $classLabel',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.92),
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Resources',
            style: TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.w900,
              height: 1.05,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Notes, pictures and downloads shared by your teachers.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.92),
              fontSize: 13.5,
              height: 1.35,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatChip(label: 'All', value: '$total'),
              _StatChip(label: 'Notes', value: '$notes'),
              _StatChip(label: 'Files', value: '$files'),
              _StatChip(label: 'Pics', value: '$images'),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.28)),
      ),
      child: Text(
        '$value $label',
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.filter,
    required this.allCount,
    required this.notes,
    required this.files,
    required this.images,
    required this.links,
    required this.onChanged,
  });

  final String filter;
  final int allCount;
  final int notes;
  final int files;
  final int images;
  final int links;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final chips = <(String, String, int)>[
      ('all', 'All', allCount),
      ('note', 'Notes', notes),
      ('file', 'Files', files),
      ('image', 'Pics', images),
      ('link', 'Links', links),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final chip in chips) ...[
            _FilterChip(
              label: chip.$2,
              count: chip.$3,
              active: filter == chip.$1,
              onTap: () => onChanged(chip.$1),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.active,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: active ? KjaColors.coral : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: active ? KjaColors.coral : KjaColors.line),
          ),
          child: Text(
            '$label · $count',
            style: TextStyle(
              color: active ? Colors.white : KjaColors.soft,
              fontWeight: FontWeight.w800,
              fontSize: 12.5,
            ),
          ),
        ),
      ),
    );
  }
}

class _ResourceCard extends StatelessWidget {
  const _ResourceCard({
    required this.item,
    required this.busy,
    required this.onTap,
  });

  final ClassResource item;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = _toneFor(item.kind);
    final meta = [
      if ((item.subjectName ?? '').isNotEmpty) item.subjectName!,
      if ((item.teacherName ?? '').isNotEmpty) item.teacherName!,
      timeAgo(item.publishedAt),
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: busy ? null : onTap,
          borderRadius: BorderRadius.circular(20),
          child: Ink(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: tone.wash),
              boxShadow: [
                BoxShadow(
                  color: tone.ink.withValues(alpha: 0.06),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ToneIcon(icon: _iconFor(item.kind), tone: tone, size: 44, iconSize: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5, height: 1.25),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 12.5),
                      ),
                      if (stripHtml(item.body).isNotEmpty && !item.isNote) ...[
                        const SizedBox(height: 6),
                        Text(
                          stripHtml(item.body),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: KjaColors.mute, fontSize: 13, height: 1.3),
                        ),
                      ],
                      if (item.isNote && stripHtml(item.body).isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          stripHtml(item.body),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: KjaColors.ink, fontSize: 13.5, height: 1.35),
                        ),
                      ],
                      if (item.isImage && (item.fileUrl ?? '').isNotEmpty) ...[
                        const SizedBox(height: 10),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: AspectRatio(
                            aspectRatio: 16 / 9,
                            child: Image.network(
                              item.fileUrl!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => ColoredBox(
                                color: tone.wash,
                                child: Icon(Icons.image_not_supported_rounded, color: tone.ink),
                              ),
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 8),
                      Text(
                        busy ? 'Opening…' : _actionFor(item),
                        style: TextStyle(
                          color: tone.ink,
                          fontWeight: FontWeight.w800,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Icon(Icons.chevron_right_rounded, color: KjaColors.mute.withValues(alpha: 0.8)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Tone _toneFor(String kind) {
  switch (kind) {
    case 'note':
      return Tone.sky;
    case 'image':
      return Tone.lilac;
    case 'link':
      return Tone.mint;
    case 'file':
    default:
      return Tone.coral;
  }
}

IconData _iconFor(String kind) {
  switch (kind) {
    case 'note':
      return Icons.sticky_note_2_rounded;
    case 'image':
      return Icons.photo_rounded;
    case 'link':
      return Icons.link_rounded;
    case 'file':
    default:
      return Icons.download_rounded;
  }
}

String _actionFor(ClassResource item) {
  switch (item.kind) {
    case 'note':
      return 'Read note';
    case 'image':
      return 'View picture';
    case 'link':
      return 'Open link';
    case 'file':
    default:
      final name = (item.fileName ?? '').trim();
      return name.isEmpty ? 'Download file' : 'Download · $name';
  }
}

class _NoteSheet extends StatelessWidget {
  const _NoteSheet({required this.item});

  final ClassResource item;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 14, 18, 18 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 42,
              height: 4,
              decoration: BoxDecoration(color: KjaColors.line, borderRadius: BorderRadius.circular(99)),
            ),
          ),
          const SizedBox(height: 14),
          Text(item.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(
            [
              if ((item.subjectName ?? '').isNotEmpty) item.subjectName!,
              if ((item.teacherName ?? '').isNotEmpty) item.teacherName!,
              timeAgo(item.publishedAt),
            ].join(' · '),
            style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 14),
          ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.55),
            child: SingleChildScrollView(
              child: Text(
                stripHtml(item.body).isEmpty ? 'No note text.' : stripHtml(item.body),
                style: const TextStyle(fontSize: 15.5, height: 1.45, fontWeight: FontWeight.w500),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ImageViewer extends StatelessWidget {
  const _ImageViewer({required this.title, required this.url});

  final String title;
  final String url;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.all(16),
      backgroundColor: Colors.black,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                ),
              ],
            ),
          ),
          Flexible(
            child: InteractiveViewer(
              child: Image.network(
                url,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Could not load picture.', style: TextStyle(color: Colors.white70)),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
