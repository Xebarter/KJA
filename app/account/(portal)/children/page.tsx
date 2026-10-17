import { ChildrenView } from "@/components/account/ChildrenView";
import { getPortal } from "@/lib/portal";

export default async function ChildrenPage() {
  const { pupils, reports, cards, fees, signups } = await getPortal();
  return <ChildrenView kids={pupils} reports={reports} cards={cards} fees={fees} signups={signups} />;
}
