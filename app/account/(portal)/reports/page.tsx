import { getPortal } from "@/lib/portal";

export default async function ReportsPage() {
  const { children, reports } = await getPortal();
  const nameFor = (id: string) => children.find((child) => child.id === id)?.full_name || "Child";
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>Reports</h1>
          <p>Termly and progress reports published for your children.</p>
        </div>
      </div>
      <div className="account-card">
        {reports.length ? (
          <table className="account-table">
            <thead><tr><th>Child</th><th>Report</th><th>Term</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{nameFor(report.child_id)}</td>
                  <td>
                    <strong>{report.title}</strong>
                    {report.summary ? <div>{report.summary}</div> : null}
                  </td>
                  <td>{report.term}</td>
                  <td>{report.issued_on}</td>
                  <td>{report.file_url ? <a href={report.file_url} target="_blank" rel="noreferrer">Download</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="account-empty">Reports will appear here when the school publishes them.</p>
        )}
      </div>
    </div>
  );
}
