import { PageHeader } from "@/components/admin/PageHeader";
import { academicsSchemaScript } from "@/lib/academics-nav";

export function AcademicsNotice({ title, icon = "fa-plug-circle-exclamation", heading, children }: {
  title: string;
  icon?: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-page">
      <PageHeader kicker="Academics office" icon="fa-graduation-cap" title={title} description="Teaching, attendance, assessments and report cards." />
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
  if (state.notice === "auth") {
    return <AcademicsNotice title={title} icon="fa-lock" heading="Not available"><p>{state.message}</p></AcademicsNotice>;
  }
  if (state.notice === "schema") {
    const script = academicsSchemaScript(state.message);
    return (
      <AcademicsNotice title={title} heading="Academics office is not set up yet">
        <p>{state.message}</p>
        <p>Run <code>{script}</code> in the Supabase SQL editor, after the earlier academics and accounts scripts.</p>
      </AcademicsNotice>
    );
  }
  return (
    <AcademicsNotice title={title} heading="Connect Supabase">
      <p>Add your Supabase keys to <code>.env.local</code> to use the academics office.</p>
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
