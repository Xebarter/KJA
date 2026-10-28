import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../format.dart';
import '../models.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

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

class FeesPage extends StatefulWidget {
  const FeesPage({
    super.key,
    required this.portal,
    required this.controller,
  });

  final PortalSnapshot portal;
  final PortalController controller;

  @override
  State<FeesPage> createState() => _FeesPageState();
}

class _FeesPageState extends State<FeesPage> {
  String? _feeId;
  final _phone = TextEditingController();
  final _amount = TextEditingController();
  bool _paying = false;
  String? _waitingId;
  String? _statusNote;
  Timer? _poll;

  PortalSnapshot get portal => widget.controller.snapshot ?? widget.portal;

  List<FeeBalance> get _payable =>
      portal.fees.where((fee) => fee.hasDue && (fee.termId?.isNotEmpty ?? false)).toList();

  FeeBalance? get _selected {
    final id = _feeId;
    if (id == null) return null;
    for (final fee in _payable) {
      if (fee.id == id) return fee;
    }
    return _payable.isEmpty ? null : _payable.first;
  }

  @override
  void initState() {
    super.initState();
    final first = _payable.isEmpty ? null : _payable.first;
    _feeId = first?.id;
    if (first != null) _amount.text = first.balance.round().toString();
    final phone = portal.profile.phone?.trim() ?? '';
    if (phone.isNotEmpty) _phone.text = phone;
  }

  @override
  void dispose() {
    _poll?.cancel();
    _phone.dispose();
    _amount.dispose();
    super.dispose();
  }

  void _chooseFee(String id) {
    FeeBalance? fee;
    for (final item in _payable) {
      if (item.id == id) {
        fee = item;
        break;
      }
    }
    setState(() {
      _feeId = id;
      if (fee != null) _amount.text = fee.balance.round().toString();
      _statusNote = null;
      _waitingId = null;
    });
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _pay() async {
    final fee = _selected;
    if (fee == null || fee.termId == null) {
      _toast('Choose a term balance to pay.');
      return;
    }
    final network = _networkOf(_phone.text);
    if (network == null) {
      _toast('Enter a valid MTN or Airtel number.');
      return;
    }
    final raw = _amount.text.replaceAll(RegExp(r'[^\d.]'), '');
    final amount = num.tryParse(raw);
    if (amount == null || amount <= 0) {
      _toast('Enter the amount you want to pay.');
      return;
    }

    setState(() {
      _paying = true;
      _statusNote = 'Sending Mobile Money request…';
      _waitingId = null;
    });

    final result = await widget.controller.startFeePayment(
      studentId: fee.childId,
      termId: fee.termId!,
      amount: amount,
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
      });
      await widget.controller.refresh();
      _toast('School fees paid. Thank you.');
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
      final result = await widget.controller.checkFeePayment(collectionId);
      if (!mounted) return;
      if (result['error'] is String) return;
      final payment = result['payment'];
      if (payment is! Map) return;
      final status = payment['status']?.toString() ?? 'pending';
      if (status == 'paid') {
        timer.cancel();
        setState(() {
          _paying = false;
          _waitingId = null;
          _statusNote = 'Payment confirmed.';
        });
        await widget.controller.refresh();
        if (!mounted) return;
        final receipt = payment['receiptNo']?.toString();
        _toast(receipt == null || receipt.isEmpty ? 'School fees paid. Thank you.' : 'Paid. Receipt $receipt.');
        final next = _payable.isEmpty ? null : _payable.first;
        setState(() {
          _feeId = next?.id;
          _amount.text = next == null ? '' : next.balance.round().toString();
        });
      } else if (status == 'failed') {
        timer.cancel();
        setState(() {
          _paying = false;
          _waitingId = null;
          _statusNote = null;
        });
        _toast('The request was declined or timed out. You have not been charged.');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final outstanding = portal.totalOutstanding;
    final nameById = {for (final c in portal.children) c.id: c.fullName};
    final fee = _selected;
    final network = _networkOf(_phone.text);

    return PortalScroll(
      children: [
        if (outstanding > 0)
          BrandHero(
            eyebrow: 'SCHOOL FEES',
            title: moneyUgx(outstanding),
            detail: 'Outstanding across your linked children.',
            colors: const [Color(0xFF7C2D12), KjaColors.coralDeep, Color(0xFFEA580C)],
            trailing: ToneIcon(icon: Icons.receipt_long_rounded, tone: Tone.coral, size: 44, iconSize: 22),
          )
        else
          const PageIntro(
            tone: Tone.coral,
            eyebrow: 'FAMILY',
            title: 'School fees',
            detail: 'Balances, Mobile Money payments, and receipts.',
          ),
        const SizedBox(height: 14),
        if (_payable.isNotEmpty) ...[
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Pay with Mobile Money', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, letterSpacing: -0.15)),
                const SizedBox(height: 6),
                const Text(
                  'We send a PIN prompt to your phone. Approve it here in the app — no browser needed.',
                  style: TextStyle(color: KjaColors.soft, height: 1.4, fontWeight: FontWeight.w600, fontSize: 13.5),
                ),
                const SizedBox(height: 12),
                InputDecorator(
                  decoration: InputDecoration(
                    labelText: 'Child and term',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      isExpanded: true,
                      value: fee?.id,
                      items: [
                        for (final item in _payable)
                          DropdownMenuItem(
                            value: item.id,
                            child: Text(
                              '${nameById[item.childId] ?? 'Child'} · ${item.term} · ${moneyUgx(item.balance)} owing',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: _paying
                          ? null
                          : (value) {
                              if (value != null) _chooseFee(value);
                            },
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _amount,
                  enabled: !_paying,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(
                    labelText: 'Amount (UGX)',
                    helperText: fee == null ? null : 'Up to ${moneyUgx(fee.balance)}',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                    suffixIcon: fee == null
                        ? null
                        : TextButton(
                            onPressed: _paying
                                ? null
                                : () => setState(() => _amount.text = fee.balance.round().toString()),
                            child: const Text('Full'),
                          ),
                  ),
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
                    onPressed: _paying || fee == null ? null : _pay,
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
                          : 'Pay with Mobile Money',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        const SectionTitle(title: 'Balances'),
        const SizedBox(height: 10),
        if (portal.fees.isEmpty)
          const EmptyNote(
            icon: Icons.receipt_long_rounded,
            title: 'No balances yet',
            message: 'Fee balances will appear here once the accounts office posts them.',
          )
        else
          ...portal.fees.map((item) {
            final progress = item.amountDue <= 0 ? 1.0 : (item.amountPaid / item.amountDue).clamp(0.0, 1.0);
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                accent: item.hasDue ? KjaColors.coralDeep : KjaColors.mintDeep,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            nameById[item.childId] ?? 'Child',
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                          ),
                        ),
                        StatusPill(
                          label: item.hasDue ? 'Due' : 'Clear',
                          tone: item.hasDue ? Tone.coral : Tone.mint,
                          filled: item.hasDue,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${item.term}${item.dueOn != null ? ' · due ${shortDate(item.dueOn)}' : ''}',
                      style: const TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                    const SizedBox(height: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        value: progress.toDouble(),
                        minHeight: 7,
                        backgroundColor: KjaColors.line,
                        color: item.hasDue ? KjaColors.coral : KjaColors.mint,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Invoiced ${moneyUgx(item.amountDue)}',
                            style: const TextStyle(fontSize: 12.5, color: KjaColors.soft, fontWeight: FontWeight.w600),
                          ),
                        ),
                        Text(
                          item.hasDue ? 'Due ${moneyUgx(item.balance)}' : 'Paid in full',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: item.hasDue ? KjaColors.coralDeep : KjaColors.mintDeep,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          }),
        const SizedBox(height: 14),
        const SectionTitle(title: 'Receipts'),
        const SizedBox(height: 10),
        if (portal.receipts.isEmpty)
          const EmptyNote(icon: Icons.payments_rounded, title: 'No receipts yet', message: 'Confirmed payments will be listed here.')
        else
          ...portal.receipts.take(20).map((receipt) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                child: Row(
                  children: [
                    ToneIcon(icon: Icons.payments_rounded, tone: Tone.mint, size: 40, iconSize: 19),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            receipt.receiptNo.isEmpty ? 'Receipt' : receipt.receiptNo,
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${nameById[receipt.childId] ?? 'Child'} · ${shortDate(receipt.paidOn, withYear: true)} · ${receipt.method}',
                            style: const TextStyle(color: KjaColors.soft, fontSize: 12, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                    Text(moneyUgx(receipt.amount), style: const TextStyle(fontWeight: FontWeight.w800, color: KjaColors.mintDeep)),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}
