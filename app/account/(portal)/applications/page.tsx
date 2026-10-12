import { ActionForm } from "@/components/account/ActionForm";
import { submitParentApplication } from "@/app/account/actions";
import { getPortal } from "@/lib/portal";

export default async function ApplicationsPage() {
  const { applications } = await getPortal();
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>Applications</h1>
          <p>Track enrolment applications and submit a new one for another child.</p>
        </div>
      </div>
      <div className="account-card" style={{ marginBottom: "1rem" }}>
        {applications.length ? (
          <table className="account-table">
            <thead><tr><th>Child</th><th>Campus / class</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>
              {applications.map((row) => (
                <tr key={row.id}>
                  <td>{row.child_name}</td>
                  <td>{[row.campus, row.grade].filter(Boolean).join(" · ") || "—"}</td>
                  <td><span className="account-badge">{row.status || "received"}</span></td>
                  <td>{row.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="account-empty">You have not submitted an application from this account yet.</p>
        )}
      </div>
      <div className="account-card">
        <h2>New application</h2>
        <ActionForm action={submitParentApplication} success="Application sent.">
          <label>Child&apos;s name<input name="child_name" required /></label>
          <label>Campus<input name="campus" placeholder="Kitante, Bunga…" /></label>
          <label>Class / grade<input name="grade" /></label>
          <label>Phone<input name="phone" /></label>
          <label>Message<textarea name="message" rows={4} /></label>
          <button className="account-btn" type="submit">Submit application</button>
        </ActionForm>
      </div>
    </div>
  );
}
