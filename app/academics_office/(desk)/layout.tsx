import { AcademicsShell } from "@/components/academics/Shell";
import { EMPTY_ACADEMICS_BADGES } from "@/lib/academics-nav";

/** Shell paints immediately. The signed-in name arrives with the badge request, so navigation does not wait on auth. */
export default function AcademicsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AcademicsShell
      person={{ name: "Academics office", email: "", role: "Academics officer" }}
      badges={EMPTY_ACADEMICS_BADGES}
      office
    >
      {children}
    </AcademicsShell>
  );
}
