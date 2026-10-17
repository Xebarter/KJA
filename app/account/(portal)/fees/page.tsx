import { FeesView } from "@/components/account/FeesView";
import { paymentsConfigured } from "@/lib/payments/gateway";
import { getPortal } from "@/lib/portal";

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const [{ children, pupils, fees, receipts, profile }, { child }] = await Promise.all([getPortal(), searchParams]);
  return (
    <FeesView
      kids={pupils.length ? pupils : children}
      fees={fees}
      receipts={receipts}
      childId={child}
      payerPhone={profile?.phone || ""}
      online={paymentsConfigured()}
    />
  );
}
