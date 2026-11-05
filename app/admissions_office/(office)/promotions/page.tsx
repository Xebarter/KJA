import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PromotionWizard, type PromotionPupil } from "@/components/office/PromotionWizard";
import { LoadErrorNotice, OfficeNotice } from "@/components/office/ui";
import { formatDateTime } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { promotionSeason, seasonMessage, type FeeTermLite } from "@/lib/promotions";
import { OFFICE, fetchAll } from "@/lib/students";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import type { PromotionRow } from "./actions";
import "./promotions.css";

export const metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  const supabase = await createClient();
  if (!supabase || !supabaseConfigured()) {
    return <OfficeNotice title="Promotions" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }

  const [auth, preview, lastRun, termQuery, loaded] = await Promise.all([
    requireOffice(),
    supabase.rpc("promote_students", { p_exclude: [], p_dry_run: true }),
    supabase.from("student_activity").select("created_at").eq("kind", "promotion").order("created_at", { ascending: false }).limit(1),
    supabase.from("fee_terms").select("year, term, label, starts_on, is_current").eq("is_current", true).maybeSingle(),
    fetchAll<PromotionPupil>((from, to) =>
      supabase.from("students").select("id, full_name, class_code, stream, student_number").eq("status", "active").order("full_name").range(from, to))
      .then((data) => ({ data }), (error: Error) => ({ error })),
  ]);
  if ("error" in auth) return <OfficeNotice title="Promotions" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  if (preview.error) {
    return <LoadErrorNotice title="Promotions" message={preview.error.message} fallbackHeading="Promotions aren't set up yet" />;
  }
  if ("error" in loaded) return <LoadErrorNotice title="Promotions" message={loaded.error.message} fallbackHeading="Pupils could not be loaded" />;

  const pupils = loaded.data;
  const last = lastRun.data?.[0]?.created_at as string | undefined;
  const season = promotionSeason((termQuery.data as FeeTermLite | null) ?? null, last);
  const message = seasonMessage(season);

  return (
    <div className="app-page ofc-page opr-page">
      <PageHeader
        kicker="Year end"
        icon="fa-stairs"
        title="New-year promotion"
        description="At the start of the academic year every learner moves up automatically. Choose who should repeat, then confirm once."
        actions={
          <>
            <Link className="admin-hero-btn" href={`${OFFICE}/classes`}><i className="fa-solid fa-chalkboard" aria-hidden="true" /> Classes</Link>
            <Link className="admin-hero-btn" href={`${OFFICE}/reports#leavers`}><i className="fa-solid fa-chart-column" aria-hidden="true" /> Reports</Link>
          </>
        }
      />

      <div className={`ofc-banner opr-season is-${message.tone}`}>
        <i className={`fa-solid ${season.status === "done" ? "fa-circle-check" : season.status === "open" ? "fa-seedling" : "fa-calendar-day"}`} aria-hidden="true" />
        <div>
          <strong>{message.title}</strong>
          <p>
            {message.body}
            {last ? <> Last run: <strong>{formatDateTime(last)}</strong>.</> : null}
            {season.termLabel ? <> Current term: <strong>{season.termLabel}</strong>.</> : null}
          </p>
        </div>
      </div>

      <PromotionWizard
        pupils={pupils}
        initial={(preview.data || []) as PromotionRow[]}
        unplaced={pupils.filter((pupil) => !pupil.class_code).length}
        season={season}
      />
    </div>
  );
}
