import { ChargesView } from "@/components/account/ChargesView";
import { paymentsConfigured } from "@/lib/payments/gateway";
import { getPortal } from "@/lib/portal";
import { serviceClient } from "@/lib/supabase/service";

export const metadata = { title: "Other payments" };

export default async function ChargesPage() {
  const portal = await getPortal();
  const kids = (portal.pupils.length ? portal.pupils : portal.children).map((kid) => ({
    id: kid.id,
    full_name: kid.full_name,
    class_code: "class_code" in kid ? kid.class_code ?? null : kid.grade,
    campus: kid.campus,
  }));

  const db = serviceClient();
  const { data } = db
    ? await db
        .from("charge_products")
        .select("id, name, kind, default_amount, description")
        .eq("active", true)
        .eq("online_eligible", true)
        .order("sort_order")
        .order("name")
    : { data: [] as { id: string; name: string; kind: string; default_amount: number; description: string | null }[] };

  return (
    <ChargesView
      kids={kids}
      products={(data || []).map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        default_amount: Number(row.default_amount) || 0,
        description: row.description,
      }))}
      payerPhone={portal.profile?.phone || ""}
      online={paymentsConfigured()}
    />
  );
}
