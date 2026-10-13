import { FeesView } from "@/components/account/FeesView";
import { getPortal } from "@/lib/portal";

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const [{ children, fees }, { child }] = await Promise.all([getPortal(), searchParams]);
  return <FeesView kids={children} fees={fees} childId={child} />;
}
