import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { StreamReportBar } from "@/components/academics/StreamReportBar";
import { ReportSheet } from "@/components/academics/ReportSheet";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { ACADEMICS_BASE, classLabel, classSection, loadCurrentTerm, openAcademics, streamFromQuery, streamQuery } from "@/lib/academics";
import { loadStreamReportCards } from "@/lib/report-cards-pdf";
import { isClassCode } from "@/lib/students";

export const metadata = { title: "Report cards" };

export default async function ReportPreviewPage({ searchParams }: { searchParams: Promise<{ class?: string; stream?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report cards" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Report cards" />;
  const classCode = query.class || "";
  const stream = streamFromQuery(query.stream);
  if (!isClassCode(classCode) || stream === null) {
    return (
      <div className="app-page ofc-page rpt-page">
        <PageHeader kicker="Assessment" icon="fa-file-lines" title="Report cards" description="Choose a class to preview its report cards." actions={<Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/reports`}><i className="fa-solid fa-table-cells" aria-hidden="true" /> All classes</Link>} />
        <Empty title="Choose a class" />
      </div>
    );
  }
  const { supabase } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Report cards" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  if (!term) {
    return (
      <div className="app-page ofc-page rpt-page">
        <PageHeader kicker="Assessment" icon="fa-file-lines" title={classLabel(classCode, stream)} description="Report cards need a current term." />
        <Empty title="No current term" />
      </div>
    );
  }
  let cards;
  try {
    cards = await loadStreamReportCards(supabase, { termId: term.id, classCode, stream, termLabel: term.label });
  } catch (error) {
    return <AcademicsGate title="Report cards" state={{ notice: "schema", message: error instanceof Error ? error.message : "Report cards could not be loaded." }} />;
  }
  const nursery = classSection(classCode) === "nursery";
  const drafts = cards.filter((card) => card.status === "draft").length;
  const back = `${ACADEMICS_BASE}/reports?class=${classCode}&stream=${streamQuery(stream)}`;

  return (
    <div className="app-page ofc-page rpt-page rpt-preview-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-file-lines"
        title={classLabel(classCode, stream)}
        description={<>{term.label} · <strong>{cards.length.toLocaleString("en-GB")}</strong> {cards.length === 1 ? "report card" : "report cards"}.</>}
        actions={<Link className="admin-hero-btn" href={back}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Back to class</Link>}
      />
      <section className="rpt-card" aria-label={`${classLabel(classCode, stream)} report cards`}>
        <StreamReportBar className="rpt-actions rpt-preview-bar" termId={term.id} classCode={classCode} stream={stream} drafts={drafts} cards={cards.length} />
        {cards.length ? (
          <div className="rpt-preview">
            {cards.map((card) => (
              <ReportSheet key={card.id} nursery={nursery} card={{ ...card, href: `${ACADEMICS_BASE}/reports/${card.id}` }} />
            ))}
          </div>
        ) : <Empty icon="fa-file-lines" title="No report cards yet">Generate this stream to preview every card.</Empty>}
      </section>
    </div>
  );
}
