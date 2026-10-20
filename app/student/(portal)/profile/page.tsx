import { changeStudentPassword } from "@/app/student/actions";
import { ActionForm } from "@/components/account/ActionForm";
import { classLabel, displayName } from "@/lib/student";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "My details" };

async function savePassword(formData: FormData) {
  "use server";
  const result = await changeStudentPassword(formData);
  if (result.error) throw new Error(result.error);
}

export default async function StudentProfilePage() {
  const portal = await getStudentPortal();
  const student = portal.student;

  return (
    <div className="st-section" style={{ padding: "1.25rem 1.35rem", borderRadius: 18, background: "#fff", border: "1px solid rgba(25,35,43,.08)" }}>
      <p className="account-kicker">Account</p>
      <h1>My details</h1>
      <p className="lead">This is your student portal login. Ask the office if anything looks wrong.</p>

      <dl style={{ marginTop: "1.25rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: ".35rem 1rem", marginBottom: ".55rem" }}>
          <dt style={{ color: "#5d6670", fontSize: ".8rem", fontWeight: 700 }}>Name</dt>
          <dd style={{ margin: 0 }}>{student ? displayName(student) : portal.profile?.full_name || "—"}</dd>
          <dt style={{ color: "#5d6670", fontSize: ".8rem", fontWeight: 700 }}>Class</dt>
          <dd style={{ margin: 0 }}>{student ? classLabel(student.class_code, student.stream) : "—"}</dd>
          <dt style={{ color: "#5d6670", fontSize: ".8rem", fontWeight: 700 }}>Student number</dt>
          <dd style={{ margin: 0 }}>{student?.student_number || "—"}</dd>
          <dt style={{ color: "#5d6670", fontSize: ".8rem", fontWeight: 700 }}>Email</dt>
          <dd style={{ margin: 0 }}>{portal.profile?.email || "—"}</dd>
          <dt style={{ color: "#5d6670", fontSize: ".8rem", fontWeight: 700 }}>Campus</dt>
          <dd style={{ margin: 0 }}>{student?.campus || "—"}</dd>
        </div>
      </dl>

      <hr style={{ border: 0, borderTop: "1px solid rgba(25,35,43,.08)", margin: "1.4rem 0" }} />

      <h2 style={{ margin: "0 0 .5rem", fontSize: "1.15rem" }}>Change password</h2>
      <p className="lead" style={{ marginBottom: "1rem" }}>
        {portal.mustResetPassword ? "Please choose a new password now." : "Use a password only you know."}
      </p>
      <ActionForm action={savePassword} className="account-form" success="Password updated.">
        <label>
          <span className="account-sr">New password</span>
          <input name="password" type="password" minLength={6} required placeholder="New password" autoComplete="new-password" />
        </label>
        <label>
          <span className="account-sr">Confirm password</span>
          <input name="confirm" type="password" minLength={6} required placeholder="Confirm password" autoComplete="new-password" />
        </label>
        <button className="account-btn" type="submit">Save password</button>
      </ActionForm>
    </div>
  );
}
