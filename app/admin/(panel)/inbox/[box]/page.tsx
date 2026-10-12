import { notFound } from "next/navigation";
import { markInquiry, removeInquiry } from "@/app/actions";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

const boxes = {
  applications: { table: "applications" as const, title: "Applications", intro: "Admission enquiries submitted from the public site." },
  messages: { table: "contact_messages" as const, title: "Messages", intro: "Contact form and alumni story submissions." },
  newsletter: { table: "newsletter_subscribers" as const, title: "Newsletter", intro: "People who asked to receive school updates." },
};

export default async function InboxPage({ params }: { params: Promise<{ box: string }> }) {
  const { box } = await params;
  const config = boxes[box as keyof typeof boxes];
  if (!config) notFound();
  if (!supabaseConfigured()) {
    return (
      <div className="admin-card">
        <h1>{config.title}</h1>
        <p>Connect Supabase to store and read form submissions.</p>
      </div>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase!.from(config.table).select("*").order("created_at", { ascending: false });
  const rows = data || [];
  return (
    <div>
      <div className="admin-page-title">
        <div>
          <h1>{config.title}</h1>
          <p>{config.intro}</p>
        </div>
      </div>
      <div className="admin-card">
        <table className="admin-table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.parent_name || row.name || row.email}</strong>
                  {row.email && row.parent_name ? <div>{row.email}</div> : null}
                  {row.child_name ? <div>Child: {row.child_name}</div> : null}
                  {row.campus ? <div>Campus: {row.campus}</div> : null}
                  {row.grade ? <div>Class: {row.grade}</div> : null}
                  {row.subject ? <div>{row.subject}</div> : null}
                  {row.message ? <p>{row.message}</p> : null}
                  {row.read === false ? <em>Unread</em> : null}
                </td>
                <td>
                  {config.table !== "newsletter_subscribers" && row.read === false ? (
                    <form action={markInquiry}>
                      <input type="hidden" name="table" value={config.table} />
                      <input type="hidden" name="id" value={row.id} />
                      <button className="admin-btn admin-btn-ghost" type="submit">Mark read</button>
                    </form>
                  ) : null}
                  <form action={removeInquiry}>
                    <input type="hidden" name="table" value={config.table} />
                    <input type="hidden" name="id" value={row.id} />
                    <button className="admin-btn" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="admin-empty">Nothing here yet.</p> : null}
      </div>
    </div>
  );
}
