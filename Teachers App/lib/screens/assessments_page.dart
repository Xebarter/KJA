import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class AssessmentsPage extends StatefulWidget {
  const AssessmentsPage({
    super.key,
    required this.portal,
    required this.openPaper,
  });

  final TeacherSnapshot portal;
  final ValueChanged<Paper> openPaper;

  @override
  State<AssessmentsPage> createState() => _AssessmentsPageState();
}

class _AssessmentsPageState extends State<AssessmentsPage> {
  var _filter = 'All';

  Tone _statusTone(String status) {
    if (status == 'approved') return Tone.mint;
    if (status == 'submitted') return Tone.sun;
    return Tone.lilac;
  }

  @override
  Widget build(BuildContext context) {
    final papers = widget.portal.papers.where((paper) {
      if (_filter == 'Open') return paper.open;
      if (_filter == 'Submitted') return paper.status == 'submitted';
      if (_filter == 'Locked') return paper.status == 'approved';
      return true;
    }).toList();
    return DeskScroll(
      children: [
        ChoiceChips(
          labels: const ['All', 'Open', 'Submitted', 'Locked'],
          selected: _filter,
          onSelect: (value) => setState(() => _filter = value),
        ),
        if (papers.isEmpty)
          const EmptyNote(
            icon: Icons.edit_note_rounded,
            title: 'No markbooks',
            message:
                'The academics office creates papers. Yours will appear here.',
          )
        else
          for (final paper in papers)
            SoftCard(
              onTap: () => widget.openPaper(paper),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DeskRow(
                    leading: ToneIcon(
                      icon: Icons.edit_note_rounded,
                      tone: _statusTone(paper.status),
                      size: 42,
                      iconSize: 20,
                    ),
                    title: paper.name,
                    subtitle:
                        '${paper.subjectName} · ${paper.classLabel} · ${kindLabel(paper.kind)}',
                    trailing: StatusChip(
                      label: statusLabel(paper.status),
                      tone: _statusTone(paper.status),
                    ),
                  ),
                  const SizedBox(height: 12),
                  ProgressBar(
                    value: _ratio(paper),
                    color: _statusTone(paper.status).ink,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _progress(paper),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                      color: KjaColors.soft,
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }

  double _ratio(Paper paper) {
    final pupils = widget.portal.pupilsIn(paper.classCode, paper.stream);
    if (pupils.isEmpty) return 0;
    var scored = 0;
    for (final pupil in pupils) {
      final score = widget.portal.scoreFor(paper.id, pupil.id);
      if (score != null && (score.missed || score.score != null)) scored++;
    }
    return scored / pupils.length;
  }

  String _progress(Paper paper) {
    final pupils = widget.portal.pupilsIn(paper.classCode, paper.stream);
    if (pupils.isEmpty) {
      return paper.heldOn == null
          ? 'No pupils yet'
          : 'Held ${shortDate(paper.heldOn)}';
    }
    var scored = 0;
    for (final pupil in pupils) {
      final score = widget.portal.scoreFor(paper.id, pupil.id);
      if (score != null && (score.missed || score.score != null)) scored++;
    }
    final when = paper.heldOn == null ? '' : ' · ${shortDate(paper.heldOn)}';
    return '$scored of ${pupils.length} marked$when';
  }
}
