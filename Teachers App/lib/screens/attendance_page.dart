import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../format.dart';
import '../models.dart';
import '../pupil_photos.dart' show PhotoCache, pupilPhotoUrl;
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _statuses = ['present', 'late', 'absent', 'excused'];

Tone _toneFor(String status) {
  switch (status) {
    case 'present':
      return Tone.mint;
    case 'late':
      return Tone.sun;
    case 'absent':
      return Tone.rose;
    case 'excused':
      return Tone.lilac;
    default:
      return Tone.sky;
  }
}

IconData _iconFor(String status) {
  switch (status) {
    case 'present':
      return Icons.check_rounded;
    case 'late':
      return Icons.schedule_rounded;
    case 'absent':
      return Icons.close_rounded;
    case 'excused':
      return Icons.mail_outline_rounded;
    default:
      return Icons.circle_outlined;
  }
}

String _shortLabel(String status) {
  switch (status) {
    case 'present':
      return 'P';
    case 'late':
      return 'L';
    case 'absent':
      return 'A';
    case 'excused':
      return 'E';
    default:
      return '?';
  }
}

class AttendancePage extends StatefulWidget {
  const AttendancePage({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<AttendancePage> {
  String? _classKey;
  final _status = <String, String>{};
  final _notes = <String, String>{};
  final _savedStatus = <String, String>{};
  final _savedNotes = <String, String>{};
  var _busy = false;
  var _exceptionsOnly = false;
  final _search = TextEditingController();
  var _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _ensure(TeacherSnapshot portal, ClassPost post) {
    for (final pupil in portal.pupilsIn(post.classCode, post.stream)) {
      final mark = portal.markFor(pupil.id);
      final status = mark?.status ?? 'present';
      final note = mark?.note ?? '';
      if (!_status.containsKey(pupil.id)) {
        _status[pupil.id] = status;
        _notes[pupil.id] = note;
        _savedStatus[pupil.id] = status;
        _savedNotes[pupil.id] = note;
      } else if (!_isDirtyFor(pupil.id)) {
        // Keep in sync with a fresh pull when the teacher has not edited locally.
        _status[pupil.id] = status;
        _notes[pupil.id] = note;
        _savedStatus[pupil.id] = status;
        _savedNotes[pupil.id] = note;
      }
    }
  }

  bool _isDirtyFor(String id) {
    return (_status[id] ?? 'present') != (_savedStatus[id] ?? 'present') ||
        (_notes[id] ?? '') != (_savedNotes[id] ?? '');
  }

  bool _isDirty(List<Pupil> pupils) {
    for (final pupil in pupils) {
      if (_isDirtyFor(pupil.id)) return true;
    }
    return false;
  }

  Map<String, int> _counts(List<Pupil> pupils) {
    final counts = {for (final status in _statuses) status: 0};
    for (final pupil in pupils) {
      final status = _status[pupil.id] ?? 'present';
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }

  void _markAll(List<Pupil> pupils, String status) {
    if (pupils.isEmpty) return;
    HapticFeedback.mediumImpact();
    setState(() {
      for (final pupil in pupils) {
        _status[pupil.id] = status;
        if (status == 'present') _notes[pupil.id] = '';
      }
    });
  }

  void _setStatus(String pupilId, String status) {
    HapticFeedback.selectionClick();
    setState(() {
      _status[pupilId] = status;
      if (status == 'present') _notes[pupilId] = '';
    });
  }

  Future<void> _editNote(Pupil pupil, {required bool closed}) async {
    if (closed) return;
    final controller = TextEditingController(text: _notes[pupil.id] ?? '');
    final saved = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        final inset = MediaQuery.viewInsetsOf(context).bottom;
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + inset),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: KjaColors.line,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                pupil.fullName,
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 17,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Optional note for ${statusLabel(_status[pupil.id] ?? 'present').toLowerCase()}',
                style: const TextStyle(
                  color: KjaColors.soft,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: controller,
                autofocus: true,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Late reason, message home, clinic…',
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, ''),
                    child: const Text('Clear'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () =>
                        Navigator.pop(context, controller.text.trim()),
                    child: const Text('Save note'),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
    controller.dispose();
    if (!mounted || saved == null) return;
    setState(() => _notes[pupil.id] = saved);
  }

  Future<void> _save(ClassPost post) async {
    final portal = widget.controller.snapshot!;
    final pupils = portal.pupilsIn(post.classCode, post.stream);
    final rows = [
      for (final pupil in pupils)
        {
          'student_id': pupil.id,
          'attended_on': portal.today,
          'term_id': portal.term?.id,
          'status': _status[pupil.id] ?? 'present',
          'note': (_notes[pupil.id] ?? '').trim().isEmpty
              ? null
              : (_notes[pupil.id] ?? '').trim(),
        },
    ];
    setState(() => _busy = true);
    final error = await widget.controller.saveRegister(
      classCode: post.classCode,
      stream: post.stream,
      rows: rows,
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (error == null) {
        for (final pupil in pupils) {
          _savedStatus[pupil.id] = _status[pupil.id] ?? 'present';
          _savedNotes[pupil.id] = _notes[pupil.id] ?? '';
        }
      }
    });
    _toast(error ?? 'Register saved.');
  }

  Future<void> _toggle(ClassPost post, bool closed, List<Pupil> pupils) async {
    if (!closed && _isDirty(pupils)) {
      final go = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Save before closing?'),
          content: const Text(
            'You have unsaved marks. Save the register first, then close it for today.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep editing'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save & close'),
            ),
          ],
        ),
      );
      if (go != true || !mounted) return;
      await _save(post);
      if (!mounted || _isDirty(pupils)) return;
    }
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
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  String _dayLabel(String iso) {
    final date = parseDate(iso);
    if (date == null) return shortDate(iso, withYear: true);
    if (iso == kampalaToday()) return 'Today · ${shortDate(iso)}';
    return shortDate(iso, withYear: true);
  }

  List<Pupil> _filtered(List<Pupil> pupils) {
    var rows = pupils;
    if (_exceptionsOnly) {
      rows = [
        for (final pupil in rows)
          if ((_status[pupil.id] ?? 'present') != 'present') pupil,
      ];
    }
    final words = _query
        .trim()
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .toList();
    if (words.isEmpty) return rows;
    return [
      for (final pupil in rows)
        if (words.every((word) {
          final haystack =
              '${pupil.fullName} ${pupil.studentNumber ?? ''}'.toLowerCase();
          return haystack.contains(word);
        }))
          pupil,
    ];
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
    final visible = _filtered(pupils);
    final closed = portal.registerClosed(post.classCode, post.stream);
    final counts = _counts(pupils);
    final dirty = _isDirty(pupils);
    final savedCount = pupils
        .where((pupil) => portal.markFor(pupil.id) != null)
        .length;
    final present = counts['present'] ?? 0;
    final progress = pupils.isEmpty ? 0.0 : present / pupils.length;

    return Column(
      children: [
        Expanded(
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    if (portal.classes.length > 1) ...[
                      ChoiceChips(
                        labels: [for (final row in portal.classes) row.label],
                        selected: post.label,
                        onSelect: (label) {
                          final next = portal.classes.firstWhere(
                            (row) => row.label == label,
                          );
                          setState(
                            () => _classKey =
                                classKey(next.classCode, next.stream),
                          );
                        },
                      ),
                      const SizedBox(height: 12),
                    ],
                    _SummaryCard(
                      label: post.label,
                      today: _dayLabel(portal.today),
                      closed: closed,
                      pupilCount: pupils.length,
                      savedCount: savedCount,
                      counts: counts,
                      progress: progress,
                      dirty: dirty,
                    ),
                    const SizedBox(height: 12),
                    if (pupils.isNotEmpty) ...[
                      _MarkAllBar(
                        enabled: !closed,
                        counts: counts,
                        onMarkAll: (status) => _markAll(pupils, status),
                      ),
                      const SizedBox(height: 12),
                      _FilterBar(
                        controller: _search,
                        query: _query,
                        exceptionsOnly: _exceptionsOnly,
                        exceptionCount: pupils.length - present,
                        onQuery: (value) => setState(() => _query = value),
                        onToggleExceptions: () => setState(
                          () => _exceptionsOnly = !_exceptionsOnly,
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ]),
                ),
              ),
              if (pupils.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(16, 8, 16, 24),
                    child: EmptyNote(
                      icon: Icons.groups_rounded,
                      title: 'No pupils',
                      message: 'This class has nobody on the roll yet.',
                    ),
                  ),
                )
              else if (visible.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(16, 8, 16, 24),
                    child: EmptyNote(
                      icon: Icons.filter_alt_off_rounded,
                      title: 'No matches',
                      message:
                          'Clear the search or show the full roll to keep marking.',
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  sliver: SliverToBoxAdapter(
                    child: _RollCard(
                      pupils: visible,
                      allPupils: pupils,
                      statusOf: (id) => _status[id] ?? 'present',
                      noteOf: (id) => _notes[id] ?? '',
                      closed: closed,
                      onStatus: closed
                          ? null
                          : (id, status) => _setStatus(id, status),
                      onNote: (pupil) => _editNote(pupil, closed: closed),
                    ),
                  ),
                ),
              const SliverToBoxAdapter(child: SizedBox(height: 8)),
            ],
          ),
        ),
        if (pupils.isNotEmpty)
          _ActionBar(
            busy: _busy,
            closed: closed,
            dirty: dirty,
            onSave: closed || _busy ? null : () => _save(post),
            onToggle: () => _toggle(post, !closed, pupils),
          ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.label,
    required this.today,
    required this.closed,
    required this.pupilCount,
    required this.savedCount,
    required this.counts,
    required this.progress,
    required this.dirty,
  });

  final String label;
  final String today;
  final bool closed;
  final int pupilCount;
  final int savedCount;
  final Map<String, int> counts;
  final double progress;
  final bool dirty;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 17,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      closed
                          ? 'Closed · $today · $savedCount of $pupilCount on record'
                          : dirty
                              ? 'Unsaved changes · $today'
                              : '$today · $savedCount of $pupilCount saved',
                      style: const TextStyle(
                        color: KjaColors.soft,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              StatusChip(
                label: closed ? 'Closed' : (dirty ? 'Editing' : 'Open'),
                tone: closed
                    ? Tone.mint
                    : dirty
                        ? Tone.sun
                        : Tone.sky,
              ),
            ],
          ),
          const SizedBox(height: 12),
          ProgressBar(
            value: progress,
            color: closed ? KjaColors.mint : KjaColors.navy,
            height: 7,
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final status in _statuses)
                _CountPill(
                  status: status,
                  count: counts[status] ?? 0,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CountPill extends StatelessWidget {
  const _CountPill({required this.status, required this.count});

  final String status;
  final int count;

  @override
  Widget build(BuildContext context) {
    final tone = _toneFor(status);
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 6, 12, 6),
      decoration: BoxDecoration(
        color: tone.wash,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_iconFor(status), size: 14, color: tone.ink),
          const SizedBox(width: 6),
          Text(
            '$count ${statusLabel(status)}',
            style: TextStyle(
              color: tone.ink,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _MarkAllBar extends StatelessWidget {
  const _MarkAllBar({
    required this.enabled,
    required this.counts,
    required this.onMarkAll,
  });

  final bool enabled;
  final Map<String, int> counts;
  final ValueChanged<String> onMarkAll;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Mark everyone',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 13,
              color: KjaColors.soft,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Set the whole class, then change the few who differ.',
            style: TextStyle(
              color: KjaColors.mute,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 420;
              final buttons = [
                for (final status in _statuses)
                  _MarkAllButton(
                    status: status,
                    enabled: enabled,
                    majority: (counts[status] ?? 0) ==
                        counts.values.fold<int>(0, (a, b) => a > b ? a : b) &&
                        (counts[status] ?? 0) > 0,
                    onTap: () => onMarkAll(status),
                  ),
              ];
              if (wide) {
                return Row(
                  children: [
                    for (var i = 0; i < buttons.length; i++) ...[
                      if (i > 0) const SizedBox(width: 8),
                      Expanded(child: buttons[i]),
                    ],
                  ],
                );
              }
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final button in buttons)
                    SizedBox(
                      width: (constraints.maxWidth - 8) / 2,
                      child: button,
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MarkAllButton extends StatelessWidget {
  const _MarkAllButton({
    required this.status,
    required this.enabled,
    required this.majority,
    required this.onTap,
  });

  final String status;
  final bool enabled;
  final bool majority;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = _toneFor(status);
    return Material(
      color: majority ? tone.ink : tone.wash,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(14),
        child: Opacity(
          opacity: enabled ? 1 : 0.45,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  _iconFor(status),
                  size: 16,
                  color: majority ? Colors.white : tone.ink,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    'All ${statusLabel(status)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: majority ? Colors.white : tone.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5,
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

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.controller,
    required this.query,
    required this.exceptionsOnly,
    required this.exceptionCount,
    required this.onQuery,
    required this.onToggleExceptions,
  });

  final TextEditingController controller;
  final String query;
  final bool exceptionsOnly;
  final int exceptionCount;
  final ValueChanged<String> onQuery;
  final VoidCallback onToggleExceptions;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: controller,
            onChanged: onQuery,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Find a pupil',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              suffixIcon: query.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear',
                      onPressed: () {
                        controller.clear();
                        onQuery('');
                      },
                      icon: const Icon(Icons.close_rounded, size: 18),
                    ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Material(
          color: exceptionsOnly ? Tone.sun.wash : Colors.white,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            onTap: exceptionCount == 0 && !exceptionsOnly
                ? null
                : onToggleExceptions,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: exceptionsOnly
                      ? Tone.sun.ink.withValues(alpha: 0.28)
                      : KjaColors.line,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.filter_alt_rounded,
                    size: 16,
                    color: exceptionsOnly ? Tone.sun.ink : KjaColors.soft,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    exceptionCount == 0 ? 'Exceptions' : '$exceptionCount off',
                    style: TextStyle(
                      color: exceptionsOnly ? Tone.sun.ink : KjaColors.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5,
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

class _RollCard extends StatelessWidget {
  const _RollCard({
    required this.pupils,
    required this.allPupils,
    required this.statusOf,
    required this.noteOf,
    required this.closed,
    required this.onStatus,
    required this.onNote,
  });

  final List<Pupil> pupils;
  final List<Pupil> allPupils;
  final String Function(String id) statusOf;
  final String Function(String id) noteOf;
  final bool closed;
  final void Function(String id, String status)? onStatus;
  final ValueChanged<Pupil> onNote;

  @override
  Widget build(BuildContext context) {
    final indexOf = <String, int>{
      for (var i = 0; i < allPupils.length; i++) allPupils[i].id: i + 1,
    };
    return SoftCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Roll',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: KjaColors.soft,
                    ),
                  ),
                ),
                for (final status in _statuses)
                  SizedBox(
                    width: 36,
                    child: Text(
                      _shortLabel(status),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: _toneFor(status).ink,
                        fontWeight: FontWeight.w900,
                        fontSize: 11,
                      ),
                    ),
                  ),
                const SizedBox(width: 36),
              ],
            ),
          ),
          const Divider(height: 1, color: KjaColors.line),
          for (var i = 0; i < pupils.length; i++) ...[
            if (i > 0)
              const Divider(height: 1, indent: 62, color: KjaColors.line),
            _PupilRow(
              index: indexOf[pupils[i].id] ?? (i + 1),
              pupil: pupils[i],
              status: statusOf(pupils[i].id),
              note: noteOf(pupils[i].id),
              closed: closed,
              onStatus: onStatus == null
                  ? null
                  : (status) => onStatus!(pupils[i].id, status),
              onNote: () => onNote(pupils[i]),
            ),
          ],
        ],
      ),
    );
  }
}

class _PupilRow extends StatelessWidget {
  const _PupilRow({
    required this.index,
    required this.pupil,
    required this.status,
    required this.note,
    required this.closed,
    required this.onStatus,
    required this.onNote,
  });

  final int index;
  final Pupil pupil;
  final String status;
  final String note;
  final bool closed;
  final ValueChanged<String>? onStatus;
  final VoidCallback onNote;

  @override
  Widget build(BuildContext context) {
    final tone = _toneFor(status);
    final hasNote = note.trim().isNotEmpty;
    return Material(
      color: tone.wash.withValues(alpha: 0.35),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
        child: Row(
          children: [
            SizedBox(
              width: 22,
              child: Text(
                '$index'.padLeft(2, '0'),
                style: const TextStyle(
                  color: KjaColors.mute,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ),
            const SizedBox(width: 4),
            PupilFace(
              name: pupil.fullName,
              photoUrl: pupil.photoUrl ?? pupilPhotoUrl(pupil),
              photoBytes: PhotoCache.instance[pupil.id],
              radius: 16,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    pupil.fullName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13.5,
                      height: 1.15,
                    ),
                  ),
                  if ((pupil.studentNumber ?? '').isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      pupil.studentNumber!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: KjaColors.mute,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            for (final value in _statuses)
              _StatusDot(
                status: value,
                selected: status == value,
                enabled: onStatus != null,
                onTap: onStatus == null ? null : () => onStatus!(value),
              ),
            IconButton(
              tooltip: hasNote ? 'Edit note' : 'Add note',
              onPressed: closed && !hasNote ? null : onNote,
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
              icon: Icon(
                hasNote ? Icons.sticky_note_2_rounded : Icons.note_add_outlined,
                size: 18,
                color: hasNote ? tone.ink : KjaColors.mute,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({
    required this.status,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String status;
  final bool selected;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tone = _toneFor(status);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 1),
      child: Material(
        color: selected ? tone.ink : Colors.white,
        shape: CircleBorder(
          side: BorderSide(
            color: selected
                ? tone.ink
                : tone.ink.withValues(alpha: enabled ? 0.22 : 0.12),
          ),
        ),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: enabled ? onTap : null,
          child: SizedBox(
            width: 34,
            height: 34,
            child: Center(
              child: Text(
                _shortLabel(status),
                style: TextStyle(
                  color: selected ? Colors.white : tone.ink,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.busy,
    required this.closed,
    required this.dirty,
    required this.onSave,
    required this.onToggle,
  });

  final bool busy;
  final bool closed;
  final bool dirty;
  final VoidCallback? onSave;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Material(
      color: Colors.white,
      elevation: 12,
      shadowColor: KjaColors.ink.withValues(alpha: 0.12),
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + bottom),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : onToggle,
                icon: Icon(
                  closed ? Icons.lock_open_rounded : Icons.lock_rounded,
                  size: 18,
                ),
                label: Text(closed ? 'Reopen' : 'Close'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: FilledButton.icon(
                onPressed: onSave,
                icon: busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Icon(
                        dirty ? Icons.save_rounded : Icons.check_rounded,
                        size: 18,
                      ),
                label: Text(
                  busy
                      ? 'Saving…'
                      : closed
                          ? 'Closed'
                          : dirty
                              ? 'Save register'
                              : 'Saved',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
