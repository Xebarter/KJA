import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../format.dart';
import '../models.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _classOptions = [
  'Daycare',
  'Baby Class',
  'Middle Class',
  'Top Class',
  'Primary One',
  'Primary Two',
  'Primary Three',
  'Primary Four',
  'Primary Five',
  'Primary Six',
  'Primary Seven',
];

String? _networkOf(String phone) {
  var digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('256')) digits = digits.substring(3);
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!RegExp(r'^7\d{8}$').hasMatch(digits)) return null;
  final prefix = digits.substring(0, 2);
  if (const {'76', '77', '78', '79'}.contains(prefix)) return 'MTN Mobile Money';
  if (const {'70', '72', '73', '74', '75'}.contains(prefix)) return 'Airtel Money';
  return null;
}

Tone _statusTone(String status) {
  final key = status.toLowerCase();
  if (RegExp(r'accept|approv|enrol|admit|offer').hasMatch(key)) return Tone.mint;
  if (RegExp(r'reject|declin|withdraw|cancel').hasMatch(key)) return Tone.rose;
  if (RegExp(r'review|process|interview').hasMatch(key)) return Tone.sun;
  if (RegExp(r'paid|submit|new|pending|receiv').hasMatch(key)) return Tone.sky;
  return Tone.lilac;
}

String _statusLabel(String status) {
  final clean = status.trim().replaceAll('_', ' ');
  if (clean.isEmpty) return 'Received';
  return clean[0].toUpperCase() + clean.substring(1);
}

class ApplicationsPage extends StatefulWidget {
  const ApplicationsPage({
    super.key,
    required this.portal,
    required this.controller,
  });

  final PortalSnapshot portal;
  final PortalController controller;

  @override
  State<ApplicationsPage> createState() => _ApplicationsPageState();
}

class _ApplicationsPageState extends State<ApplicationsPage> {
  final _childName = TextEditingController();
  final _message = TextEditingController();
  final _phone = TextEditingController();
  final _payPhone = TextEditingController();
  DateTime? _dob;
  String? _grade;
  String? _campus;
  var _fees = <({String campus, int fee})>[];
  var _loadingFees = true;
  var _paying = false;
  var _showNote = false;
  String? _waitingId;
  String? _statusNote;
  String? _error;
  Timer? _poll;

  PortalSnapshot get portal => widget.controller.snapshot ?? widget.portal;

  int? get _feeForCampus {
    final campus = _campus;
    if (campus == null) return null;
    for (final row in _fees) {
      if (row.campus == campus) return row.fee;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    final phone = portal.profile.phone?.trim() ?? '';
    if (phone.isNotEmpty) {
      _phone.text = phone;
      _payPhone.text = phone;
    }
    unawaited(_loadFees());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _childName.dispose();
    _message.dispose();
    _phone.dispose();
    _payPhone.dispose();
    super.dispose();
  }

  Future<void> _loadFees() async {
    final fees = await widget.controller.loadAdmissionFees();
    if (!mounted) return;
    setState(() {
      _fees = fees;
      _loadingFees = false;
      if (_campus == null && fees.isNotEmpty) _campus = fees.first.campus;
    });
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(now.year - 5, now.month, now.day),
      firstDate: DateTime(now.year - 18),
      lastDate: now,
      helpText: 'Date of birth',
    );
    if (picked == null || !mounted) return;
    setState(() => _dob = picked);
  }

  String _iso(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    final name = _childName.text.trim();
    final campus = _campus?.trim() ?? '';
    if (name.isEmpty) {
      setState(() => _error = 'Enter the child’s full name.');
      return;
    }
    if (campus.isEmpty) {
      setState(() => _error = 'Choose a campus.');
      return;
    }
    final network = _networkOf(_payPhone.text);
    if (network == null) {
      setState(() => _error = 'Enter a valid MTN or Airtel number.');
      return;
    }

    setState(() {
      _paying = true;
      _error = null;
      _statusNote = 'Sending Mobile Money request…';
      _waitingId = null;
    });

    final result = await widget.controller.startAdmissionPayment(
      childName: name,
      childDob: _dob == null ? null : _iso(_dob!),
      campus: campus,
      grade: _grade,
      message: _message.text.trim().isEmpty ? null : _message.text.trim(),
      phone: _phone.text.trim().isEmpty ? null : _phone.text.trim(),
      payPhone: _payPhone.text.trim(),
    );

    if (!mounted) return;

    if (result['error'] is String) {
      setState(() {
        _paying = false;
        _statusNote = null;
        _error = result['error'] as String;
      });
      return;
    }

    final payment = result['payment'];
    if (payment is! Map) {
      setState(() {
        _paying = false;
        _statusNote = null;
        _error = 'Could not start the payment.';
      });
      return;
    }

    final status = payment['status']?.toString() ?? 'pending';
    final id = payment['id']?.toString();
    final token = payment['token']?.toString();

    if (status == 'paid') {
      await _onPaid();
      return;
    }
    if (status == 'failed') {
      setState(() {
        _paying = false;
        _statusNote = null;
        _error = 'The request was declined or timed out. You have not been charged.';
      });
      return;
    }

    setState(() {
      _waitingId = id;
      _statusNote =
          'Approve the $network prompt on ${_payPhone.text.trim()}. Stay in the app.';
    });
    _startPolling(id, token);
  }

  void _startPolling(String? id, String? token) {
    _poll?.cancel();
    if (id == null || id.isEmpty || token == null || token.isEmpty) {
      setState(() => _paying = false);
      return;
    }
    var attempts = 0;
    _poll = Timer.periodic(const Duration(seconds: 4), (timer) async {
      attempts += 1;
      if (attempts > 40) {
        timer.cancel();
        if (!mounted) return;
        setState(() {
          _paying = false;
          _waitingId = null;
          _statusNote = 'Still waiting on the phone. You can try again shortly.';
        });
        return;
      }
      final result = await widget.controller.checkAdmissionPayment(
        paymentId: id,
        token: token,
      );
      if (!mounted) return;
      if (result['error'] is String) return;
      final payment = result['payment'];
      if (payment is! Map) return;
      final status = payment['status']?.toString() ?? '';
      if (status == 'paid') {
        timer.cancel();
        await _onPaid();
      } else if (status == 'failed') {
        timer.cancel();
        setState(() {
          _paying = false;
          _waitingId = null;
          _statusNote = null;
          _error = 'The request was declined or timed out. You have not been charged.';
        });
      }
    });
  }

  Future<void> _onPaid() async {
    _poll?.cancel();
    setState(() {
      _paying = false;
      _waitingId = null;
      _statusNote = 'Application received.';
      _childName.clear();
      _message.clear();
      _dob = null;
      _grade = null;
      _showNote = false;
    });
    await widget.controller.refresh();
    if (!mounted) return;
    _toast('Application submitted. Admissions will be in touch.');
  }

  void _cancelWait() {
    _poll?.cancel();
    setState(() {
      _paying = false;
      _waitingId = null;
      _statusNote = null;
    });
  }

  InputDecoration _field(String label, {String? hint, String? helper, Widget? suffix}) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      helperText: helper,
      suffixIcon: suffix,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final apps = portal.applications;
    final needPhone = (portal.profile.phone ?? '').trim().isEmpty;
    final fee = _feeForCampus;
    final network = _networkOf(_payPhone.text);
    final waiting = _paying && _waitingId != null;

    return PortalScroll(
      children: [
        const PageIntro(
          tone: Tone.lilac,
          eyebrow: 'SCHOOL',
          title: 'Apply for a place',
          detail: 'Fill in the child, choose a campus, then pay the admission fee by Mobile Money.',
        ),
        const SizedBox(height: 14),
        if (_paying || _statusNote != null || _error != null) ...[
          _StatusBanner(
            paying: _paying,
            waiting: waiting,
            note: _statusNote,
            error: _error,
            onCancel: waiting ? _cancelWait : null,
          ),
          const SizedBox(height: 12),
        ],
        SoftCard(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _SectionLabel(
                step: '1',
                title: 'Child',
                subtitle: 'Who is applying',
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _childName,
                textCapitalization: TextCapitalization.words,
                enabled: !_paying,
                textInputAction: TextInputAction.next,
                decoration: _field('Full name', hint: 'As on the birth certificate'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _TapField(
                      enabled: !_paying,
                      label: 'Date of birth',
                      value: _dob == null
                          ? 'Optional'
                          : shortDate(_iso(_dob!), withYear: true),
                      icon: Icons.cake_outlined,
                      muted: _dob == null,
                      onTap: _pickDob,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('grade-${_grade ?? 'none'}'),
                      initialValue: _grade,
                      decoration: _field('Class'),
                      hint: const Text('Select'),
                      isExpanded: true,
                      items: [
                        for (final option in _classOptions)
                          DropdownMenuItem(
                            value: option,
                            child: Text(option, overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: _paying
                          ? null
                          : (value) => setState(() => _grade = value),
                    ),
                  ),
                ],
              ),
              if (needPhone) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _phone,
                  enabled: !_paying,
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[\d+\s]')),
                  ],
                  decoration: _field('Your phone', hint: '0772 123 456'),
                ),
              ],
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _paying
                      ? null
                      : () => setState(() => _showNote = !_showNote),
                  icon: Icon(
                    _showNote ? Icons.expand_less_rounded : Icons.notes_rounded,
                    size: 18,
                  ),
                  label: Text(_showNote ? 'Hide note' : 'Add a note (optional)'),
                ),
              ),
              if (_showNote) ...[
                TextField(
                  controller: _message,
                  enabled: !_paying,
                  minLines: 2,
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: _field(
                    'Anything we should know?',
                    hint: 'Allergies, previous school, preferred start…',
                  ),
                ),
              ],
              const SizedBox(height: 22),
              const _SectionLabel(
                step: '2',
                title: 'Campus',
                subtitle: 'Admission fee by campus',
              ),
              const SizedBox(height: 14),
              if (_loadingFees)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Center(
                    child: SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: KjaColors.navy,
                      ),
                    ),
                  ),
                )
              else if (_fees.isEmpty)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: KjaColors.sunWash,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: KjaColors.line),
                  ),
                  child: const Text(
                    'Admission fees are not available right now. Try again shortly.',
                    style: TextStyle(
                      color: KjaColors.sunDeep,
                      fontWeight: FontWeight.w700,
                      height: 1.35,
                    ),
                  ),
                )
              else
                ...[
                  for (var i = 0; i < _fees.length; i++) ...[
                    if (i > 0) const SizedBox(height: 8),
                    _CampusChoice(
                      campus: _fees[i].campus,
                      fee: _fees[i].fee,
                      selected: _campus == _fees[i].campus,
                      enabled: !_paying,
                      onTap: () => setState(() => _campus = _fees[i].campus),
                    ),
                  ],
                ],
              const SizedBox(height: 22),
              const _SectionLabel(
                step: '3',
                title: 'Pay',
                subtitle: 'Approve the prompt on your phone',
              ),
              const SizedBox(height: 14),
              if (fee != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  decoration: BoxDecoration(
                    color: KjaColors.paper,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: KjaColors.line),
                  ),
                  child: Row(
                    children: [
                      const ToneIcon(
                        icon: Icons.payments_outlined,
                        tone: Tone.sky,
                        size: 40,
                        iconSize: 20,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Admission fee',
                              style: TextStyle(
                                color: KjaColors.soft,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              moneyUgx(fee),
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 20,
                                letterSpacing: -0.3,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if ((_campus ?? '').isNotEmpty)
                        Flexible(
                          child: Text(
                            _campus!,
                            textAlign: TextAlign.right,
                            style: const TextStyle(
                              color: KjaColors.soft,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              TextField(
                controller: _payPhone,
                enabled: !_paying,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[\d+\s]')),
                ],
                decoration: _field(
                  'Mobile money number',
                  hint: '0772 123 456',
                  helper: network ?? 'MTN or Airtel',
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 16),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: KjaColors.navy,
                  minimumSize: const Size.fromHeight(52),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onPressed: _paying || _fees.isEmpty ? null : _submit,
                child: _paying
                    ? Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.2,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            waiting ? 'Waiting for approval…' : 'Starting…',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ],
                      )
                    : Text(
                        fee == null
                            ? 'Pay & submit'
                            : 'Pay ${moneyUgx(fee)} & submit',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
              const SizedBox(height: 10),
              const Text(
                'You stay in the app. Approve the PIN prompt on your phone to finish.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: KjaColors.mute,
                  fontSize: 12,
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 28),
        SectionTitle(
          title: 'Your applications',
          action: apps.isEmpty ? null : '${apps.length}',
        ),
        const SizedBox(height: 12),
        if (apps.isEmpty)
          const EmptyNote(
            icon: Icons.assignment_outlined,
            title: 'No applications yet',
            message: 'When you submit, progress shows here as admissions review the file.',
          )
        else
          ...apps.map((app) {
            final tone = _statusTone(app.status);
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ToneIcon(
                      icon: Icons.child_care_rounded,
                      tone: tone,
                      size: 44,
                      iconSize: 22,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            app.childName,
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 15,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            [
                              if ((app.grade ?? '').isNotEmpty) app.grade,
                              if ((app.campus ?? '').isNotEmpty) app.campus,
                              shortDate(app.createdAt, withYear: true),
                            ]
                                .whereType<String>()
                                .where((s) => s.isNotEmpty)
                                .join(' · '),
                            style: const TextStyle(
                              color: KjaColors.soft,
                              fontSize: 13,
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: 10),
                          _StatusChip(
                            label: _statusLabel(app.status),
                            tone: tone,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({
    required this.step,
    required this.title,
    required this.subtitle,
  });

  final String step;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: KjaColors.navy,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            step,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
              fontSize: 13,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 15,
                  letterSpacing: -0.2,
                ),
              ),
              Text(
                subtitle,
                style: const TextStyle(
                  color: KjaColors.mute,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CampusChoice extends StatelessWidget {
  const _CampusChoice({
    required this.campus,
    required this.fee,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String campus;
  final int fee;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? KjaColors.skyWash : Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(16),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? KjaColors.skyDeep.withValues(alpha: 0.45) : KjaColors.line,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected ? KjaColors.skyDeep : Colors.white,
                  border: Border.all(
                    color: selected ? KjaColors.skyDeep : KjaColors.line,
                    width: 1.6,
                  ),
                ),
                child: selected
                    ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  campus,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: selected ? KjaColors.skyDeep : KjaColors.ink,
                  ),
                ),
              ),
              Text(
                moneyUgx(fee),
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: selected ? KjaColors.skyDeep : KjaColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TapField extends StatelessWidget {
  const _TapField({
    required this.label,
    required this.value,
    required this.icon,
    required this.onTap,
    required this.enabled,
    this.muted = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final VoidCallback onTap;
  final bool enabled;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(16),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
            suffixIcon: Icon(icon, size: 18, color: KjaColors.mute),
          ),
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: muted ? KjaColors.mute : KjaColors.ink,
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({
    required this.paying,
    required this.waiting,
    required this.note,
    required this.error,
    this.onCancel,
  });

  final bool paying;
  final bool waiting;
  final String? note;
  final String? error;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final isError = error != null && !paying;
    final tone = isError ? Tone.rose : (waiting ? Tone.sun : Tone.mint);
    final text = isError ? error! : (note ?? 'Working…');

    return SoftCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      color: tone.wash,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ToneIcon(
                icon: isError
                    ? Icons.error_outline_rounded
                    : waiting
                        ? Icons.phone_android_rounded
                        : Icons.check_circle_outline_rounded,
                tone: tone,
                size: 40,
                iconSize: 20,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isError
                          ? 'Could not complete'
                          : waiting
                              ? 'Approve on your phone'
                              : 'Update',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        color: tone.ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      text,
                      style: TextStyle(
                        color: tone.ink.withValues(alpha: 0.85),
                        height: 1.35,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (paying) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                minHeight: 3,
                color: tone.ink,
                backgroundColor: Colors.white.withValues(alpha: 0.65),
              ),
            ),
          ],
          if (onCancel != null) ...[
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: onCancel,
                style: TextButton.styleFrom(foregroundColor: tone.ink),
                child: const Text('Cancel wait'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.tone});

  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: tone.wash,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: 12,
          color: tone.ink,
        ),
      ),
    );
  }
}
