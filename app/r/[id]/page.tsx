import { Suspense } from "react";
import { notFound } from "next/navigation";
import { OnlineReport } from "@/components/academics/OnlineReport";
import { OnlineReportShell } from "@/components/academics/OnlineReportShell";
import {
  AttendancePanel,
  ClubsPanel,
  LibraryPanel,
  OtherSubjectsPanel,
  PointsPanel,
  ProgressPanel,
  TermsPanel,
} from "@/components/academics/online-report/panels";
import { loadOnlineReportBundle, parseOnlineReportTab } from "@/lib/online-report";
import { isUuid } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Report card", robots: { index: false, follow: false } };
  const supabase = serviceClient();
  if (!supabase) return { title: "Report card", robots: { index: false, follow: false } };
  const { data } = await supabase
    .from("report_cards")
    .select("fee_terms(label), students(full_name)")
    .eq("id", id)
    .maybeSingle();
  const term = data?.fee_terms as { label?: string } | { label?: string }[] | null;
  const student = data?.students as { full_name?: string } | { full_name?: string }[] | null;
  const termLabel = Array.isArray(term) ? term[0]?.label : term?.label;
  const name = Array.isArray(student) ? student[0]?.full_name : student?.full_name;
  return {
    title: name ? `${name}${termLabel ? ` · ${termLabel}` : ""} report` : "Report card",
    robots: { index: false, follow: false },
  };
}

export default async function OnlineReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!isUuid(id)) notFound();
  const supabase = serviceClient();
  if (!supabase) notFound();
  const bundle = await loadOnlineReportBundle(supabase, id);
  if (!bundle) notFound();

  const initialTab = parseOnlineReportTab(query.tab);
  const portrait = bundle.portraitSrc ? <img src={bundle.portraitSrc} alt="" /> : undefined;

  const panels = {
    report: <OnlineReport card={bundle.sheet} nursery={bundle.nursery} portrait={portrait} embedded />,
    progress: <ProgressPanel sets={bundle.progress.sets} subjects={bundle.progress.subjects} />,
    terms: <TermsPanel terms={bundle.terms} />,
    points: <PointsPanel points={bundle.points} />,
    other: <OtherSubjectsPanel subjects={bundle.other} />,
    library: <LibraryPanel books={bundle.library} />,
    attendance: <AttendancePanel attendance={bundle.attendance} />,
    clubs: <ClubsPanel clubs={bundle.clubs} />,
  };

  return (
    <Suspense fallback={<div className="kor"><p className="kor-empty">Loading report…</p></div>}>
      <OnlineReportShell
        pupilName={bundle.pupilName}
        termLabel={bundle.termLabel}
        classLabel={bundle.classLabel}
        initialTab={initialTab}
        panels={panels}
      />
    </Suspense>
  );
}
