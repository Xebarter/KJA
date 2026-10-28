import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../format.dart';
import '../models.dart';
import '../pupil_photos.dart';
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _washes = <({Color wash, Color ink})>[
  (wash: KjaColors.skyWash, ink: KjaColors.skyDeep),
  (wash: KjaColors.mintWash, ink: KjaColors.mintDeep),
  (wash: KjaColors.sunWash, ink: KjaColors.sunDeep),
  (wash: KjaColors.coralWash, ink: KjaColors.coralDeep),
  (wash: KjaColors.lilacWash, ink: KjaColors.lilacDeep),
  (wash: KjaColors.roseWash, ink: KjaColors.rose),
];

class MarkbookPage extends StatefulWidget {
  const MarkbookPage({
    super.key,
    required this.controller,
    required this.paperId,
  });

  final TeacherController controller;
  final String paperId;

  @override
  State<MarkbookPage> createState() => _MarkbookPageState();
}

class _MarkbookPageState extends State<MarkbookPage> {
  final _scores = <String, TextEditingController>{};
  final _scoreFocus = <String, FocusNode>{};
  final _missed = <String, bool>{};
  final _bands = <String, String?>{};
  var _index = 0;
  var _review = false;
  var _forward = true;
  var _busy = false;
  var _ready = false;
  var _draftDirty = false;
  Timer? _draftTimer;
  String? _hint;

  Paper? get paper {
    final portal = widget.controller.snapshot;
    if (portal == null) return null;
    for (final row in portal.papers) {
      if (row.id == widget.paperId) return row;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChange);
    _seed();
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChange);
    _draftTimer?.cancel();
    if (_draftDirty) {
      unawaited(_persistDraft());
    }
    for (final controller in _scores.values) {
      controller.dispose();
    }
    for (final node in _scoreFocus.values) {
      node.dispose();
    }
    super.dispose();
  }

  void _onChange() {
    // Draft autosaves notify the desk, but this page keeps its own mark state.
    // Rebuilding here made the pupil photo flicker on every keystroke.
    final wasReady = _ready;
    _seed();
    if (!wasReady && _ready && mounted) setState(() {});
  }

  void _seed() {
    final current = paper;
    final portal = widget.controller.snapshot;
    if (current == null || portal == null || _ready) return;
    final nursery = classSectionOf(current.classCode) == 'nursery';
    final bands = _nurseryBands(portal);
    final pupils = portal.pupilsIn(current.classCode, current.stream);
    var firstBlank = 0;
    var seenBlank = false;
    for (var i = 0; i < pupils.length; i++) {
      final pupil = pupils[i];
      final existing = portal.scoreFor(current.id, pupil.id);
      final missed = existing?.missed ?? false;
      _missed[pupil.id] = missed;
      if (nursery) {
        _bands[pupil.id] = _bandFor(existing?.score, bands);
      } else {
        final value = existing?.score;
        final controller = TextEditingController(text: value == null ? '' : _trim(value));
        controller.addListener(_scheduleDraft);
        _scores[pupil.id] = controller;
        _scoreFocus[pupil.id] = FocusNode(debugLabel: 'mark-${pupil.id}');
      }
      final blank = missed
          ? false
          : nursery
              ? _bands[pupil.id] == null
              : (_scores[pupil.id]?.text.trim().isEmpty ?? true);
      if (blank && !seenBlank) {
        firstBlank = i;
        seenBlank = true;
      }
    }
    _index = pupils.isEmpty ? 0 : firstBlank;
    _review = !current.open;
    _ready = true;
    if (!_review && !nursery) _keepScoreKeyboard();
  }

  List<GradeBand> _nurseryBands(TeacherSnapshot portal) {
    final live = portal.bands.where((band) => band.section == 'nursery').toList();
    if (live.isNotEmpty) return live;
    return const [
      GradeBand(id: 'exceeding', section: 'nursery', label: 'Exceeding', minScore: 75, maxScore: 100, sortOrder: 1),
      GradeBand(id: 'secure', section: 'nursery', label: 'Secure', minScore: 50, maxScore: 74, sortOrder: 2),
      GradeBand(id: 'developing', section: 'nursery', label: 'Developing', minScore: 25, maxScore: 49, sortOrder: 3),
      GradeBand(id: 'beginning', section: 'nursery', label: 'Beginning', minScore: 0, maxScore: 24, sortOrder: 4),
    ];
  }

  String? _bandFor(double? score, List<GradeBand> bands) {
    if (score == null) return null;
    GradeBand? best;
    var gap = double.infinity;
    for (final band in bands) {
      if (score >= band.minScore && score <= band.maxScore) return band.id;
      final next = (score - band.midpoint).abs();
      if (next < gap) {
        gap = next;
        best = band;
      }
    }
    return best?.id;
  }

  String _trim(double value) {
    if (value == value.roundToDouble()) return value.round().toString();
    return value.toString();
  }

  bool _pupilDone(Pupil pupil, bool nursery) {
    if (_missed[pupil.id] == true) return true;
    if (nursery) return _bands[pupil.id] != null;
    return (_scores[pupil.id]?.text.trim().isNotEmpty ?? false);
  }

  String _pupilLabel(Pupil pupil, bool nursery, Map<String, GradeBand> bands) {
    if (_missed[pupil.id] == true) return 'Missed';
    if (nursery) return bands[_bands[pupil.id]]?.label ?? '—';
    final text = _scores[pupil.id]?.text.trim() ?? '';
    return text.isEmpty ? '—' : text;
  }

  String? _validateCurrent(Paper current, bool nursery) {
    final portal = widget.controller.snapshot;
    if (portal == null) return 'Sign in again.';
    final pupils = portal.pupilsIn(current.classCode, current.stream);
    if (pupils.isEmpty || _index >= pupils.length) return null;
    final pupil = pupils[_index];
    if (_missed[pupil.id] == true) return null;
    if (nursery) {
      if (_bands[pupil.id] == null) return 'Choose a band, or mark missed.';
      return null;
    }
    final raw = _scores[pupil.id]?.text.trim() ?? '';
    if (raw.isEmpty) return 'Enter a mark, or mark missed.';
    final score = double.tryParse(raw);
    if (score == null || score < 0 || score > current.maxScore) {
      return 'Enter a mark from 0 to ${_trim(current.maxScore)}.';
    }
    return null;
  }

  void _scheduleDraft() {
    _draftDirty = true;
    _draftTimer?.cancel();
    _draftTimer = Timer(const Duration(milliseconds: 450), () {
      unawaited(_persistDraft());
    });
  }

  List<Map<String, dynamic>> _draftRows(Paper current, bool nursery) {
    final portal = widget.controller.snapshot;
    if (portal == null) return const [];
    final bands = {for (final band in _nurseryBands(portal)) band.id: band};
    final pupils = portal.pupilsIn(current.classCode, current.stream);
    final rows = <Map<String, dynamic>>[];
    for (final pupil in pupils) {
      final missed = _missed[pupil.id] == true;
      if (missed) {
        rows.add({
          'assessment_id': current.id,
          'student_id': pupil.id,
          'score': null,
          'missed': true,
        });
        continue;
      }
      if (nursery) {
        final bandId = _bands[pupil.id];
        if (bandId == null) continue;
        rows.add({
          'assessment_id': current.id,
          'student_id': pupil.id,
          'score': bands[bandId]?.midpoint,
          'missed': false,
        });
        continue;
      }
      final raw = _scores[pupil.id]?.text.trim() ?? '';
      if (raw.isEmpty) continue;
      final score = double.tryParse(raw);
      if (score == null || score < 0 || score > current.maxScore) continue;
      rows.add({
        'assessment_id': current.id,
        'student_id': pupil.id,
        'score': score,
        'missed': false,
      });
    }
    return rows;
  }

  Future<void> _persistDraft() async {
    final current = paper;
    final portal = widget.controller.snapshot;
    if (current == null || portal == null || !current.open) return;
    final nursery = classSectionOf(current.classCode) == 'nursery';
    final rows = _draftRows(current, nursery);
    _draftDirty = false;
    await widget.controller.saveMarkDraft(paper: current, rows: rows);
  }

  FocusNode? _focusForIndex(List<Pupil> pupils) {
    if (pupils.isEmpty) return null;
    final pupil = pupils[_index.clamp(0, pupils.length - 1)];
    if (_missed[pupil.id] == true) return null;
    return _scoreFocus[pupil.id];
  }

  /// After the pupil card swaps, put the caret back so typing needs no extra tap.
  void _keepScoreKeyboard() {
    void focusNow() {
      if (!mounted || _review) return;
      final current = paper;
      final portal = widget.controller.snapshot;
      if (current == null || portal == null) return;
      if (classSectionOf(current.classCode) == 'nursery') return;
      final pupils = portal.pupilsIn(current.classCode, current.stream);
      if (pupils.isEmpty) return;
      final pupil = pupils[_index.clamp(0, pupils.length - 1)];
      if (_missed[pupil.id] == true) return;
      final controller = _scores[pupil.id];
      final focus = _scoreFocus[pupil.id];
      if (controller == null || focus == null) return;
      focus.requestFocus();
      final text = controller.text;
      if (text.isNotEmpty) {
        controller.selection = TextSelection(baseOffset: 0, extentOffset: text.length);
      }
    }

    // Twice: once after setState, again after AnimatedSwitcher mounts the new field.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      focusNow();
      WidgetsBinding.instance.addPostFrameCallback((_) => focusNow());
    });
  }

  void _advance(Paper current, bool nursery, int count) {
    final error = _validateCurrent(current, nursery);
    if (error != null) {
      setState(() => _hint = error);
      _keepScoreKeyboard();
      return;
    }
    if (_index >= count - 1) {
      _focusForIndex(
        widget.controller.snapshot?.pupilsIn(current.classCode, current.stream) ?? const [],
      )?.unfocus();
      setState(() {
        _hint = null;
        _review = true;
      });
    } else {
      setState(() {
        _hint = null;
        _forward = true;
        _index += 1;
      });
      _keepScoreKeyboard();
    }
    unawaited(_persistDraft());
  }

  void _back() {
    if (_index == 0) return;
    setState(() {
      _hint = null;
      _forward = false;
      _index -= 1;
    });
    _keepScoreKeyboard();
    unawaited(_persistDraft());
  }

  Future<void> _submit() async {
    final current = paper;
    final portal = widget.controller.snapshot;
    if (current == null || portal == null) return;
    final nursery = classSectionOf(current.classCode) == 'nursery';
    final bands = {for (final band in _nurseryBands(portal)) band.id: band};
    final pupils = portal.pupilsIn(current.classCode, current.stream);
    if (pupils.any((pupil) => !_pupilDone(pupil, nursery))) {
      setState(() => _hint = 'Every pupil needs a mark, or missed, before you submit.');
      return;
    }
    final rows = <Map<String, dynamic>>[];
    for (final pupil in pupils) {
      final missed = _missed[pupil.id] == true;
      double? score;
      if (!missed && nursery) {
        score = bands[_bands[pupil.id]]?.midpoint;
      } else if (!missed) {
        score = double.tryParse(_scores[pupil.id]?.text.trim() ?? '');
      }
      rows.add({
        'assessment_id': current.id,
        'student_id': pupil.id,
        'score': missed ? null : score,
        'missed': missed,
      });
    }
    setState(() => _busy = true);
    final error = await widget.controller.saveMarks(paper: current, rows: rows, submit: true);
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? 'Submitted. The academics office will approve it for report cards.')),
    );
    if (error == null) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final current = paper;
    final portal = widget.controller.snapshot;
    if (current == null || portal == null) {
      return const Scaffold(body: Center(child: Text('This markbook is no longer available.')));
    }
    final nursery = classSectionOf(current.classCode) == 'nursery';
    final bands = _nurseryBands(portal);
    final bandById = {for (final band in bands) band.id: band};
    final pupils = portal.pupilsIn(current.classCode, current.stream);
    if (pupils.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(current.name)),
        body: const Center(child: EmptyNote(icon: Icons.groups_rounded, title: 'No pupils', message: 'There is nobody on this class roll yet.')),
      );
    }
    if (_review || !current.open) {
      return _sheet(current, pupils, nursery, bandById);
    }
    final index = _index.clamp(0, pupils.length - 1).toInt();
    final pupil = pupils[index];
    final tone = _washes[index % _washes.length];
    final done = pupils.where((row) => _pupilDone(row, nursery)).length;
    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: tone.wash,
      appBar: AppBar(
        backgroundColor: tone.wash,
        title: Text(current.name),
        actions: [
          TextButton(
            onPressed: () {
              _scoreFocus[pupil.id]?.unfocus();
              setState(() => _review = true);
            },
            child: const Text('Sheet'),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
              child: Column(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(
                      value: pupils.isEmpty ? 0 : done / pupils.length,
                      minHeight: 8,
                      backgroundColor: Colors.white,
                      color: tone.ink,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${index + 1} of ${pupils.length}',
                    style: TextStyle(color: tone.ink, fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                ],
              ),
            ),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 280),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                transitionBuilder: (child, animation) {
                  final begin = Offset(_forward ? 0.22 : -0.22, 0);
                  return SlideTransition(
                    position: Tween<Offset>(begin: begin, end: Offset.zero).animate(animation),
                    child: FadeTransition(opacity: animation, child: child),
                  );
                },
                child: _PupilCard(
                  key: ValueKey(pupil.id),
                  pupil: pupil,
                  tone: tone,
                  paper: current,
                  nursery: nursery,
                  bands: bands,
                  missed: _missed[pupil.id] == true,
                  bandId: _bands[pupil.id],
                  score: _scores[pupil.id],
                  scoreFocus: _scoreFocus[pupil.id],
                  hint: _hint,
                  onMissed: (value) {
                    setState(() {
                      _missed[pupil.id] = value;
                      _hint = null;
                      if (value) _scores[pupil.id]?.clear();
                      _scheduleDraft();
                    });
                    if (!value) _keepScoreKeyboard();
                  },
                  onBand: (id) => setState(() {
                    _bands[pupil.id] = id;
                    _missed[pupil.id] = false;
                    _hint = null;
                    _scheduleDraft();
                  }),
                  onAdvance: () => _advance(current, nursery, pupils.length),
                ),
              ),
            ),
            // Keep Next/Back from stealing focus (which would close the number keyboard).
            ExcludeFocus(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size.fromHeight(56),
                              backgroundColor: Colors.white,
                              foregroundColor: tone.ink,
                              disabledForegroundColor: tone.ink.withValues(alpha: 0.35),
                              side: BorderSide(color: tone.ink.withValues(alpha: index == 0 ? 0.16 : 0.35)),
                              textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                            ),
                            onPressed: index == 0 ? null : _back,
                            child: const Text('Back'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton(
                            style: FilledButton.styleFrom(
                              minimumSize: const Size.fromHeight(56),
                              backgroundColor: tone.ink,
                              textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                            ),
                            onPressed: () => _advance(current, nursery, pupils.length),
                            child: Text(index == pupils.length - 1 ? 'Finish' : 'Next'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sheet(Paper current, List<Pupil> pupils, bool nursery, Map<String, GradeBand> bands) {
    final ready = pupils.where((pupil) => _pupilDone(pupil, nursery)).length;
    final complete = ready == pupils.length;
    return Scaffold(
      appBar: AppBar(title: const Text('Marksheet')),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [KjaColors.pageTop, KjaColors.pageMid, KjaColors.pageBottom],
          ),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: PageIntro(
                eyebrow: current.classLabel,
                title: current.name,
                detail: current.open
                    ? '$ready of ${pupils.length} ready'
                    : 'Locked',
              ),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                itemCount: pupils.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final pupil = pupils[index];
                  final label = _pupilLabel(pupil, nursery, bands);
                  final blank = label == '—';
                  return SoftCard(
                    onTap: current.open
                        ? () => setState(() {
                            _index = index;
                            _review = false;
                            _forward = false;
                            _hint = null;
                          })
                        : null,
                    child: Row(
                      children: [
                        PupilFace(
                          name: pupil.fullName,
                          photoUrl: pupil.photoUrl ?? pupilPhotoUrl(pupil),
                          photoBytes: PhotoCache.instance[pupil.id],
                          radius: 22,
                          color: _washes[index % _washes.length].ink,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(pupil.fullName, style: const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                        Text(
                          label,
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 18,
                            color: blank ? KjaColors.rose : KjaColors.navy,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            if (current.open)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_hint != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(_hint!, textAlign: TextAlign.center, style: const TextStyle(color: KjaColors.rose, fontWeight: FontWeight.w800)),
                      ),
                    if (!complete)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          'Every pupil needs a mark or Missed.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: KjaColors.rose, fontWeight: FontWeight.w800),
                        ),
                      ),
                    FilledButton(
                      onPressed: _busy || !complete ? null : _submit,
                      child: Text(_busy ? 'Submitting…' : 'Submit marks'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _DecimalMarkFormatter extends TextInputFormatter {
  const _DecimalMarkFormatter();

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final text = newValue.text;
    if (text.isEmpty || RegExp(r'^\d*\.?\d*$').hasMatch(text)) return newValue;
    return oldValue;
  }
}

class _PupilCard extends StatelessWidget {
  const _PupilCard({
    super.key,
    required this.pupil,
    required this.tone,
    required this.paper,
    required this.nursery,
    required this.bands,
    required this.missed,
    required this.bandId,
    required this.score,
    required this.scoreFocus,
    required this.hint,
    required this.onMissed,
    required this.onBand,
    required this.onAdvance,
  });

  final Pupil pupil;
  final ({Color wash, Color ink}) tone;
  final Paper paper;
  final bool nursery;
  final List<GradeBand> bands;
  final bool missed;
  final String? bandId;
  final TextEditingController? score;
  final FocusNode? scoreFocus;
  final String? hint;
  final ValueChanged<bool> onMissed;
  final ValueChanged<String> onBand;
  final VoidCallback onAdvance;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
      children: [
        Center(
          child: PupilFace(
            name: pupil.fullName,
            photoUrl: pupil.photoUrl ?? pupilPhotoUrl(pupil),
            photoBytes: PhotoCache.instance[pupil.id],
            radius: 58,
            color: tone.ink,
          ),
        ),
        const SizedBox(height: 14),
        Text(
          pupil.fullName,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.4, height: 1.1),
        ),
        const SizedBox(height: 6),
        Text(
          '${paper.subjectName} · ${paper.name} · out of ${_trim(paper.maxScore)}',
          textAlign: TextAlign.center,
          style: TextStyle(color: tone.ink, fontWeight: FontWeight.w700, fontSize: 13),
        ),
        const SizedBox(height: 18),
        if (nursery)
          for (final band in bands) ...[
            SizedBox(
              width: double.infinity,
              child: (bandId == band.id && !missed)
                  ? FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: tone.ink,
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                      ),
                      onPressed: () => onBand(band.id),
                      child: Text(band.label),
                    )
                  : OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: tone.ink,
                        side: BorderSide(color: tone.ink.withValues(alpha: 0.35)),
                        backgroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                      ),
                      onPressed: () => onBand(band.id),
                      child: Text(band.label),
                    ),
            ),
            const SizedBox(height: 10),
          ]
        else if (!missed && score != null)
          TextField(
            key: ValueKey('score-${pupil.id}'),
            controller: score,
            focusNode: scoreFocus,
            autofocus: true,
            textAlign: TextAlign.center,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
            onSubmitted: (_) => onAdvance(),
            inputFormatters: const [_DecimalMarkFormatter()],
            style: TextStyle(fontSize: 56, fontWeight: FontWeight.w900, color: tone.ink, height: 1),
            decoration: InputDecoration(
              hintText: '0',
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide(color: tone.ink.withValues(alpha: 0.2))),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide(color: tone.ink.withValues(alpha: 0.25))),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide(color: tone.ink, width: 2)),
            ),
          ),
        const SizedBox(height: 12),
        Center(
          child: FilterChip(
            label: const Text('Missed'),
            selected: missed,
            onSelected: onMissed,
          ),
        ),
        if (hint != null) ...[
          const SizedBox(height: 10),
          Text(hint!, textAlign: TextAlign.center, style: const TextStyle(color: KjaColors.rose, fontWeight: FontWeight.w800)),
        ],
      ],
    );
  }

  String _trim(double value) {
    if (value == value.roundToDouble()) return value.round().toString();
    return value.toString();
  }
}
