import { ReportSheet } from "@/components/academics/ReportSheet";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { classLabel, classSection, loadCurrentTerm, openAcademics, streamFromQuery } from "@/lib/academics";
import { loadReportCardPhotos, loadStreamReportCards } from "@/lib/report-cards-pdf";
import { isClassCode } from "@/lib/students";

export const metadata = { title: "Print report cards" };

function portraitFromBytes(bytes: Uint8Array | undefined) {
  if (!bytes?.length) return undefined;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  const type = png ? "image/png" : "image/jpeg";
  const src = `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  return <img className="acd-sheet-face" src={src} alt="" />;
}

/** Bare stack of ReportSheets — same print CSS as /reports/[id]. Used for Download PDF. */
export default async function ReportPrintPackPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; stream?: string }>;
}) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report cards" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Report cards" />;
  const classCode = query.class || "";
  const stream = streamFromQuery(query.stream);
  if (!isClassCode(classCode) || stream === null) {
    return (
      <div className="app-page ofc-page rpt-page rpt-print-pack">
        <Empty title="Choose a class" />
      </div>
    );
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
            portrait={portraitFromBytes(photos.get(card.id))}
          />
        ))}
      </div>
    </div>
  );
}
