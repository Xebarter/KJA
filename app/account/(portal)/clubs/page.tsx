import { ActionForm } from "@/components/account/ActionForm";
import { cancelClubSignup, signupClub } from "@/app/account/actions";
import { getPortal } from "@/lib/portal";

export default async function ClubsPage() {
  const { children, clubs, signups } = await getPortal();
  const childName = (id: string) => children.find((child) => child.id === id)?.full_name || "Child";
  const clubName = (id: string) => clubs.find((club) => club.id === id)?.title || "Club";
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>Clubs</h1>
          <p>Sign a child up for co-curricular activities. Places are confirmed by the school.</p>
        </div>
      </div>
      <div className="account-card" style={{ marginBottom: "1rem" }}>
        <h2>Your sign-ups</h2>
        {signups.length ? (
          <table className="account-table">
            <tbody>
              {signups.map((row) => (
                <tr key={row.id}>
                  <td>{childName(row.child_id)}</td>
                  <td>{clubName(row.club_id)}</td>
                  <td><span className="account-badge">{row.status}</span></td>
                  <td>
                    <ActionForm action={cancelClubSignup}>
                      <input type="hidden" name="id" value={row.id} />
                      <button className="account-btn account-btn-ghost" type="submit">Cancel</button>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="account-empty">No club sign-ups yet.</p>
        )}
      </div>
      <div className="account-grid">
        {clubs.map((club) => (
          <article className="account-card" key={club.id}>
            <h2>{club.title}</h2>
            <p>{club.campus}{club.meeting ? ` · ${club.meeting}` : ""}</p>
            <p>{club.description}</p>
            {children.length ? (
              <ActionForm action={signupClub} success="Request sent.">
                <input type="hidden" name="club_id" value={club.id} />
                <label>Child
                  <select name="child_id" required>
                    {children.map((child) => <option key={child.id} value={child.id}>{child.full_name}</option>)}
                  </select>
                </label>
                <button className="account-btn" type="submit">Sign up</button>
              </ActionForm>
            ) : (
              <p>Add a child first to sign up.</p>
            )}
          </article>
        ))}
        {!clubs.length ? <div className="account-card account-empty">Clubs will appear here once the school publishes them.</div> : null}
      </div>
    </div>
  );
}
