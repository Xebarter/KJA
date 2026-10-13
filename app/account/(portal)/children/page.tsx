import { ChildrenView } from "@/components/account/ChildrenView";
import { getPortal } from "@/lib/portal";

export default async function ChildrenPage() {
  const { children, reports, fees, signups } = await getPortal();
  return <ChildrenView kids={children} reports={reports} fees={fees} signups={signups} />;
}
