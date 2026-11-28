import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { StreamReportBar } from "@/components/academics/StreamReportBar";
import { ReportQrMark, buildReportQrSvg } from "@/components/academics/ReportQr";
import { ReportSheet, reportPortraitFromBytes } from "@/components/academics/ReportSheet";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { ACADEMICS_BASE, classLabel, classSection, loadCurrentTerm, streamFromQuery, streamQuery } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadReportSittings } from "@/lib/academics-reports";
import { loadReportCardPhotos, loadStreamReportCards } from "@/lib/report-cards-pdf";
import { reportOnlineUrl } from "@/lib/report-link";
import { isCampusId } from "@/lib/campuses";
import { isClassCode } from "@/lib/students";

export const metadata = { title: "Report cards" };

export default async function ReportPreviewPage({ searchParams }: { searchParams: Promise<{ class?: string; stream?: string; campus?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report cards" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Report cards" />;
  const classCode = query.class || "";
  const stream = streamFromQuery(query.stream);
  const campus = query.campus;
  if (!isClassCode(classCode) || stream === null || (campus !== undefined && !isCampusId(campus))) {
    return (
      <div className="app-page ofc-page rpt-page">
        <PageHeader kicker="Assessment" icon="fa-file-lines" title="Report cards" description="Choose a class to preview its report cards." actions={<Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/reports`}><i className="fa-solid fa-table-cells" aria-hidden="true" /> All classes</Link>} />
        <Empty title="Choose a class" />
      </div>
    );
  }
  if (campus && opened.auth.campuses.length && !opened.auth.campuses.includes(campus)) {
    return <AcademicsGate title="Report cards" state={{ notice: "auth", message: "You can only preview report cards for an assigned campus." }} />;
  }
  const { supabase } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Report cards" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  if (!term) {
    return (
      <div className="app-page ofc-page rpt-page">
        <PageHeader kicker="Assessment" icon="fa-file-lines" title={classLabel(classCode, stream, campus)} description="Report cards need a current term." />
        <Empty title="No current term" />
      </div>
    );
  }
  let cards;
  let sittings;
  try {
    [cards, sittings] = await Promise.all([
      loadStreamReportCards(supabase, { termId: term.id, classCode, stream, termLabel: term.label, campus }),
      loadReportSittings(supabase, { termId: term.id, classCode, stream, campus }),
    ]);
  } catch (error) {
    return <AcademicsGate title="Report cards" state={{ notice: "schema", message: error instanceof Error ? error.message : "Report cards could not be loaded." }} />;
  }
  const nursery = classSection(classCode) === "nursery";
  const drafts = cards.filter((card) => card.status === "draft").length;
  const back = `${ACADEMICS_BASE}/reports?class=${encodeURIComponent(classCode)}&stream=${encodeURIComponent(streamQuery(stream))}${campus ? `&campus=${encodeURIComponent(campus)}&classCampus=${encodeURIComponent(campus)}` : ""}`;
  const [photos, qrRows] = await Promise.all([
    loadReportCardPhotos(cards),
    Promise.all(cards.map(async (card) => {
      const href = reportOnlineUrl(card.id);
      return [card.id, { href, svg: await buildReportQrSvg(href) }] as const;
    })),
  ]);
  const qrById = new Map(qrRows);

  return (
    <div className="app-page ofc-page rpt-page rpt-preview-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-file-lines"
        title={classLabel(classCode, stream, campus)}
        description={<>{term.label} · <strong>{cards.length.toLocaleString("en-GB")}</strong> {cards.length === 1 ? "report card" : "report cards"}.</>}
        actions={<Link className="admin-hero-btn" href={back}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Back to class</Link>}
      />
      <section className="rpt-card" aria-label={`${classLabel(classCode, stream, campus)} report cards`}>
        <StreamReportBar
          className="rpt-actions rpt-preview-bar"
          termId={term.id}
          classCode={classCode}
          stream={stream}
          campus={campus}
          drafts={drafts}
          cards={cards.length}
          sittings={sittings}
          reportTitle={cards.find((card) => card.report_title)?.report_title}
          pdfHref={`${ACADEMICS_BASE}/reports/pdf?class=${encodeURIComponent(classCode)}&stream=${encodeURIComponent(streamQuery(stream))}${campus ? `&campus=${encodeURIComponent(campus)}` : ""}`}
        />
        {cards.length ? (
          <div className="rpt-preview">
            {cards.map((card) => {
              const qr = qrById.get(card.id);
              return (
                <ReportSheet
                  key={card.id}
                  nursery={nursery}
                  card={{ ...card, href: `${ACADEMICS_BASE}/reports/${card.id}` }}
                  portrait={reportPortraitFromBytes(photos.get(card.id), card.pupil_name)}
                  qr={qr ? <ReportQrMark href={qr.href} svg={qr.svg} /> : null}
                />
              );
            })}
          </div>
        ) : <Empty icon="fa-file-lines" title="No report cards yet">Generate this stream to preview every card.</Empty>}
      </section>
    </div>
  );
}
