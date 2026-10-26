import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _dateKinds = ['exam', 'deadline', 'meeting', 'reporting'];

class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  String? _classKey;

  @override
  Widget build(BuildContext context) {
    final portal = widget.controller.snapshot!;
    final school = portal.dates.where((row) => row.schoolWide).toList();
    ClassPost? post;
    if (portal.classTeacher) {
      post = portal.classes.firstWhere(
        (row) => classKey(row.classCode, row.stream) == _classKey,
        orElse: () => portal.classes.first,
      );
      _classKey = classKey(post.classCode, post.stream);
    }
    final mine = post == null
        ? const <SchoolDate>[]
        : portal.dates
              .where(
                (row) =>
                    row.classCode == post!.classCode &&
                    (row.stream ?? '') == post.stream,
              )
              .toList();

    return DeskScroll(
      children: [
        if (portal.classTeacher && portal.classes.length > 1 && post != null)
          ChoiceChips(
            labels: [for (final row in portal.classes) row.label],
            selected: post.label,
            onSelect: (label) {
              final next = portal.classes.firstWhere(
                (row) => row.label == label,
              );
              setState(() => _classKey = classKey(next.classCode, next.stream));
            },
          ),
        if (post != null)
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              onPressed: () => _edit(post!),
              icon: const Icon(Icons.add_rounded),
              label: Text('Add a ${post.label} date'),
            ),
          ),
        const SectionTitle(title: 'School dates'),
        if (school.isEmpty)
          const EmptyNote(
            icon: Icons.calendar_month_rounded,
            title: 'No school dates',
            message: 'The academics office has not added dates for this term.',
          )
        else
          for (final date in school) _DateCard(date: date),
        if (post != null) ...[
          SectionTitle(title: post.label),
          if (mine.isEmpty)
            const EmptyNote(
              icon: Icons.event_rounded,
              title: 'No class dates',
              message: 'Add an exam, deadline, meeting or reporting day.',
            )
          else
            for (final date in mine)
              _DateCard(
                date: date,
                onEdit: () => _edit(post!, existing: date),
                onDelete: () async {
                  final error = await widget.controller.deleteDate(date);
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(error ?? 'Date removed.')),
                  );
                },
              ),
        ],
      ],
    );
  }

  Future<void> _edit(ClassPost post, {SchoolDate? existing}) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _DateSheet(
        controller: widget.controller,
        post: post,
        existing: existing,
      ),
    );
    if (saved == true && mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Date saved.')));
    }
  }
}

class _DateCard extends StatelessWidget {
  const _DateCard({required this.date, this.onEdit, this.onDelete});
  final SchoolDate date;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  Tone get _tone {
    switch (date.kind) {
      case 'exam':
        return Tone.rose;
      case 'deadline':
        return Tone.sun;
      case 'meeting':
        return Tone.sky;
      case 'reporting':
        return Tone.mint;
      default:
        return Tone.sun;
    }
  }

  @override
  Widget build(BuildContext context) {
    final range = date.endsOn == null
        ? shortDate(date.startsOn, withYear: true)
        : '${shortDate(date.startsOn, withYear: true)} – ${shortDate(date.endsOn, withYear: true)}';
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DeskRow(
            leading: ToneIcon(
              icon: Icons.event_rounded,
              tone: _tone,
              size: 42,
              iconSize: 20,
            ),
            title: date.title,
            subtitle: range,
            trailing: StatusChip(label: kindLabel(date.kind), tone: _tone),
          ),
          if ((date.note ?? '').isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(date.note!, style: const TextStyle(color: KjaColors.soft, height: 1.4)),
          ],
          if (onEdit != null || onDelete != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                if (onEdit != null)
                  TextButton.icon(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_rounded, size: 16),
                    label: const Text('Edit'),
                  ),
                if (onDelete != null)
                  TextButton.icon(
                    onPressed: onDelete,
                    icon: const Icon(Icons.delete_outline_rounded, size: 16),
                    label: const Text('Delete'),
                    style: TextButton.styleFrom(foregroundColor: KjaColors.rose),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _DateSheet extends StatefulWidget {
  const _DateSheet({
    required this.controller,
    required this.post,
    this.existing,
  });
  final TeacherController controller;
  final ClassPost post;
  final SchoolDate? existing;

  @override
  State<_DateSheet> createState() => _DateSheetState();
}

class _DateSheetState extends State<_DateSheet> {
  late final _title = TextEditingController(text: widget.existing?.title ?? '');
  late final _note = TextEditingController(text: widget.existing?.note ?? '');
  late var _kind = widget.existing?.kind ?? 'deadline';
  late var _starts =
      widget.existing?.startsOn ?? widget.controller.snapshot!.today;
  late var _ends = widget.existing?.endsOn ?? '';
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _pick(bool start) async {
    final current = parseDate(start ? _starts : _ends) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      initialDate: current,
    );
    if (picked == null) return;
    setState(() {
      if (start) {
        _starts = ymd(picked);
      } else {
        _ends = ymd(picked);
      }
    });
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.controller.saveDate(
      id: widget.existing?.id,
      classCode: widget.post.classCode,
      stream: widget.post.stream,
      title: _title.text,
      kind: _kind,
      startsOn: _starts,
      endsOn: _ends,
      note: _note.text,
    );
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _busy = false;
        _error = error;
      });
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
            Text(
              widget.existing == null ? 'Add a class date' : 'Edit class date',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: 'Title'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _kind,
              decoration: const InputDecoration(labelText: 'Kind'),
              items: [
                for (final kind in _dateKinds)
                  DropdownMenuItem(value: kind, child: Text(kindLabel(kind))),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _kind = value);
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Starts'),
              subtitle: Text(shortDate(_starts, withYear: true)),
              onTap: () => _pick(true),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Ends'),
              subtitle: Text(
                _ends.isEmpty ? 'Same day' : shortDate(_ends, withYear: true),
              ),
              onTap: () => _pick(false),
            ),
            TextField(
              controller: _note,
              decoration: const InputDecoration(labelText: 'Note'),
            ),
            if (_error != null)
              Text(
                _error!,
                style: const TextStyle(
                  color: KjaColors.rose,
                  fontWeight: FontWeight.w700,
                ),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Save date'),
            ),
          ],
        ),
      ),
    );
  }
}
