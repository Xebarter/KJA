import {
  cancelReportPreparation,
  generateClassComments,
  postReports,
  prepareReports,
  reopenReports,
} from "@/app/academics_office/(desk)/actions";
import { CancelPreparation } from "@/components/academics/CancelPreparation";
import { DownloadReportPdfButton } from "@/components/academics/DownloadReportPdfButton";
import { DeskForm } from "@/components/academics/Form";
import { GenerateReportsDialog } from "@/components/academics/GenerateReportsDialog";
import { ACADEMICS_BASE, streamQuery } from "@/lib/academics";
import type { ReportSitting } from "@/lib/academics-reports";

type ReportAction = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

export function StreamReportBar({
  termId,
  classCode,
  stream,
  drafts,
  cards,
  sittings,
  reportTitle,
  className = "rpt-actions",
  prepareAction = prepareReports,
  regenerateAction = generateClassComments,
  cancelAction = cancelReportPreparation,
  reopenAction = reopenReports,
  postAction = postReports,
  showPost = true,
  showRemarkTools = true,
  pdfHref,
}: {
  termId: string;
  classCode: string;
  stream: string;
  drafts: number;
  cards: number;
  sittings: ReportSitting[];
  reportTitle?: string | null;
  className?: string;
  prepareAction?: ReportAction;
  regenerateAction?: ReportAction;
  cancelAction?: ReportAction;
  reopenAction?: ReportAction;
  postAction?: ReportAction;
  showPost?: boolean;
  /** Regenerate comments / return to draft / cancel preparation. */
  showRemarkTools?: boolean;
  pdfHref?: string;
}) {
  const pdf =
    pdfHref ||
    `${ACADEMICS_BASE}/reports/pdf?class=${encodeURIComponent(classCode)}&stream=${encodeURIComponent(streamQuery(stream))}`;

  return (
    <div className={className}>
      <GenerateReportsDialog
        termId={termId}
        classCode={classCode}
        stream={stream}
        sittings={sittings}
        defaultTitle={reportTitle || undefined}
        prepareAction={prepareAction}
      />
      {showRemarkTools && drafts ? (
        <DeskForm action={regenerateAction}>
          <input type="hidden" name="term_id" value={termId} />
          <input type="hidden" name="class_code" value={classCode} />
          <input type="hidden" name="stream" value={stream} />
          <button className="rpt-btn is-ghost" type="submit" title="Rewrite remarks on every draft card from the comment bank">
            Regenerate comments
          </button>
        </DeskForm>
      ) : null}
      {showPost ? (
        <DeskForm action={postAction}>
          <input type="hidden" name="term_id" value={termId} />
          <input type="hidden" name="class_code" value={classCode} />
          <input type="hidden" name="stream" value={stream} />
          <button className="rpt-btn is-gold" type="submit">
            Post
          </button>
        </DeskForm>
      ) : null}
      {cards ? <DownloadReportPdfButton href={pdf} filename={`${classCode}-${stream || "class"}-report-cards.pdf`} /> : null}
      {showRemarkTools ? (
        <div className="rpt-actions-secondary">
          <DeskForm action={reopenAction}>
            <input type="hidden" name="term_id" value={termId} />
            <input type="hidden" name="class_code" value={classCode} />
            <input type="hidden" name="stream" value={stream} />
            <button className="rpt-btn is-ghost" type="submit">
              Return to draft
            </button>
          </DeskForm>
          <CancelPreparation action={cancelAction} termId={termId} classCode={classCode} stream={stream} count={drafts} />
        </div>
      ) : null}
    </div>
  );
}
