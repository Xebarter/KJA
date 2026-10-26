import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../format.dart';
import '../models.dart';
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _fileMimes = {
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'txt': 'text/plain',
  'zip': 'application/zip',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'gif': 'image/gif',
};

class ResourcesPage extends StatefulWidget {
  const ResourcesPage({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<ResourcesPage> createState() => _ResourcesPageState();
}

class _ResourcesPageState extends State<ResourcesPage> {
  var _tab = 'Homework';

  TeacherSnapshot get portal => widget.controller.snapshot!;

  Future<void> _publishHomework(HomeworkItem item) async {
    final error = await widget.controller.publishHomework(item);
    if (!mounted) return;
    _toast(error ?? 'Homework published. Parents are notified.');
  }

  Future<void> _publishResource(ResourceItem item) async {
    final error = await widget.controller.publishResource(item);
    if (!mounted) return;
    _toast(error ?? 'Resource published. Parents are notified.');
  }

  Future<void> _openResource(ResourceItem item) async {
    final target = item.linkUrl ?? await widget.controller.openResource(item);
    if (!mounted) return;
    if (target == null || target.isEmpty) {
      _toast('This file could not be opened.');
      return;
    }
    final uri = Uri.tryParse(target);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final homework = portal.homework;
    final resources = portal.resources;
    return DeskScroll(
      children: [
        ChoiceChips(
          labels: const ['Homework', 'Resources'],
          selected: _tab,
          onSelect: (value) => setState(() => _tab = value),
        ),
        SoftCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _tab == 'Homework' ? 'Set class work' : 'Share a resource',
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15.5),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _tab == 'Homework'
                          ? 'Parents are notified when you publish.'
                          : 'Notes, files, pictures or links for your class.',
                      style: const TextStyle(color: KjaColors.soft, fontSize: 13, height: 1.35),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              FilledButton.icon(
                onPressed: portal.subjects.isEmpty
                    ? null
                    : () => _tab == 'Homework' ? _addHomework() : _addResource(),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: Text(_tab == 'Homework' ? 'Set' : 'Post'),
              ),
            ],
          ),
        ),
        if (portal.subjects.isEmpty)
          const EmptyNote(
            icon: Icons.menu_book_rounded,
            title: 'No subject assigned',
            message: 'Homework is posted for a subject you teach.',
          )
        else if (_tab == 'Homework' && homework.isEmpty)
          const EmptyNote(
            icon: Icons.menu_book_rounded,
            title: 'No homework yet',
            message: 'Set homework for one of your classes.',
          )
        else if (_tab == 'Resources' && resources.isEmpty)
          const EmptyNote(
            icon: Icons.folder_rounded,
            title: 'No resources yet',
            message: 'Post a note, link, picture or file.',
          )
        else if (_tab == 'Homework')
          for (final item in homework)
            _HomeworkCard(
              item: item,
              onPublish: item.published ? null : () => _publishHomework(item),
            )
        else
          for (final item in resources)
            _ResourceCard(
              item: item,
              onOpen: item.kind == 'note' ? null : () => _openResource(item),
              onPublish: item.published ? null : () => _publishResource(item),
            ),
      ],
    );
  }

  Future<void> _addHomework() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) =>
          _HomeworkSheet(portal: portal, controller: widget.controller),
    );
    if (saved == true && mounted) _toast('Homework saved.');
  }

  Future<void> _addResource() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) =>
          _ResourceSheet(portal: portal, controller: widget.controller),
    );
    if (saved == true && mounted) _toast('Resource saved.');
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard({required this.item, required this.onPublish});
  final HomeworkItem item;
  final VoidCallback? onPublish;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DeskRow(
            leading: ToneIcon(
              icon: Icons.menu_book_rounded,
              tone: item.published ? Tone.mint : Tone.sun,
              size: 42,
              iconSize: 20,
            ),
            title: item.title,
            subtitle: '${item.subjectName} · ${item.classLabel}',
            trailing: StatusChip(
              label: item.published ? 'Published' : 'Draft',
              tone: item.published ? Tone.mint : Tone.sun,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Due ${shortDate(item.dueOn, withYear: true)}${item.doneCount > 0 ? ' · ${item.doneCount} done' : ''}',
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: KjaColors.ink,
            ),
          ),
          if ((item.instructions ?? '').isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              item.instructions!,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: KjaColors.soft, height: 1.4),
            ),
          ],
          if (onPublish != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonal(
                onPressed: onPublish,
                child: const Text('Publish for class'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ResourceCard extends StatelessWidget {
  const _ResourceCard({
    required this.item,
    required this.onOpen,
    required this.onPublish,
  });
  final ResourceItem item;
  final VoidCallback? onOpen;
  final VoidCallback? onPublish;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      onTap: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DeskRow(
            leading: ToneIcon(
              icon: Icons.folder_rounded,
              tone: item.published ? Tone.mint : Tone.coral,
              size: 42,
              iconSize: 20,
            ),
            title: item.title,
            subtitle: '${kindLabel(item.kind)} · ${item.subjectName} · ${item.classLabel}',
            trailing: StatusChip(
              label: item.published ? 'Published' : 'Draft',
              tone: item.published ? Tone.mint : Tone.coral,
            ),
          ),
          if ((item.body ?? '').isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              item.body!,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: KjaColors.soft, height: 1.4),
            ),
          ],
          if (onPublish != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonal(
                onPressed: onPublish,
                child: const Text('Publish for class'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HomeworkSheet extends StatefulWidget {
  const _HomeworkSheet({required this.portal, required this.controller});
  final TeacherSnapshot portal;
  final TeacherController controller;

  @override
  State<_HomeworkSheet> createState() => _HomeworkSheetState();
}

class _HomeworkSheetState extends State<_HomeworkSheet> {
  late SubjectPost _post = widget.portal.subjects.first;
  final _title = TextEditingController();
  final _instructions = TextEditingController();
  late var _due = addDaysIso(widget.portal.today, 1);
  var _publish = true;
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _instructions.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.controller.saveHomework(
      classCode: _post.classCode,
      stream: _post.stream,
      subjectId: _post.subjectId,
      title: _title.text,
      instructions: _instructions.text,
      dueOn: _due,
      publish: _publish,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Set homework',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<SubjectPost>(
              initialValue: _post,
              decoration: const InputDecoration(labelText: 'Class and subject'),
              items: [
                for (final post in widget.portal.subjects)
                  DropdownMenuItem(value: post, child: Text(post.label)),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _post = value);
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: 'Title'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _instructions,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(labelText: 'Instructions'),
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Due date'),
              subtitle: Text(shortDate(_due, withYear: true)),
              trailing: const Icon(Icons.calendar_month_rounded),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2100),
                  initialDate: parseDate(_due) ?? DateTime.now(),
                );
                if (picked != null) setState(() => _due = ymd(picked));
              },
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Publish now'),
              value: _publish,
              onChanged: (value) => setState(() => _publish = value),
            ),
            if (_error != null)
              Text(
                _error!,
                style: const TextStyle(
                  color: KjaColors.rose,
                  fontWeight: FontWeight.w700,
                ),
              ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Save homework'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResourceSheet extends StatefulWidget {
  const _ResourceSheet({required this.portal, required this.controller});
  final TeacherSnapshot portal;
  final TeacherController controller;

  @override
  State<_ResourceSheet> createState() => _ResourceSheetState();
}

class _ResourceSheetState extends State<_ResourceSheet> {
  late SubjectPost _post = widget.portal.subjects.first;
  var _kind = 'note';
  final _title = TextEditingController();
  final _body = TextEditingController();
  final _link = TextEditingController();
  List<int>? _bytes;
  String? _fileName;
  String? _mime;
  var _publish = true;
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    _link.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final result = await FilePicker.platform.pickFiles(withData: true);
    final file = result?.files.single;
    if (file == null || file.bytes == null) return;
    final name = file.name;
    final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    setState(() {
      _bytes = file.bytes;
      _fileName = name;
      _mime = _fileMimes[ext] ?? 'application/octet-stream';
      if (_kind == 'image' && !(_mime ?? '').startsWith('image/')) {
        _kind = 'file';
      }
    });
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.controller.saveResource(
      classCode: _post.classCode,
      stream: _post.stream,
      subjectId: _post.subjectId,
      kind: _kind,
      title: _title.text,
      publish: _publish,
      body: _body.text,
      linkUrl: _link.text,
      fileBytes: _bytes,
      fileName: _fileName,
      fileMime: _mime,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Post a resource',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<SubjectPost>(
              initialValue: _post,
              decoration: const InputDecoration(labelText: 'Class and subject'),
              items: [
                for (final post in widget.portal.subjects)
                  DropdownMenuItem(value: post, child: Text(post.label)),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _post = value);
              },
            ),
            const SizedBox(height: 12),
            ChoiceChips(
              labels: const ['Note', 'Link', 'Picture', 'File'],
              selected: _kindLabel,
              onSelect: (label) => setState(() => _kind = _kindFrom(label)),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: 'Title'),
            ),
            if (_kind == 'note' || _kind == 'image' || _kind == 'file') ...[
              const SizedBox(height: 12),
              TextField(
                controller: _body,
                minLines: 2,
                maxLines: 5,
                decoration: InputDecoration(
                  labelText: _kind == 'note' ? 'Note' : 'Caption',
                ),
              ),
            ],
            if (_kind == 'link') ...[
              const SizedBox(height: 12),
              TextField(
                controller: _link,
                decoration: const InputDecoration(labelText: 'Link'),
              ),
            ],
            if (_kind == 'file' || _kind == 'image') ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _pick,
                icon: const Icon(Icons.attach_file_rounded),
                label: Text(_fileName ?? 'Choose a file'),
              ),
            ],
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Publish now'),
              value: _publish,
              onChanged: (value) => setState(() => _publish = value),
            ),
            if (_error != null)
              Text(
                _error!,
                style: const TextStyle(
                  color: KjaColors.rose,
                  fontWeight: FontWeight.w700,
                ),
              ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Save resource'),
            ),
          ],
        ),
      ),
    );
  }

  String get _kindLabel => kindLabel(_kind);
  String _kindFrom(String label) {
    switch (label) {
      case 'Link':
        return 'link';
      case 'Picture':
        return 'image';
      case 'File':
        return 'file';
      default:
        return 'note';
    }
  }
}
