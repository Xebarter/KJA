import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class FeesPage extends StatelessWidget {
  const FeesPage({super.key, required this.portal, required this.openWeb});

  final PortalSnapshot portal;
  final Future<void> Function(String path) openWeb;

  @override
  Widget build(BuildContext context) {
    final outstanding = portal.totalOutstanding;
    final nameById = {for (final c in portal.children) c.id: c.fullName};

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHero(
          kicker: 'Accounts',
          title: 'School fees',
          lead: outstanding > 0
              ? '${moneyUgx(outstanding)} still outstanding across your children.'
              : 'Fee balances look clear for the linked pupils.',
          icon: Icons.receipt_long_rounded,
          colors: const [Color(0xFF9A3412), KjaColors.coralDeep, KjaColors.coral],
          footer: Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: KjaColors.coralDeep),
              onPressed: () => openWeb('/account/fees'),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('Pay with Mobile Money'),
            ),
          ),
        ),
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
          ...portal.fees.map((fee) {
            final progress = fee.amountDue <= 0 ? 1.0 : (fee.amountPaid / fee.amountDue).clamp(0.0, 1.0);
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(nameById[fee.childId] ?? 'Child', style: const TextStyle(fontWeight: FontWeight.w900)),
                    Text('${fee.term}${fee.dueOn != null ? ' · due ${shortDate(fee.dueOn)}' : ''}', style: const TextStyle(color: KjaColors.soft)),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        value: progress.toDouble(),
                        minHeight: 8,
                        backgroundColor: KjaColors.line,
                        color: fee.hasDue ? KjaColors.coral : KjaColors.mint,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(child: Text('Invoiced ${moneyUgx(fee.amountDue)}', style: const TextStyle(fontSize: 12, color: KjaColors.soft))),
                        Text(
                          fee.hasDue ? 'Due ${moneyUgx(fee.balance)}' : 'Paid in full',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: fee.hasDue ? KjaColors.coralDeep : KjaColors.mintDeep,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          }),
        const SizedBox(height: 12),
        const SectionTitle(title: 'Receipts'),
        const SizedBox(height: 8),
        if (portal.receipts.isEmpty)
          const EmptyNote(icon: Icons.payments_rounded, message: 'No receipts yet.')
        else
          ...portal.receipts.take(20).map((receipt) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SoftCard(
                child: Row(
                  children: [
                    ToneIcon(icon: Icons.payments_rounded, tone: Tone.mint, size: 40, iconSize: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(receipt.receiptNo.isEmpty ? 'Receipt' : receipt.receiptNo, style: const TextStyle(fontWeight: FontWeight.w800)),
                          Text(
                            '${nameById[receipt.childId] ?? 'Child'} · ${shortDate(receipt.paidOn, withYear: true)} · ${receipt.method}',
                            style: const TextStyle(color: KjaColors.soft, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    Text(moneyUgx(receipt.amount), style: const TextStyle(fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}
