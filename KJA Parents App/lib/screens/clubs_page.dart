import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../format.dart';
import '../models.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _nurseryCodes = {'RC', 'C2', 'C3', 'C4'};

bool _clubFits(String section, String? classCode) {
  if (section.isEmpty || section == 'both') return true;
  if (classCode == null || classCode.isEmpty) return true;
  final level = _nurseryCodes.contains(classCode) ? 'nursery' : 'primary';
  return level == section;
}

String? _networkOf(String phone) {
  var digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('256')) digits = digits.substring(3);
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!RegExp(r'^7\d{8}$').hasMatch(digits)) return null;
  final prefix = digits.substring(0, 2);
  if (const {'76', '77', '78', '79'}.contains(prefix)) return 'MTN Mobile Money';
  if (const {'70', '74', '75'}.contains(prefix)) return 'Airtel Money';
  return null;
}

class ClubsPage extends StatefulWidget {
  const ClubsPage({
    super.key,
    required this.portal,
    required this.controller,
    required this.openWeb,
  });

  final PortalSnapshot portal;
  final PortalController controller;
  final Future<void> Function(String path) openWeb;

  @override
  State<ClubsPage> createState() => _ClubsPageState();
}

class _ClubsPageState extends State<ClubsPage> {
  String? _childId;
  final _phone = TextEditingController();
  final _selected = <String>{};
  bool _paying = false;
  String? _waitingId;
  String? _statusNote;
  Timer? _poll;

  PortalSnapshot get portal => widget.controller.snapshot ?? widget.portal;

  @override
  void initState() {
    super.initState();
    _childId = portal.children.isEmpty ? null : portal.children.first.id;
    final phone = portal.profile.phone?.trim() ?? '';
    if (phone.isNotEmpty) _phone.text = phone;
  }

  @override
  void dispose() {
    _poll?.cancel();
    _phone.dispose();
    super.dispose();
  }

  ParentChild? get _child {
    final id = _childId;
    if (id == null) return null;
    for (final child in portal.children) {
      if (child.id == id) return child;
    }
    return null;
  }

  List<ClubOffer> _clubsFor(ParentChild child) {
    return portal.clubs.where((club) => club.active && _clubFits(club.section, child.classCode)).toList();
  }

  ClubPaymentRecord? _paymentFor(String studentId, String clubId) {
    for (final row in portal.clubPayments) {
      if (row.studentId == studentId && row.clubId == clubId) return row;
    }
    return null;
  }

  ClubConsent? _consentFor(String studentId, String clubId) {
    for (final row in portal.consents) {
      if (row.isOpen && row.studentId == studentId && row.clubId == clubId) return row;
    }
    return null;
  }

  Future<void> _paySelected(ParentChild child) async {
    final clubs = _clubsFor(child)
        .where((club) => _selected.contains(club.id))
        .where((club) => _consentFor(child.id, club.id) != null)
        .where((club) => _paymentFor(child.id, club.id) == null)
        .where((club) => club.hasFee)
        .toList();
    if (clubs.isEmpty) {
      _toast('Consent to a club with a fee before paying.');
      return;
    }
    final network = _networkOf(_phone.text);
    if (network == null) {
      _toast('Enter a valid MTN or Airtel number.');
      return;
    }

    setState(() {
      _paying = true;
      _statusNote = 'Sending Mobile Money request…';
      _waitingId = null;
    });

    final result = await widget.controller.startClubPayment(
      studentId: child.id,
      clubIds: clubs.map((c) => c.id).toList(),
      phone: _phone.text.trim(),
    );

    if (!mounted) return;

    if (result['error'] is String) {
      setState(() {
        _paying = false;
        _statusNote = null;
      });
      _toast(result['error'] as String);
      return;
    }

    final payment = result['payment'];
    if (payment is! Map) {
      setState(() {
        _paying = false;
        _statusNote = null;
      });
      _toast('Could not start the payment.');
      return;
    }

    final status = payment['status']?.toString() ?? 'pending';
    final id = payment['id']?.toString();

    if (status == 'paid') {
      setState(() {
        _paying = false;
        _statusNote = 'Payment confirmed.';
        _selected.clear();
      });
      await widget.controller.refresh();
      _toast('Club fee paid. Thank you.');
      return;
    }

    if (status == 'failed') {
      setState(() {
        _paying = false;
        _statusNote = null;
      });
      _toast('The request was declined or timed out. You have not been charged.');
      return;
    }

    setState(() {
      _waitingId = id;
      _statusNote = 'Approve the $network prompt on ${_phone.text.trim()}. Stay in the app.';
    });
    _startPolling(id);
  }

  void _startPolling(String? collectionId) {
    _poll?.cancel();
    if (collectionId == null || collectionId.isEmpty) {
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
      final result = await widget.controller.checkClubPayment(collectionId);
      if (!mounted) return;
      if (result['error'] is String) return;
      final payment = result['payment'];
      if (payment is! Map) return;
      final status = payment['status']?.toString() ?? 'pending';
      if (status == 'pending') return;

      timer.cancel();
      setState(() {
        _paying = false;
        _waitingId = null;
      });
      if (status == 'paid') {
        setState(() {
          _selected.clear();
          _statusNote = 'Payment confirmed.';
        });
        await widget.controller.refresh();
        if (mounted) _toast('Club fee paid. Thank you.');
      } else {
        setState(() => _statusNote = null);
        _toast('The request was declined or timed out. You have not been charged.');
      }
    });
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final child = _child;
    final consents = portal.consents.where((c) => c.studentId == child?.id && c.isOpen).toList();
    final clubs = child == null ? <ClubOffer>[] : _clubsFor(child);
    final payable = child == null
        ? <ClubOffer>[]
        : clubs
            .where((club) => _selected.contains(club.id))
            .where((club) => _consentFor(child.id, club.id) != null)
            .where((club) => _paymentFor(child.id, club.id) == null)
            .where((club) => club.hasFee)
            .toList();
    final payTotal = payable.fold<num>(0, (sum, club) => sum + club.feeAmount);
    final network = _networkOf(_phone.text);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        const PageHero(
          kicker: 'Activities',
          title: 'Clubs',
          lead: 'Consent and pay club fees with Mobile Money.',
          icon: Icons.extension_rounded,
          colors: [Color(0xFF9A3412), KjaColors.coralDeep, KjaColors.sun],
        ),
        const SizedBox(height: 16),
        if (portal.children.isEmpty)
          const EmptyNote(icon: Icons.extension_rounded, message: 'Link a child before managing clubs.')
        else ...[
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: portal.children.map((entry) {
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(firstNameOf(entry.fullName)),
                    selected: child?.id == entry.id,
                    onSelected: (_) => setState(() {
                      _childId = entry.id;
                      _selected.clear();
                      _statusNote = null;
                    }),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 12),
          if (clubs.isEmpty)
            const EmptyNote(icon: Icons.extension_rounded, message: 'No clubs are open for this child right now.')
          else
            ...clubs.map((club) {
              final consented = consents.any((c) => c.clubId == club.id);
              final consent = _consentFor(child!.id, club.id);
              final paid = _paymentFor(child.id, club.id);
              final selected = _selected.contains(club.id);
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SoftCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          ToneIcon(icon: clubIcon(club.title), tone: Tone.coral, size: 44, iconSize: 22),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(club.title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                                if ((club.meeting ?? '').isNotEmpty || (club.campus ?? '').isNotEmpty)
                                  Text(
                                    [club.meeting, club.campus].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
                                    style: const TextStyle(color: KjaColors.soft),
                                  ),
                                if ((club.description ?? '').isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(club.description!, style: const TextStyle(color: KjaColors.soft, height: 1.35)),
                                ],
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 6,
                                  children: [
                                    if (club.hasFee)
                                      _Pill(label: moneyUgx(club.feeAmount), tone: Tone.sun)
                                    else
                                      const _Pill(label: 'No fee', tone: Tone.mint),
                                    if (paid != null)
                                      _Pill(label: paid.receiptNo?.isNotEmpty == true ? 'Paid · ${paid.receiptNo}' : 'Paid', tone: Tone.mint)
                                    else if (consented)
                                      const _Pill(label: 'Consented', tone: Tone.coral),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (paid == null)
                            consented
                                ? OutlinedButton(
                                    onPressed: _paying || consent == null
                                        ? null
                                        : () async {
                                            final error = await widget.controller.withdrawClubConsent(consent.id);
                                            if (!context.mounted) return;
                                            if (error != null) _toast(error);
                                            setState(() => _selected.remove(club.id));
                                          },
                                    child: const Text('Withdraw consent'),
                                  )
                                : FilledButton(
                                    style: FilledButton.styleFrom(backgroundColor: KjaColors.coralDeep),
                                    onPressed: _paying
                                        ? null
                                        : () async {
                                            final error = await widget.controller.consentToClub(
                                              clubId: club.id,
                                              studentId: child.id,
                                            );
                                            if (!context.mounted) return;
                                            if (error != null) _toast(error);
                                          },
                                    child: const Text('Give consent'),
                                  ),
                          if (consented && paid == null && club.hasFee)
                            FilterChip(
                              label: Text(selected ? 'In basket' : 'Add to pay'),
                              selected: selected,
                              onSelected: _paying
                                  ? null
                                  : (on) => setState(() {
                                        if (on) {
                                          _selected.add(club.id);
                                        } else {
                                          _selected.remove(club.id);
                                        }
                                      }),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
          if (child != null && clubs.any((c) => c.hasFee)) ...[
            const SizedBox(height: 8),
            SoftCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Pay with Mobile Money', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                  const SizedBox(height: 4),
                  const Text(
                    'We send a PIN prompt to your phone. Approve it here in the app — no browser needed.',
                    style: TextStyle(color: KjaColors.soft, height: 1.35),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _phone,
                    enabled: !_paying,
                    keyboardType: TextInputType.phone,
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]'))],
                    decoration: InputDecoration(
                      labelText: 'MTN or Airtel number',
                      hintText: '0772 123 456',
                      helperText: network,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  if (_statusNote != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      _statusNote!,
                      style: TextStyle(
                        color: _waitingId != null ? KjaColors.coralDeep : KjaColors.ink,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: KjaColors.coralDeep,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: _paying || payable.isEmpty ? null : () => _paySelected(child),
                      icon: _paying
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.phone_android_rounded, size: 18),
                      label: Text(
                        _paying
                            ? (_waitingId != null ? 'Waiting for approval…' : 'Starting…')
                            : payable.isEmpty
                                ? 'Select clubs to pay'
                                : 'Pay ${moneyUgx(payTotal)}',
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _paying ? null : () => widget.openWeb('/account/clubs'),
                    child: const Text('Open clubs on the website'),
                  ),
                ],
              ),
            ),
          ],
        ],
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.tone});

  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      Tone.mint => (const Color(0xFFE8F6EF), const Color(0xFF0F766E)),
      Tone.sun => (const Color(0xFFFFF4D6), const Color(0xFF92400E)),
      Tone.coral => (const Color(0xFFFFE8E1), const Color(0xFF9A3412)),
      _ => (const Color(0xFFF1F5F9), KjaColors.ink),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: colors.$1, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(color: colors.$2, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}
