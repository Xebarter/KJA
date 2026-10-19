import { cancelReportPreparation, postReports, prepareReports, reopenReports } from "@/app/academics_office/(desk)/actions";
import { CancelPreparation } from "@/components/academics/CancelPreparation";
import { DeskForm } from "@/components/academics/Form";
import { ACADEMICS_BASE, streamQuery } from "@/lib/academics";

export function StreamReportBar({
  termId,
  classCode,
  stream,
  drafts,
  cards,
  className = "rpt-actions",
}: {
  termId: string;
  classCode: string;
  stream: string;
  drafts: number;
  cards: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <DeskForm action={prepareReports}>
        <input type="hidden" name="term_id" value={termId} />
        <input type="hidden" name="class_code" value={classCode} />
        <input type="hidden" name="stream" value={stream} />
        <button className="rpt-btn" type="submit">Generate</button>
      </DeskForm>
      <DeskForm action={postReports}>
        <input type="hidden" name="term_id" value={termId} />
        <input type="hidden" name="class_code" value={classCode} />
        <input type="hidden" name="stream" value={stream} />
        <button className="rpt-btn is-gold" type="submit">Post</button>
      </DeskForm>
      {cards ? <a className="rpt-btn is-ghost" href={`${ACADEMICS_BASE}/reports/pdf?class=${classCode}&stream=${streamQuery(stream)}`}>Download PDF</a> : null}
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
