import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../pupil_photos.dart' show PhotoCache, pupilPhotoUrl;
import '../theme.dart';
import '../widgets/ui.dart';

class PerformancePage extends StatefulWidget {
  const PerformancePage({super.key, required this.portal});

  final TeacherSnapshot portal;

  @override
  State<PerformancePage> createState() => _PerformancePageState();
}

class _PerformancePageState extends State<PerformancePage> {
  String? _postKey;
  var _kind = 'All';
  String? _pupilId;

  @override
  Widget build(BuildContext context) {
    final portal = widget.portal;
    if (portal.subjects.isEmpty) {
      return const DeskScroll(
        children: [
          EmptyNote(
            icon: Icons.bar_chart_rounded,
            title: 'No subject assigned',
            message: 'Performance follows the subjects you teach.',
          ),
        ],
      );
    }
    final post = portal.subjects.firstWhere(
      (row) => row.key == _postKey,
      orElse: () => portal.subjects.first,
    );
    _postKey = post.key;
    final papers = portal.papers.where((paper) {
      final same =
          paper.classCode == post.classCode &&
          paper.stream == post.stream &&
          paper.subjectId == post.subjectId;
      if (!same) return false;
      if (_kind == 'All') return true;
      return kindLabel(paper.kind) == _kind;
    }).toList();
    final kinds = <String>{
      'All',
      for (final paper in portal.papers.where(
        (paper) =>
            paper.subjectId == post.subjectId &&
            paper.classCode == post.classCode &&
            paper.stream == post.stream,
      ))
        kindLabel(paper.kind),
    };
    final pupils = portal.pupilsIn(post.classCode, post.stream);
    final rows = [
      for (final pupil in pupils) _PupilRow.build(pupil, papers, portal),
    ];
    final percents = [
      for (final row in rows)
        if (row.percent != null) row.percent!,
    ];
    final average = percents.isEmpty
        ? null
        : percents.reduce((a, b) => a + b) / percents.length;
    final watch = rows.where((row) => row.watch).length;
    PupilRowView? selected;
    for (final row in rows) {
      if (row.pupil.id == _pupilId) selected = row;
    }

    return DeskScroll(
      children: [
        DropdownButtonFormField<SubjectPost>(
          initialValue: post,
          decoration: const InputDecoration(labelText: 'Subject'),
          items: [
            for (final item in portal.subjects)
              DropdownMenuItem(value: item, child: Text(item.label)),
          ],
          onChanged: (value) {
            if (value == null) return;
            setState(() {
              _postKey = value.key;
              _pupilId = null;
              _kind = 'All';
            });
          },
        ),
        ChoiceChips(
          labels: kinds.toList(),
          selected: kinds.contains(_kind) ? _kind : 'All',
          onSelect: (value) => setState(() => _kind = value),
        ),
        Row(
          children: [
            Expanded(
              child: StatTile(
                label: 'Class average',
                value: average == null ? '—' : '${average.round()}%',
                icon: Icons.bar_chart_rounded,
                tone: Tone.sky,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatTile(
                label: 'On watch',
                value: '$watch',
                icon: Icons.visibility_rounded,
                tone: watch > 0 ? Tone.rose : Tone.mint,
              ),
            ),
          ],
        ),
        if (rows.isEmpty)
          const EmptyNote(
            icon: Icons.groups_rounded,
            title: 'No pupils',
            message: 'This class has nobody on the roll yet.',
          )
        else
          for (final row in rows)
            SoftCard(
              onTap: () => setState(
                () => _pupilId = row.pupil.id == _pupilId ? null : row.pupil.id,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DeskRow(
                    leading: PupilFace(
                      name: row.pupil.fullName,
                      photoUrl: row.pupil.photoUrl ?? pupilPhotoUrl(row.pupil),
                      photoBytes: PhotoCache.instance[row.pupil.id],
                      radius: 22,
                      color: row.watch ? KjaColors.rose : KjaColors.sky,
                    ),
                    title: row.pupil.fullName,
                    subtitle: row.watch ? 'Needs a closer look' : 'Tap for paper breakdown',
                    trailing: StatusChip(
                      label: row.percent == null ? '—' : '${row.percent!.round()}%',
                      tone: row.watch ? Tone.rose : Tone.sky,
                    ),
                  ),
                  if (selected?.pupil.id == row.pupil.id) ...[
                    const SizedBox(height: 12),
                    for (final mark in row.marks)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                mark.paper.name,
                                style: const TextStyle(
                                  color: KjaColors.soft,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Text(
                              mark.label,
                              style: const TextStyle(fontWeight: FontWeight.w800),
                            ),
                          ],
                        ),
                      ),
                  ],
                ],
              ),
            ),
      ],
    );
  }
}

class PupilRowView {
  const PupilRowView({
    required this.pupil,
    required this.percent,
    required this.watch,
    required this.marks,
  });
  final Pupil pupil;
  final double? percent;
  final bool watch;
  final List<({Paper paper, String label})> marks;
}

class _PupilRow {
  static PupilRowView build(
    Pupil pupil,
    List<Paper> papers,
    TeacherSnapshot portal,
  ) {
    final marks = <({Paper paper, String label})>[];
    final percents = <double>[];
    var missing = false;
    for (final paper in papers) {
      final score = portal.scoreFor(paper.id, pupil.id);
      if (score == null || (!score.missed && score.score == null)) {
        missing = true;
        marks.add((paper: paper, label: 'Missing'));
        continue;
      }
      if (score.missed) {
        marks.add((paper: paper, label: 'Missed'));
        continue;
      }
      final percent = paper.maxScore == 0
          ? 0.0
          : (score.score! / paper.maxScore) * 100;
      percents.add(percent);
      marks.add((paper: paper, label: '${percent.round()}%'));
    }
    final average = percents.isEmpty
        ? null
        : percents.reduce((a, b) => a + b) / percents.length;
    final watch = (average != null && average < 50) || missing;
    return PupilRowView(
      pupil: pupil,
      percent: average,
      watch: watch && papers.isNotEmpty,
      marks: marks,
    );
  }
}
