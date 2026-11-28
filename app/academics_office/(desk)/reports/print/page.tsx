import { ReportSheet, reportPortraitFromBytes } from "@/components/academics/ReportSheet";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { classLabel, classSection, loadCurrentTerm, streamFromQuery } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadReportCardPhotos, loadStreamReportCards } from "@/lib/report-cards-pdf";
import { isCampusId } from "@/lib/campuses";
import { isClassCode } from "@/lib/students";

export const metadata = { title: "Print report cards" };

/** Bare stack of ReportSheets - same print CSS as /reports/[id]. Used for Download PDF. */
export default async function ReportPrintPackPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; stream?: string; campus?: string }>;
}) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report cards" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Report cards" />;
  const classCode = query.class || "";
  const stream = streamFromQuery(query.stream);
  const campus = query.campus;
  if (!isClassCode(classCode) || stream === null || (campus !== undefined && !isCampusId(campus))) {
    return (
      <div className="app-page ofc-page rpt-page rpt-print-pack">
        <Empty title="Choose a class" />
      </div>
    );
  }
  if (campus && opened.auth.campuses.length && !opened.auth.campuses.includes(campus)) {
    return <AcademicsGate title="Report cards" state={{ notice: "auth", message: "You can only print report cards for an assigned campus." }} />;
  }
  const { supabase } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Report cards" state={{ notice: "schema", message: termPack.error }} />;
  if (!termPack.term) {
    return (
      <div className="app-page ofc-page rpt-page rpt-print-pack">
        <Empty title="No current term" />
      </div>
    );
  }
  let cards;
  try {
    cards = await loadStreamReportCards(supabase, {
      termId: termPack.term.id,
      classCode,
      stream,
      termLabel: termPack.term.label,
      campus,
    });
  } catch (error) {
    return (
      <AcademicsGate
        title="Report cards"
        state={{ notice: "schema", message: error instanceof Error ? error.message : "Report cards could not be loaded." }}
      />
    );
  }
  if (!cards.length) {
    return (
      <div className="app-page ofc-page rpt-page rpt-print-pack">
        <Empty title="No report cards yet" />
      </div>
    );
  }
  const nursery = classSection(classCode) === "nursery";
  const photos = await loadReportCardPhotos(cards);

  return (
    <div className="app-page ofc-page rpt-page rpt-print-pack" data-report-print-pack="1">
      <p className="acd-noprint rpt-print-hint">
        {classLabel(classCode, stream)} · {termPack.term.label} · {cards.length}{" "}
        {cards.length === 1 ? "card" : "cards"}. Use your browser’s print dialog and choose{" "}
        <strong>Save as PDF</strong> if a file was not downloaded automatically.
      </p>
      <div className="rpt-print-sheets">
        {cards.map((card) => (
          <ReportSheet
            key={card.id}
            nursery={nursery}
            card={card}
            portrait={reportPortraitFromBytes(photos.get(card.id), card.pupil_name)}
          />
        ))}
      </div>
    </div>
  );
}
