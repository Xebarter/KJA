import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../pupil_photos.dart' show PhotoCache, pupilPhotoUrl;
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _statuses = ['present', 'late', 'absent', 'excused'];

class AttendancePage extends StatefulWidget {
  const AttendancePage({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<AttendancePage> {
  String? _classKey;
  final _status = <String, String>{};
  final _notes = <String, TextEditingController>{};
  var _busy = false;

  @override
  void dispose() {
    for (final controller in _notes.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _ensure(TeacherSnapshot portal, ClassPost post) {
    for (final pupil in portal.pupilsIn(post.classCode, post.stream)) {
      final mark = portal.markFor(pupil.id);
      _status.putIfAbsent(pupil.id, () => mark?.status ?? 'present');
      _notes.putIfAbsent(
        pupil.id,
        () => TextEditingController(text: mark?.note ?? ''),
      );
    }
  }

  Future<void> _save(ClassPost post) async {
    final portal = widget.controller.snapshot!;
    final rows = [
      for (final pupil in portal.pupilsIn(post.classCode, post.stream))
        {
          'student_id': pupil.id,
          'attended_on': portal.today,
          'term_id': portal.term?.id,
          'status': _status[pupil.id] ?? 'present',
          'note': (_notes[pupil.id]?.text.trim().isEmpty ?? true)
              ? null
              : _notes[pupil.id]!.text.trim(),
        },
    ];
    setState(() => _busy = true);
    final error = await widget.controller.saveRegister(
      classCode: post.classCode,
      stream: post.stream,
      rows: rows,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    _toast(error ?? 'Register saved.');
  }

  Future<void> _toggle(ClassPost post, bool closed) async {
    final error = await widget.controller.setRegisterClosed(
      classCode: post.classCode,
      stream: post.stream,
      closed: closed,
    );
    if (!mounted) return;
    _toast(error ?? (closed ? 'Register closed.' : 'Register reopened.'));
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final portal = widget.controller.snapshot!;
    if (!portal.classTeacher) {
      return const DeskScroll(
        children: [
          EmptyNote(
            icon: Icons.fact_check_rounded,
            title: 'Class teachers only',
            message: 'Attendance is for a class you lead.',
          ),
        ],
      );
    }
    final post = portal.classes.firstWhere(
      (row) => classKey(row.classCode, row.stream) == _classKey,
      orElse: () => portal.classes.first,
    );
    _classKey = classKey(post.classCode, post.stream);
    _ensure(portal, post);
    final pupils = portal.pupilsIn(post.classCode, post.stream);
    final closed = portal.registerClosed(post.classCode, post.stream);
    var done = 0;
    for (final pupil in pupils) {
      if (portal.markFor(pupil.id) != null) done++;
    }

    return DeskScroll(
      children: [
        if (portal.classes.length > 1)
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
        SoftCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      post.label,
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      closed
                          ? 'Closed for today · $done of ${pupils.length} on record'
                          : '$done of ${pupils.length} marked',
                      style: const TextStyle(color: KjaColors.soft, fontSize: 13),
                    ),
                  ],
                ),
              ),
              StatusChip(
                label: closed ? 'Closed' : 'Open',
                tone: closed ? Tone.mint : Tone.rose,
              ),
            ],
          ),
        ),
        if (pupils.isEmpty)
          const EmptyNote(
            icon: Icons.groups_rounded,
            title: 'No pupils',
            message: 'This class has nobody on the roll yet.',
          )
        else ...[
          for (final pupil in pupils)
            SoftCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DeskRow(
                    leading: PupilFace(
                      name: pupil.fullName,
                      photoUrl: pupil.photoUrl ?? pupilPhotoUrl(pupil),
                      photoBytes: PhotoCache.instance[pupil.id],
                      radius: 22,
                    ),
                    title: pupil.fullName,
                    subtitle: statusLabel(_status[pupil.id] ?? 'present'),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final status in _statuses)
                        ChoiceChip(
                          label: Text(statusLabel(status)),
                          selected: (_status[pupil.id] ?? 'present') == status,
                          onSelected: closed
                              ? null
                              : (_) => setState(() => _status[pupil.id] = status),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _notes[pupil.id],
                    enabled: !closed,
                    decoration: const InputDecoration(
                      labelText: 'Note (optional)',
                      hintText: 'Late reason, message home…',
                    ),
                  ),
                ],
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _busy || closed ? null : () => _save(post),
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.save_rounded, size: 18),
              label: Text(_busy ? 'Saving…' : 'Save register'),
            ),
          ),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _toggle(post, !closed),
              icon: Icon(closed ? Icons.lock_open_rounded : Icons.lock_rounded, size: 18),
              label: Text(closed ? 'Reopen register' : 'Close register'),
            ),
          ),
        ],
      ],
    );
  }
}
