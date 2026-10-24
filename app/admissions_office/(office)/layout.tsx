import { OfficeShell } from "@/components/office/Shell";
import { loadShellAccess } from "@/lib/dashboard-guard";
import { EMPTY_OFFICE_BADGES } from "@/lib/office-badges";
import { createClient } from "@/lib/supabase/server";

/** Shell paints immediately; badges load client-side so soft nav is never blocked on badge queries. */
export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  let person = { name: "Admissions office", email: "", role: "Admissions officer" };
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (user) {
      const email = user.email ?? "";
      const metaName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
      person = {
        name: metaName || email || person.name,
        email,
        role: person.role,
      };
    }
  }
  const access = await loadShellAccess("admissions");
  return (
    <OfficeShell
      person={person}
      badges={EMPTY_OFFICE_BADGES}
      pages={access.known ? access.pages : null}
      canSwitch={access.canSwitch}
      home={access.home}
    >
      {children}
    </OfficeShell>
  );
}
