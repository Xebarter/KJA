import { StoreShell } from "@/components/store/Shell";
import { shellPages } from "@/lib/dashboard-access";
import { ROLE_LABELS } from "@/lib/office-nav";
import { remember } from "@/lib/remember";
import { schemaHint } from "@/lib/store";
import { requireStore } from "@/lib/store-access";

export const dynamic = "force-dynamic";

export default async function StoreDeskLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireStore();
  const badges = { low: 0, requisitions: 0 };
  let person = { name: "Store", email: "", role: "Store officer" };
  let pages: string[] | null = null;
  let canSwitch = false;
  let home = "/store";

  if (!("error" in auth)) {
    const email = auth.user.email ?? "";
    person = {
      name: auth.profile.full_name?.trim() || email || person.name,
      email,
      role: ROLE_LABELS[auth.profile.role ?? ""] ?? (auth.profile.role === "store" ? "Store officer" : person.role),
    };
    const shell = shellPages(auth.grants, "store");
    pages = shell.pages;
    canSwitch = shell.canSwitch;
    home = shell.home;

    const pack = await remember(`store-layout-badges:${auth.user.id}`, 20_000, async () => {
      const [low, reqs] = await Promise.all([
        auth.supabase.from("store_items").select("id, qty_on_hand, reorder_level").eq("active", true).limit(2000),
        auth.supabase
          .from("store_requisitions")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft"),
      ]);
      return {
        low: schemaHint(low.error?.message)
          ? 0
          : (low.data || []).filter((row) => Number(row.qty_on_hand) <= Number(row.reorder_level)).length,
        requisitions: schemaHint(reqs.error?.message) ? 0 : reqs.count ?? 0,
      };
    });
    badges.low = pack.low;
    badges.requisitions = pack.requisitions;
  }

  return (
    <StoreShell person={person} badges={badges} pages={pages} canSwitch={canSwitch} home={home}>
      {"error" in auth ? (
        <div className="app-page ofc-page store-page">
          <div className="admin-card app-notice">
            <i className="fa-solid fa-lock" aria-hidden="true" />
            <div>
              <h2>Store</h2>
              <p>{auth.error}</p>
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </StoreShell>
  );
}
