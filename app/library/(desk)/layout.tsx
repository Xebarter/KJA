import { LibraryShell } from "@/components/library/Shell";
import { shellPages } from "@/lib/dashboard-access";
import { requireLibrary } from "@/lib/library-access";
import { LIBRARY_LABELS } from "@/lib/library-nav";
import { ROLE_LABELS } from "@/lib/office-nav";
import { schemaHint, todayKampala } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function LibraryDeskLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireLibrary();
  const badges = { overdue: 0, ready: 0, fines: 0 };
  let person = { name: "Library", email: "", role: "Library officer" };
  let libraries = Object.keys(LIBRARY_LABELS) as ("lower" | "upper")[];
  let activeLibrary: "lower" | "upper" = "lower";
  let pages: string[] | null = null;
  let canSwitch = false;
  let home = "/library";

  if (!("error" in auth)) {
    const email = auth.user.email ?? "";
    person = {
      name: auth.profile.full_name?.trim() || email || person.name,
      email,
      role: ROLE_LABELS[auth.profile.role ?? ""] ?? (auth.profile.role === "library" ? "Librarian" : person.role),
    };
    libraries = auth.libraries;
    activeLibrary = auth.activeLibrary;
    const shell = shellPages(auth.grants, "library");
    pages = shell.pages;
    canSwitch = shell.canSwitch;
    home = shell.home;

    const today = todayKampala();
    const [overdue, ready, fines] = await Promise.all([
      auth.supabase
        .from("library_loans")
        .select("id", { count: "exact", head: true })
        .eq("library_id", activeLibrary)
        .is("returned_at", null)
        .lt("due_at", today),
      auth.supabase
        .from("library_reservations")
        .select("id", { count: "exact", head: true })
        .eq("library_id", activeLibrary)
        .eq("status", "ready"),
      auth.supabase
        .from("library_fines")
        .select("id", { count: "exact", head: true })
        .eq("library_id", activeLibrary)
        .is("paid_at", null)
        .is("waived_at", null),
    ]);
    if (!schemaHint(overdue.error?.message)) badges.overdue = overdue.count ?? 0;
    if (!schemaHint(ready.error?.message)) badges.ready = ready.count ?? 0;
    if (!schemaHint(fines.error?.message)) badges.fines = fines.count ?? 0;
  }

  return (
    <LibraryShell
      person={person}
      badges={badges}
      libraries={libraries}
      activeLibrary={activeLibrary}
      pages={pages}
      canSwitch={canSwitch}
      home={home}
    >
      {"error" in auth ? (
        <div className="app-page ofc-page lib-page">
          <div className="admin-card app-notice">
            <i className="fa-solid fa-lock" aria-hidden="true" />
            <div>
              <h2>Library</h2>
              <p>{auth.error}</p>
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </LibraryShell>
  );
}
