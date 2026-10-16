import { Overview } from "@/components/academics/Overview";
import { AcademicsGate } from "@/components/academics/ui";
import { openAcademics } from "@/lib/academics";

export const metadata = { title: "Overview" };

export default async function AcademicsHome() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Overview" state={opened} />;
  return <Overview {...opened.auth} />;
}
