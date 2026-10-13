import { AdminShell } from "@/components/admin/Shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { count } = supabase
    ? await supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "received")
    : { count: 0 };
  return <AdminShell newApplications={count ?? 0}>{children}</AdminShell>;
}
