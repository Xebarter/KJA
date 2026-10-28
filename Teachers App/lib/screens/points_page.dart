import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models.dart';
import '../pupil_photos.dart' show PhotoCache, pupilPhotoUrl;
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _amounts = [1, 2, 3, 5, 10];

class PointsPage extends StatefulWidget {
  const PointsPage({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<PointsPage> createState() => _PointsPageState();
}

class _PointsPageState extends State<PointsPage> {
  String? _classKey;
  var _give = true;
  var _amount = 1;
  String? _reasonId;
  final _selected = <String>{};
  final _search = TextEditingController();
  var _query = '';
  var _busy = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  int get _points => _give ? _amount : -_amount;

  List<PointReason> _reasonsFor(List<PointReason> all) {
    final polarity = _give ? 'positive' : 'negative';
    return all.where((reason) => reason.polarity == polarity).toList();
  }

  String? _resolvedReason(List<PointReason> reasons) {
    if (reasons.any((reason) => reason.id == _reasonId)) return _reasonId;
    return reasons.isEmpty ? null : reasons.first.id;
  }

  List<Pupil> _filtered(List<Pupil> pupils) {
    final words = _query
        .trim()
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .toList();
    if (words.isEmpty) return pupils;
    return [
      for (final pupil in pupils)
        if (words.every((word) {
          final haystack =
              '${pupil.fullName} ${pupil.studentNumber ?? ''}'.toLowerCase();
          return haystack.contains(word);
        }))
          pupil,
    ];
  }

  void _setGive(bool give) {
    if (_give == give) return;
    HapticFeedback.selectionClick();
    setState(() {
      _give = give;
      _reasonId = null;
    });
  }

  void _setAmount(int amount) {
    if (_amount == amount) return;
    HapticFeedback.selectionClick();
    setState(() => _amount = amount);
  }

  void _togglePupil(String id) {
    HapticFeedback.selectionClick();
    setState(() {
      if (!_selected.add(id)) _selected.remove(id);
    });
  }

  void _selectAll(List<Pupil> pupils) {
    HapticFeedback.selectionClick();
    setState(() {
      final ids = pupils.map((pupil) => pupil.id).toSet();
      if (_selected.length == ids.length && ids.every(_selected.contains)) {
        _selected.clear();
      } else {
        _selected
          ..clear()
          ..addAll(ids);
      }
    });
  }

  Future<void> _award({
    required TeacherSnapshot portal,
    required String classCode,
    required String stream,
    required String classLabel,
    required bool wholeClass,
  }) async {
    final reasons = _reasonsFor(portal.pointReasons);
    final reasonId = _resolvedReason(reasons);
    if (reasonId == null) {
      _toast('Choose a reason.');
      return;
    }
    final pupils = portal.pupilsIn(classCode, stream);
    final targets = wholeClass
        ? pupils
        : [
            for (final pupil in pupils)
              if (_selected.contains(pupil.id)) pupil,
          ];
    if (targets.isEmpty) {
      _toast(wholeClass ? 'This class has no pupils.' : 'Tap pupils to select.');
      return;
    }

    if (wholeClass) {
      final signed = _give ? '+$_amount' : '-$_amount';
      final verb = _give ? 'Give' : 'Take';
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('$verb $signed to whole class?'),
          content: Text(
            '$verb $signed to all ${targets.length} pupils in $classLabel.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Award class'),
            ),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }

    final verb = _give ? 'Gave' : 'Took';
    final signed = _give ? '+$_amount' : '-$_amount';
    final count = targets.length;
    final summary =
        '$verb $signed · $count pupil${count == 1 ? '' : 's'}';

    setState(() => _busy = true);
    final error = await widget.controller.awardPoints([
      for (final pupil in targets)
        {
          'student_id': pupil.id,
          'points': _points,
          'reason_id': reasonId,
        },
    ]);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (error == null) {
        _selected.clear();
        _search.clear();
        _query = '';
      }
    });
    if (error != null) {
      _toast(error);
      return;
    }
    HapticFeedback.mediumImpact();
    await _showAwardSuccess(summary);
  }

  Future<void> _showAwardSuccess(String summary) async {
    if (!mounted) return;
    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Dismiss',
      barrierColor: Colors.black.withValues(alpha: 0.28),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (context, animation, secondaryAnimation) {
        return const SizedBox.shrink();
      },
      transitionBuilder: (context, animation, secondaryAnimation, child) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        return FadeTransition(
          opacity: curved,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.92, end: 1).animate(curved),
            child: Center(
              child: _AwardSuccessDialog(summary: summary),
            ),
          ),
        );
      },
    );
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  void _resetClass() {
    _selected.clear();
    _search.clear();
    _query = '';
  }

  @override
  Widget build(BuildContext context) {
    final portal =
        widget.controller.snapshot ??
        TeacherSnapshot.unavailable('Sign in again.');
    final classes = portal.awardClasses;
    if (classes.isEmpty || portal.term == null) {
      return const DeskScroll(
        children: [
          EmptyNote(
            icon: Icons.stars_rounded,
            title: 'No class',
            message: 'Points need a class you teach this term.',
          ),
        ],
      );
    }

    final classKey =
        _classKey ?? '${classes.first.classCode}|${classes.first.stream}';
    final post =
        classes
            .where((row) => '${row.classCode}|${row.stream}' == classKey)
            .firstOrNull ??
        classes.first;
    final pupils = portal.pupilsIn(post.classCode, post.stream);
    final shown = _filtered(pupils);
    final reasons = _reasonsFor(portal.pointReasons);
    final reasonId = _resolvedReason(reasons);
    final selectedCount =
        pupils.where((pupil) => _selected.contains(pupil.id)).length;
    final allSelected =
        pupils.isNotEmpty && selectedCount == pupils.length;
    final ink = _give ? KjaColors.mintDeep : KjaColors.rose;
    final wash = _give ? KjaColors.mintWash : KjaColors.roseWash;
    final signed = _give ? '+$_amount' : '-$_amount';
    final reasonLabel = reasons
        .where((reason) => reason.id == reasonId)
        .map((reason) => reason.label)
        .firstOrNull;

    return Column(
      children: [
        Expanded(
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            children: [
              if (classes.length > 1) ...[
                ChoiceChips(
                  labels: [for (final row in classes) row.label],
                  selected: post.label,
                  onSelect: (label) {
                    final next = classes.firstWhere((row) => row.label == label);
                    setState(() {
                      _classKey = '${next.classCode}|${next.stream}';
                      _resetClass();
                    });
                  },
                ),
              ],
              const SizedBox(height: 12),
              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: _ModeChip(
                            label: 'Give',
                            icon: Icons.add_rounded,
                            selected: _give,
                            color: KjaColors.mintDeep,
                            wash: KjaColors.mintWash,
                            onTap: () => _setGive(true),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _ModeChip(
                            label: 'Take',
                            icon: Icons.remove_rounded,
                            selected: !_give,
                            color: KjaColors.rose,
                            wash: KjaColors.roseWash,
                            onTap: () => _setGive(false),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'How many?',
                      style: TextStyle(
                        color: KjaColors.mute,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final amount in _amounts)
                          _AmountChip(
                            label: _give ? '+$amount' : '−$amount',
                            selected: _amount == amount,
                            color: ink,
                            wash: wash,
                            onTap: () => _setAmount(amount),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Why?',
                      style: TextStyle(
                        color: KjaColors.mute,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (reasons.isEmpty)
                      const Text(
                        'No reasons are set up yet.',
                        style: TextStyle(color: KjaColors.soft, fontSize: 13),
                      )
                    else
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final reason in reasons)
                            _ReasonChip(
                              label: reason.label,
                              selected: reason.id == reasonId,
                              color: ink,
                              wash: wash,
                              onTap: () {
                                HapticFeedback.selectionClick();
                                setState(() => _reasonId = reason.id);
                              },
                            ),
                        ],
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              SoftCard(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: TextField(
                  controller: _search,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Find a pupil',
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear',
                            onPressed: () => setState(() {
                              _search.clear();
                              _query = '';
                            }),
                            icon: const Icon(Icons.close_rounded),
                          ),
                    filled: true,
                    fillColor: KjaColors.paper,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                  ),
                  onChanged: (value) => setState(() => _query = value),
                ),
              ),
              const SizedBox(height: 12),
              SoftCard(
                padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        pupils.isEmpty
                            ? 'No pupils on the roll'
                            : selectedCount == 0
                                ? '${pupils.length} pupils · tap to select'
                                : '$selectedCount of ${pupils.length} selected',
                        style: const TextStyle(
                          color: KjaColors.soft,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          height: 1.2,
                        ),
                      ),
                    ),
                    if (pupils.isNotEmpty)
                      TextButton(
                        onPressed: () => _selectAll(pupils),
                        style: TextButton.styleFrom(
                          minimumSize: const Size(56, 36),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                        ),
                        child: Text(allSelected ? 'Clear' : 'All'),
                      ),
                  ],
                ),
              ),
              if (pupils.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: EmptyNote(
                    icon: Icons.groups_rounded,
                    title: 'No pupils',
                    message: 'This class has nobody on the roll yet.',
                  ),
                )
              else if (shown.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: EmptyNote(
                    icon: Icons.person_search_rounded,
                    title: 'No match',
                    message: 'Try another name or number.',
                  ),
                )
              else
                for (final pupil in shown) ...[
                  const SizedBox(height: 10),
                  _PupilTile(
                    pupil: pupil,
                    termPoints: portal.pointsFor(pupil.id),
                    selected: _selected.contains(pupil.id),
                    stamp: signed,
                    stampColor: ink,
                    stampWash: wash,
                    onTap: () => _togglePupil(pupil.id),
                  ),
                ],
            ],
          ),
        ),
        _AwardBar(
          busy: _busy,
          give: _give,
          signed: signed,
          reasonLabel: reasonLabel,
          selectedCount: selectedCount,
          classCount: pupils.length,
          onAwardSelected: selectedCount == 0 || reasonId == null || _busy
              ? null
              : () => _award(
                    portal: portal,
                    classCode: post.classCode,
                    stream: post.stream,
                    classLabel: post.label,
                    wholeClass: false,
                  ),
          onAwardClass: pupils.isEmpty || reasonId == null || _busy
              ? null
              : () => _award(
                    portal: portal,
                    classCode: post.classCode,
                    stream: post.stream,
                    classLabel: post.label,
                    wholeClass: true,
                  ),
        ),
      ],
    );
  }
}

class _AwardBar extends StatelessWidget {
  const _AwardBar({
    required this.busy,
    required this.give,
    required this.signed,
    required this.reasonLabel,
    required this.selectedCount,
    required this.classCount,
    required this.onAwardSelected,
    required this.onAwardClass,
  });

  final bool busy;
  final bool give;
  final String signed;
  final String? reasonLabel;
  final int selectedCount;
  final int classCount;
  final VoidCallback? onAwardSelected;
  final VoidCallback? onAwardClass;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    final color = give ? KjaColors.mintDeep : KjaColors.rose;
    final summary = [
      if (give) 'Give' else 'Take',
      signed,
      ?reasonLabel,
    ].join(' · ');
    const buttonHeight = 48.0;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
    );

    return Material(
      color: Colors.white,
      elevation: 8,
      shadowColor: KjaColors.ink.withValues(alpha: 0.12),
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, bottom > 0 ? bottom : 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              summary,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w800,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: buttonHeight,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onAwardClass,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: color,
                        disabledForegroundColor: color.withValues(alpha: 0.4),
                        side: BorderSide(
                          color: onAwardClass == null
                              ? color.withValues(alpha: 0.18)
                              : color.withValues(alpha: 0.4),
                        ),
                        minimumSize: const Size.fromHeight(buttonHeight),
                        maximumSize: const Size.fromHeight(buttonHeight),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        shape: shape,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                      ),
                      child: Text(
                        busy ? '…' : 'Class · $classCount',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          height: 1.1,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: onAwardSelected,
                      style: FilledButton.styleFrom(
                        backgroundColor: color,
                        disabledBackgroundColor: color.withValues(alpha: 0.35),
                        disabledForegroundColor: Colors.white.withValues(alpha: 0.85),
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(buttonHeight),
                        maximumSize: const Size.fromHeight(buttonHeight),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        shape: shape,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                        elevation: 0,
                      ),
                      child: Text(
                        busy
                            ? 'Awarding…'
                            : selectedCount == 0
                                ? 'Tap pupils'
                                : 'Award · $selectedCount',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          height: 1.1,
                        ),
                      ),
                    ),
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

class _PupilTile extends StatelessWidget {
  const _PupilTile({
    required this.pupil,
    required this.termPoints,
    required this.selected,
    required this.stamp,
    required this.stampColor,
    required this.stampWash,
    required this.onTap,
  });

  final Pupil pupil;
  final int termPoints;
  final bool selected;
  final String stamp;
  final Color stampColor;
  final Color stampWash;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? stampWash : Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected
                  ? stampColor.withValues(alpha: 0.35)
                  : KjaColors.line,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              PupilFace(
                name: pupil.fullName,
                photoUrl: pupil.photoUrl ?? pupilPhotoUrl(pupil),
                photoBytes: PhotoCache.instance[pupil.id],
                radius: 22,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      pupil.fullName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if ((pupil.studentNumber ?? '').isNotEmpty)
                          pupil.studentNumber!,
                        _signed(termPoints),
                      ].join(' · '),
                      style: const TextStyle(
                        color: KjaColors.mute,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                curve: Curves.easeOutCubic,
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected ? stampColor : KjaColors.paper,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: selected
                    ? Text(
                        stamp,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                          fontSize: 14,
                        ),
                      )
                    : Icon(
                        Icons.add_rounded,
                        color: KjaColors.mute,
                        size: 22,
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ModeChip extends StatelessWidget {
  const _ModeChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.color,
    required this.wash,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final Color color;
  final Color wash;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? color : wash,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          height: 44,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: selected ? Colors.white : color),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : color,
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AmountChip extends StatelessWidget {
  const _AmountChip({
    required this.label,
    required this.selected,
    required this.color,
    required this.wash,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Color color;
  final Color wash;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? color : wash,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 40, minWidth: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Center(
              child: Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : color,
                  fontWeight: FontWeight.w900,
                  fontSize: 14,
                  height: 1.1,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ReasonChip extends StatelessWidget {
  const _ReasonChip({
    required this.label,
    required this.selected,
    required this.color,
    required this.wash,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Color color;
  final Color wash;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          curve: Curves.easeOutCubic,
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? color : KjaColors.line,
              width: selected ? 1.5 : 1,
            ),
            color: selected ? color : wash.withValues(alpha: 0.45),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : KjaColors.ink,
              fontWeight: FontWeight.w800,
              fontSize: 13,
              height: 1.15,
            ),
          ),
        ),
      ),
    );
  }
}

class _AwardSuccessDialog extends StatefulWidget {
  const _AwardSuccessDialog({required this.summary});

  final String summary;

  @override
  State<_AwardSuccessDialog> createState() => _AwardSuccessDialogState();
}

class _AwardSuccessDialogState extends State<_AwardSuccessDialog> {
  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 1600), () {
      if (!mounted) return;
      Navigator.of(context).maybePop();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        width: 280,
        margin: const EdgeInsets.symmetric(horizontal: 28),
        padding: const EdgeInsets.fromLTRB(22, 26, 22, 22),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: KjaColors.mint.withValues(alpha: 0.22)),
          boxShadow: [
            BoxShadow(
              color: KjaColors.mintDeep.withValues(alpha: 0.12),
              blurRadius: 28,
              offset: const Offset(0, 14),
            ),
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    KjaColors.mint.withValues(alpha: 0.18),
                    KjaColors.mintWash,
                  ],
                ),
                border: Border.all(
                  color: KjaColors.mint.withValues(alpha: 0.35),
                ),
              ),
              child: const Icon(
                Icons.check_rounded,
                color: KjaColors.mintDeep,
                size: 34,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Points awarded',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: KjaColors.mintDeep,
                fontWeight: FontWeight.w800,
                fontSize: 18,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              widget.summary,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: KjaColors.soft,
                fontWeight: FontWeight.w600,
                fontSize: 14,
                height: 1.35,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _signed(int points) => points > 0 ? '+$points' : '$points';
