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
  if (const {'70', '72', '73', '74', '75'}.contains(prefix)) return 'Airtel Money';
  return null;
}

bool _matchesQuery(ClubOffer club, String needle) {
  if (needle.isEmpty) return true;
  final hay = [
    club.title,
    club.category,
    club.description,
    club.meeting,
    club.campus,
  ].whereType<String>().join(' ').toLowerCase();
  return hay.contains(needle);
}

class ClubsPage extends StatefulWidget {
  const ClubsPage({
    super.key,
    required this.portal,
    required this.controller,
  });

  final PortalSnapshot portal;
  final PortalController controller;

  @override
  State<ClubsPage> createState() => _ClubsPageState();
}

class _ClubsPageState extends State<ClubsPage> {
  String? _childId;
  final _search = TextEditingController();

  PortalSnapshot get portal => widget.controller.snapshot ?? widget.portal;

  @override
  void initState() {
    super.initState();
    _childId = portal.children.isEmpty ? null : portal.children.first.id;
    widget.controller.addListener(_onController);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onController);
    _search.dispose();
    super.dispose();
  }

  void _onController() {
    if (mounted) setState(() {});
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

  ClubOffer? _clubById(String clubId) {
    for (final club in portal.clubs) {
      if (club.id == clubId) return club;
    }
    return null;
  }

  ParentChild? _childById(String studentId) {
    for (final child in portal.children) {
      if (child.id == studentId) return child;
    }
    return null;
  }

  List<ClubOffer> _visibleClubs(ParentChild child) {
    final needle = _search.text.trim().toLowerCase();
    return _clubsFor(child).where((club) => _matchesQuery(club, needle)).toList();
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _toggleCart(ParentChild child, ClubOffer club) async {
    if (!club.hasFee) return;
    if (_paymentFor(child.id, club.id) != null) return;

    if (widget.controller.clubInCart(child.id, club.id)) {
      widget.controller.removeClubFromCart(child.id, club.id);
      return;
    }

    if (_consentFor(child.id, club.id) == null) {
      final error = await widget.controller.consentToClub(clubId: club.id, studentId: child.id);
      if (!mounted) return;
      if (error != null) {
        _toast(error);
        return;
      }
    }
    widget.controller.addClubToCart(child.id, club.id);
  }

  void _prunePaidFromCart() {
    final drop = <ClubCartLine>[];
    for (final line in widget.controller.clubCart) {
      if (_paymentFor(line.studentId, line.clubId) != null) drop.add(line);
    }
    for (final line in drop) {
      widget.controller.removeClubFromCart(line.studentId, line.clubId);
    }
  }

  Future<void> _openCart() async {
    _prunePaidFromCart();
    if (widget.controller.clubCart.isEmpty) {
      _toast('Add clubs first.');
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return _CartCheckoutSheet(
          controller: widget.controller,
          portal: portal,
          clubById: _clubById,
          childById: _childById,
        );
      },
    );
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final child = _child;
    final clubs = child == null ? <ClubOffer>[] : _visibleClubs(child);
    final allClubs = child == null ? <ClubOffer>[] : _clubsFor(child);
    final cartCount = widget.controller.clubCart.length;

    return Column(
      children: [
        if (portal.children.isNotEmpty)
          Material(
            color: KjaColors.pageTop,
            elevation: 0,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: KjaColors.line.withValues(alpha: 0.9))),
                boxShadow: [
                  BoxShadow(
                    color: KjaColors.ink.withValues(alpha: 0.04),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 88,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: portal.children.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 10),
                        itemBuilder: (context, index) {
                          final entry = portal.children[index];
                          final selected = child?.id == entry.id;
                          return _ChildPick(
                            child: entry,
                            selected: selected,
                            onTap: () => setState(() {
                              _childId = entry.id;
                            }),
                          );
                        },
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _CartButton(count: cartCount, onTap: _openCart),
                ],
              ),
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            color: KjaColors.navy,
            onRefresh: widget.controller.refresh,
            child: ListView(
              padding: kPortalPadding,
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              children: [
                const PageIntro(
                  tone: Tone.coral,
                  eyebrow: 'SCHOOL',
                  title: 'Clubs',
                  detail: 'Browse, join, and pay for after-school clubs.',
                ),
                const SizedBox(height: 12),
                if (portal.children.isEmpty)
                  const EmptyNote(
                    icon: Icons.extension_rounded,
                    title: 'Link a child first',
                    message: 'Link a child before managing clubs.',
                  )
                else ...[
                  TextField(
                    controller: _search,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Search clubs',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear',
                              onPressed: () => setState(_search.clear),
                              icon: const Icon(Icons.close_rounded),
                            ),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                      filled: true,
                      fillColor: Colors.white,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 14),
                  if (allClubs.isEmpty)
                    const EmptyNote(
                      icon: Icons.extension_rounded,
                      title: 'No clubs open',
                      message: 'No clubs are open for this child right now.',
                    )
                  else if (clubs.isEmpty)
                    EmptyNote(
                      icon: Icons.search_off_rounded,
                      message: _search.text.trim().isEmpty ? 'Nothing to show.' : 'No match for “${_search.text.trim()}”.',
                    )
                  else
                    ...clubs.map((club) {
                final paid = _paymentFor(child!.id, club.id);
                final consented = _consentFor(child.id, club.id) != null;
                final inCart = widget.controller.clubInCart(child.id, club.id);
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
                                  if ((club.category ?? '').isNotEmpty)
                                    Text(
                                      club.category!,
                                      style: const TextStyle(color: KjaColors.mute, fontSize: 12, fontWeight: FontWeight.w700),
                                    ),
                                  if ((club.meeting ?? '').isNotEmpty || (club.campus ?? '').isNotEmpty)
                                    Text(
                                      [club.meeting, club.campus].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
                                      style: const TextStyle(color: KjaColors.soft),
                                    ),
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
                                        const _Pill(label: 'Paid', tone: Tone.mint)
                                      else if (consented)
                                        const _Pill(label: 'Consented', tone: Tone.coral),
                                      if (inCart) const _Pill(label: 'In cart', tone: Tone.sky),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerRight,
                          child: paid != null
                              ? const Text('Paid', style: TextStyle(fontWeight: FontWeight.w800, color: KjaColors.mintDeep))
                              : Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  alignment: WrapAlignment.end,
                                  children: [
                                    if (consented)
                                      OutlinedButton(
                                        onPressed: () async {
                                          final consent = _consentFor(child.id, club.id);
                                          if (consent == null) return;
                                          if (inCart) {
                                            widget.controller.removeClubFromCart(child.id, club.id);
                                          }
                                          final error = await widget.controller.withdrawClubConsent(consent.id);
                                          if (error != null) _toast(error);
                                        },
                                        child: const Text('Withdraw'),
                                      )
                                    else
                                      FilledButton(
                                        style: FilledButton.styleFrom(backgroundColor: KjaColors.coralDeep),
                                        onPressed: () async {
                                          final error = await widget.controller.consentToClub(
                                            clubId: club.id,
                                            studentId: child.id,
                                          );
                                          if (error != null) _toast(error);
                                        },
                                        child: const Text('Consent'),
                                      ),
                                    if (club.hasFee)
                                      FilledButton.icon(
                                        style: FilledButton.styleFrom(
                                          backgroundColor: inCart ? KjaColors.navy : KjaColors.coralDeep,
                                        ),
                                        onPressed: () => _toggleCart(child, club),
                                        icon: Icon(
                                          inCart ? Icons.remove_shopping_cart_outlined : Icons.add_shopping_cart_rounded,
                                          size: 18,
                                        ),
                                        label: Text(inCart ? 'In cart' : 'Add'),
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
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _CartButton extends StatelessWidget {
  const _CartButton({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Cart',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: count > 0 ? KjaColors.coralWash : Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: count > 0 ? KjaColors.coralDeep.withValues(alpha: 0.35) : KjaColors.line,
              ),
              boxShadow: [
                BoxShadow(color: KjaColors.ink.withValues(alpha: 0.06), blurRadius: 10, offset: const Offset(0, 4)),
              ],
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(
                  Icons.shopping_cart_rounded,
                  color: count > 0 ? KjaColors.coralDeep : KjaColors.soft,
                ),
                if (count > 0)
                  Positioned(
                    right: 8,
                    top: 8,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 18),
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: KjaColors.coralDeep,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        count > 99 ? '99+' : '$count',
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800, height: 1.1),
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

class _CartCheckoutSheet extends StatefulWidget {
  const _CartCheckoutSheet({
    required this.controller,
    required this.portal,
    required this.clubById,
    required this.childById,
  });

  final PortalController controller;
  final PortalSnapshot portal;
  final ClubOffer? Function(String clubId) clubById;
  final ParentChild? Function(String studentId) childById;

  @override
  State<_CartCheckoutSheet> createState() => _CartCheckoutSheetState();
}

class _CartCheckoutSheetState extends State<_CartCheckoutSheet> {
  final _phone = TextEditingController();
  bool _paying = false;
  String? _waitingId;
  String? _statusNote;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    final phone = widget.portal.profile.phone?.trim() ?? '';
    if (phone.isNotEmpty) _phone.text = phone;
    widget.controller.addListener(_onController);
  }

  @override
  void dispose() {
    _poll?.cancel();
    widget.controller.removeListener(_onController);
    _phone.dispose();
    super.dispose();
  }

  void _onController() {
    if (mounted) setState(() {});
  }

  num get _total {
    num sum = 0;
    for (final line in widget.controller.clubCart) {
      final club = widget.clubById(line.clubId);
      if (club != null) sum += club.feeAmount;
    }
    return sum;
  }

  Map<String, List<ClubCartLine>> get _grouped {
    final map = <String, List<ClubCartLine>>{};
    for (final line in widget.controller.clubCart) {
      map.putIfAbsent(line.studentId, () => []).add(line);
    }
    return map;
  }

  Future<void> _pay() async {
    if (widget.controller.clubCart.isEmpty) return;
    final network = _networkOf(_phone.text);
    if (network == null) {
      setState(() => _statusNote = 'Enter a valid MTN or Airtel number.');
      return;
    }

    setState(() {
      _paying = true;
      _statusNote = 'Sending request…';
      _waitingId = null;
    });

    final result = await widget.controller.startClubPayment(phone: _phone.text.trim());
    if (!mounted) return;

    if (result['error'] is String) {
      setState(() {
        _paying = false;
        _statusNote = result['error'] as String;
      });
      return;
    }

    final payment = result['payment'];
    if (payment is! Map) {
      setState(() {
        _paying = false;
        _statusNote = 'Could not start the payment.';
      });
      return;
    }

    final status = payment['status']?.toString() ?? 'pending';
    final id = payment['id']?.toString();

    if (status == 'paid') {
      setState(() {
        _paying = false;
        _statusNote = 'Paid.';
      });
      await Future<void>.delayed(const Duration(milliseconds: 500));
      if (mounted) Navigator.of(context).pop();
      return;
    }

    if (status == 'failed') {
      setState(() {
        _paying = false;
        _statusNote = 'Declined or timed out. Not charged.';
      });
      return;
    }

    setState(() {
      _waitingId = id;
      _statusNote = 'Approve the $network prompt on ${_phone.text.trim()}.';
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
          _statusNote = 'Still waiting. Try again shortly.';
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
      if (status == 'paid') {
        widget.controller.clearClubCart();
        await widget.controller.refresh();
        if (!mounted) return;
        setState(() {
          _paying = false;
          _waitingId = null;
          _statusNote = 'Paid.';
        });
        await Future<void>.delayed(const Duration(milliseconds: 450));
        if (mounted) Navigator.of(context).pop();
      } else {
        setState(() {
          _paying = false;
          _waitingId = null;
          _statusNote = 'Declined or timed out. Not charged.';
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final grouped = _grouped;
    final network = _networkOf(_phone.text);
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: AnimatedSize(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.88),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(color: KjaColors.line, borderRadius: BorderRadius.circular(999)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text('Cart', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20)),
                    ),
                    Text(
                      moneyUgx(_total),
                      style: const TextStyle(fontWeight: FontWeight.w900, color: KjaColors.coralDeep),
                    ),
                    IconButton(
                      onPressed: _paying ? null : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: widget.controller.clubCart.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.all(28),
                        child: Text('Cart is empty.', textAlign: TextAlign.center),
                      )
                    : ListView(
                        shrinkWrap: true,
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                        children: [
                          for (final entry in grouped.entries) ...[
                            Builder(
                              builder: (context) {
                                final child = widget.childById(entry.key);
                                final name = child?.fullName ?? 'Child';
                                return Padding(
                                  padding: const EdgeInsets.only(top: 8, bottom: 8),
                                  child: Row(
                                    children: [
                                      PupilFace(
                                        name: name,
                                        studentId: entry.key,
                                        photoUrl: child?.photoUrl,
                                        radius: 16,
                                        color: Tone.coral.ink,
                                      ),
                                      const SizedBox(width: 10),
                                      Text(
                                        firstNameOf(name),
                                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                            for (final line in entry.value)
                              Builder(
                                builder: (context) {
                                  final club = widget.clubById(line.clubId);
                                  final title = club?.title ?? 'Club';
                                  final amount = club?.feeAmount ?? 0;
                                  return Dismissible(
                                    key: ValueKey(line.key),
                                    direction: _paying ? DismissDirection.none : DismissDirection.endToStart,
                                    onDismissed: (_) => widget.controller.removeClubFromCart(line.studentId, line.clubId),
                                    background: Container(
                                      alignment: Alignment.centerRight,
                                      padding: const EdgeInsets.only(right: 16),
                                      decoration: BoxDecoration(
                                        color: KjaColors.roseWash,
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                      child: const Icon(Icons.delete_outline_rounded, color: KjaColors.rose),
                                    ),
                                    child: SoftCard(
                                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                      child: Row(
                                        children: [
                                          ToneIcon(icon: clubIcon(title), tone: Tone.coral, size: 36, iconSize: 18),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
                                          ),
                                          Text(moneyUgx(amount), style: const TextStyle(fontWeight: FontWeight.w800)),
                                          if (!_paying)
                                            IconButton(
                                              visualDensity: VisualDensity.compact,
                                              onPressed: () => widget.controller.removeClubFromCart(line.studentId, line.clubId),
                                              icon: const Icon(Icons.close_rounded, size: 18),
                                            ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                          ],
                        ],
                      ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _phone,
                      enabled: !_paying,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]'))],
                      decoration: InputDecoration(
                        labelText: 'Mobile money number',
                        hintText: '0772 123 456',
                        helperText: network,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    if (_statusNote != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _statusNote!,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: _waitingId != null ? KjaColors.coralDeep : KjaColors.ink,
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: KjaColors.coralDeep,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: _paying || widget.controller.clubCart.isEmpty ? null : _pay,
                      icon: _paying
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.phone_android_rounded, size: 18),
                      label: Text(
                        _paying
                            ? (_waitingId != null ? 'Waiting…' : 'Starting…')
                            : 'Pay ${moneyUgx(_total)}',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChildPick extends StatelessWidget {
  const _ChildPick({
    required this.child,
    required this.selected,
    required this.onTap,
  });

  final ParentChild child;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          width: 78,
          padding: const EdgeInsets.fromLTRB(6, 6, 6, 8),
          decoration: BoxDecoration(
            color: selected ? KjaColors.coralWash : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected ? KjaColors.coralDeep.withValues(alpha: 0.35) : KjaColors.line,
              width: selected ? 1.6 : 1,
            ),
            boxShadow: [
              BoxShadow(
                color: KjaColors.ink.withValues(alpha: selected ? 0.08 : 0.04),
                blurRadius: selected ? 14 : 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              PupilFace(
                name: child.fullName,
                studentId: child.id,
                photoUrl: child.photoUrl,
                radius: 22,
                color: Tone.coral.ink,
              ),
              const SizedBox(height: 6),
              Text(
                firstNameOf(child.fullName),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                  color: selected ? KjaColors.coralDeep : KjaColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
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
      Tone.sky => (KjaColors.skyWash, KjaColors.skyDeep),
      _ => (const Color(0xFFF1F5F9), KjaColors.ink),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: colors.$1, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(color: colors.$2, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}
