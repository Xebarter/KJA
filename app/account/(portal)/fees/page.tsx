import { FeesView } from "@/components/account/FeesView";
import { getPortal } from "@/lib/portal";

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const [{ children, pupils, fees, receipts }, { child }] = await Promise.all([getPortal(), searchParams]);
  return <FeesView kids={pupils.length ? pupils : children} fees={fees} receipts={receipts} childId={child} />;
}
