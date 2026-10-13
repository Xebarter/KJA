import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PromotionWizard, type PromotionPupil } from "@/components/office/PromotionWizard";
import { MigrationHint, OfficeNotice } from "@/components/office/ui";
import { formatDateTime } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { OFFICE, fetchAll } from "@/lib/students";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import type { PromotionRow } from "./actions";

export const metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  const supabase = await createClient();
  if (!supabase || !supabaseConfigured()) {
    return <OfficeNotice title="Promotions" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }

  // The dry run, the pupil list and the last run load alongside the access check.
  const [auth, preview, lastRun, loaded] = await Promise.all([
    requireOffice(),
    supabase.rpc("promote_students", { p_exclude: [], p_dry_run: true }),
    supabase.from("student_activity").select("created_at").eq("kind", "promotion").order("created_at", { ascending: false }).limit(1),
    fetchAll<PromotionPupil>((from, to) =>
      supabase.from("students").select("id, full_name, class_code, stream, student_number").eq("status", "active").order("full_name").range(from, to))
      .then((data) => ({ data }), (error: Error) => ({ error })),
  ]);
  if ("error" in auth) return <OfficeNotice title="Promotions" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  if (preview.error) {
    return (
      <OfficeNotice title="Promotions" icon="fa-database" heading="Promotions aren't set up yet">
        <MigrationHint message={preview.error.message} />
      </OfficeNotice>
    );
  }
  if ("error" in loaded) return <OfficeNotice title="Promotions" heading="Pupils could not be loaded"><MigrationHint message={loaded.error.message} /></OfficeNotice>;

  const pupils = loaded.data;
  const last = lastRun.data?.[0]?.created_at as string | undefined;
  const ranThisYear = last ? new Date(last).getFullYear() === new Date().getFullYear() : false;

  return (
    <div className="app-page ofc-page opr-page">
      <PageHeader
        kicker="Year end"
        icon="fa-stairs"
        title="Year-end promotion"
        description="Move the whole school up a class, keep back any repeaters, and graduate Primary Seven, in three short steps."
        actions={
          <>
            <Link className="admin-hero-btn" href={`${OFFICE}/classes`}><i className="fa-solid fa-chalkboard" aria-hidden="true" /> Classes</Link>
            <Link className="admin-hero-btn" href={`${OFFICE}/reports#leavers`}><i className="fa-solid fa-chart-column" aria-hidden="true" /> Reports</Link>
          </>
        }
      />

      {last ? (
        <div className={`ofc-banner opr-last${ranThisYear ? " is-warn" : ""}`}>
          <i className={`fa-solid ${ranThisYear ? "fa-triangle-exclamation" : "fa-clock-rotate-left"}`} aria-hidden="true" />
          <p>
            {ranThisYear ? <strong>A promotion already ran this year. </strong> : null}
            The last one was on <strong>{formatDateTime(last)}</strong>.
            {ranThisYear ? " Check you aren't moving the same pupils up twice." : ""}
          </p>
        </div>
      ) : null}

      <PromotionWizard
        pupils={pupils}
        initial={(preview.data || []) as PromotionRow[]}
        unplaced={pupils.filter((pupil) => !pupil.class_code).length}
      />
    </div>
  );
}
