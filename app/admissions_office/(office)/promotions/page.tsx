import { PageHeader } from "@/components/admin/PageHeader";
import { PromotionWizard, type PromotionPupil } from "@/components/office/PromotionWizard";
import { MigrationHint, OfficeNotice } from "@/components/office/ui";
import { formatDateTime } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { fetchAll } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import type { PromotionRow } from "./actions";

export const metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Promotions" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Promotions" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase } = auth;

  const [preview, lastRun] = await Promise.all([
    supabase.rpc("promote_students", { p_exclude: [], p_dry_run: true }),
    supabase.from("student_activity").select("created_at").eq("kind", "promotion").order("created_at", { ascending: false }).limit(1),
  ]);
  if (preview.error) {
    return (
      <OfficeNotice title="Promotions" icon="fa-database" heading="Promotions aren't set up yet">
        <MigrationHint message={preview.error.message} />
      </OfficeNotice>
    );
  }
  let pupils: PromotionPupil[];
  try {
    pupils = await fetchAll<PromotionPupil>((from, to) =>
      supabase.from("students").select("id, full_name, class_code, stream, student_number").eq("status", "active").order("full_name").range(from, to));
  } catch (error) {
    return <OfficeNotice title="Promotions" heading="Pupils could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }
  const last = lastRun.data?.[0]?.created_at as string | undefined;
  const ranThisYear = last ? new Date(last).getFullYear() === new Date().getFullYear() : false;

  return (
    <div className="app-page ofc-page ofc-narrow">
      <PageHeader
        kicker="Year end"
        icon="fa-stairs"
        title="Promote to the next class"
        description="Move the whole school up a class at the end of the year, keep back any repeaters, and graduate Primary Seven."
      />
      {last ? (
        <div className={`ofc-banner${ranThisYear ? " is-warn" : ""}`}>
          <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
          <p>
            The last promotion ran on <strong>{formatDateTime(last)}</strong>.
            {ranThisYear ? " That was this year: check you aren't promoting the same pupils twice." : ""}
          </p>
        </div>
      ) : null}
      <PromotionWizard pupils={pupils} initial={(preview.data || []) as PromotionRow[]} />
    </div>
  );
}
