import { cancelReportPreparation, generateClassComments, postReports, reopenReports } from "@/app/academics_office/(desk)/actions";
import { CancelPreparation } from "@/components/academics/CancelPreparation";
import { DownloadReportPdfButton } from "@/components/academics/DownloadReportPdfButton";
import { DeskForm } from "@/components/academics/Form";
import { GenerateReportsDialog } from "@/components/academics/GenerateReportsDialog";
import type { ReportSitting } from "@/lib/academics-reports";

export function StreamReportBar({
  termId,
  classCode,
  stream,
  drafts,
  cards,
  sittings,
  reportTitle,
  className = "rpt-actions",
}: {
  termId: string;
  classCode: string;
  stream: string;
  drafts: number;
  cards: number;
  sittings: ReportSitting[];
  reportTitle?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <GenerateReportsDialog termId={termId} classCode={classCode} stream={stream} sittings={sittings} defaultTitle={reportTitle || undefined} />
      {drafts ? (
        <DeskForm action={generateClassComments}>
          <input type="hidden" name="term_id" value={termId} />
          <input type="hidden" name="class_code" value={classCode} />
          <input type="hidden" name="stream" value={stream} />
          <button className="rpt-btn is-ghost" type="submit" title="Rewrite remarks on every draft card from the comment bank">Regenerate comments</button>
        </DeskForm>
      ) : null}
      <DeskForm action={postReports}>
        <input type="hidden" name="term_id" value={termId} />
        <input type="hidden" name="class_code" value={classCode} />
        <input type="hidden" name="stream" value={stream} />
        <button className="rpt-btn is-gold" type="submit">Post</button>
      </DeskForm>
      {cards ? <DownloadReportPdfButton classCode={classCode} stream={stream} /> : null}
      <div className="rpt-actions-secondary">
        <DeskForm action={reopenReports}>
          <input type="hidden" name="term_id" value={termId} />
          <input type="hidden" name="class_code" value={classCode} />
          <input type="hidden" name="stream" value={stream} />
          <button className="rpt-btn is-ghost" type="submit">Return to draft</button>
        </DeskForm>
        <CancelPreparation action={cancelReportPreparation} termId={termId} classCode={classCode} stream={stream} count={drafts} />
      </div>
    </div>
  );
}
