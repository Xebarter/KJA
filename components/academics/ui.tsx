import { PageHeader } from "@/components/admin/PageHeader";
import { academicsSchemaScript } from "@/lib/academics-nav";

export function AcademicsNotice({
  title,
  icon = "fa-plug-circle-exclamation",
  heading,
  children,
  kicker = "Academics office",
  description = "Teaching, attendance, assessments and report cards.",
}: {
  title: string;
  icon?: string;
  heading: string;
  children: React.ReactNode;
  kicker?: string;
  description?: string;
}) {
  return (
    <div className="app-page">
      <PageHeader kicker={kicker} icon="fa-graduation-cap" title={title} description={description} />
      <div className="admin-card app-notice apl-notice">
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
        <div>
          <h2>{heading}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

export function AcademicsGate({ title, state }: { title: string; state: { notice: "config" | "auth" | "schema"; message?: string } }) {
  const teacherDesk = /teacher/i.test(title);
  const kicker = teacherDesk ? "Teacher desk" : "Academics office";
  const description = teacherDesk
    ? "Your classes, attendance, markbooks and homework."
    : "Teaching, attendance, assessments and report cards.";
  if (state.notice === "auth") {
    return (
      <AcademicsNotice title={title} icon="fa-lock" heading="Not available" kicker={kicker} description={description}>
        <p>{state.message}</p>
      </AcademicsNotice>
    );
  }
  if (state.notice === "schema") {
    const script = academicsSchemaScript(state.message);
    return (
      <AcademicsNotice title={title} heading={teacherDesk ? "Teacher desk is not set up yet" : "Academics office is not set up yet"} kicker={kicker} description={description}>
        <p>{state.message}</p>
        <p>Run <code>{script}</code> in the Supabase SQL editor, after the earlier academics and accounts scripts.</p>
      </AcademicsNotice>
    );
  }
  return (
    <AcademicsNotice title={title} heading="Connect Supabase" kicker={kicker} description={description}>
      <p>Add your Supabase keys to <code>.env.local</code> to use the {teacherDesk ? "teacher desk" : "academics office"}.</p>
    </AcademicsNotice>
  );
}

export function OfficeOnly({ title }: { title: string }) {
  return (
    <AcademicsNotice title={title} icon="fa-lock" heading="Office only">
      <p>Approvals, grading, publishing and reminders stay with the academics office.</p>
    </AcademicsNotice>
  );
}

export function Empty({ icon = "fa-folder-open", title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="apl-empty">
      <span><i className={`fa-regular ${icon}`} aria-hidden="true" /></span>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
