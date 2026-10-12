import { getPortal } from "@/lib/portal";

export default async function FeesPage() {
  const { children, fees } = await getPortal();
  const nameFor = (id: string) => children.find((child) => child.id === id)?.full_name || "Child";
  const totalDue = fees.reduce((sum, row) => sum + Number(row.amount_due) - Number(row.amount_paid), 0);
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>School fees</h1>
          <p>Balances are updated by the school accounts office. Pay using the details on your invoice.</p>
        </div>
      </div>
      <div className="account-card">
        <p><strong>Outstanding: UGX {totalDue.toLocaleString()}</strong></p>
        {fees.length ? (
          <table className="account-table">
            <thead><tr><th>Child</th><th>Term</th><th>Due</th><th>Paid</th><th>Balance</th><th>Due date</th></tr></thead>
            <tbody>
              {fees.map((row) => {
                const balance = Number(row.amount_due) - Number(row.amount_paid);
                return (
                  <tr key={row.id}>
                    <td>{nameFor(row.child_id)}</td>
                    <td>{row.term}<div>{row.description}</div></td>
                    <td>{Number(row.amount_due).toLocaleString()}</td>
                    <td>{Number(row.amount_paid).toLocaleString()}</td>
                    <td>{balance.toLocaleString()}</td>
                    <td>{row.due_on || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="account-empty">No fee records are linked to your children yet.</p>
        )}
      </div>
    </div>
  );
}
