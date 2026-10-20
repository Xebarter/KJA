import { changeStudentPassword } from "@/app/student/actions";
import { ActionForm } from "@/components/account/ActionForm";
import { StudentFace } from "@/components/StudentFace";
import { classLabel, displayName } from "@/lib/student";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "My card" };

async function savePassword(formData: FormData) {
  "use server";
  const result = await changeStudentPassword(formData);
  if (result.error) throw new Error(result.error);
}

export default async function StudentProfilePage() {
  const portal = await getStudentPortal();
  const student = portal.student;

  return (
    <div className="st-section">
      <p className="account-kicker">Account</p>
      <h1>My card</h1>
      <p className="lead">Your digital student card. You can print this page if a teacher asks.</p>

      {student ? (
        <article className="st-id-card">
          <StudentFace
            id={student.id}
            name={displayName(student)}
            photoPath={student.photo_path}
            className="st-id-photo"
          />
          <div className="st-id-body">
            <p className="st-id-school">Kampala Junior Academy</p>
            <h2>{displayName(student)}</h2>
            {student.preferred_name && student.preferred_name !== student.full_name ? (
              <p className="st-id-aka">Also known as {student.full_name}</p>
            ) : null}
            <dl className="st-id-facts">
              <div>
                <dt>Student no.</dt>
                <dd className="ofc-num">{student.student_number}</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{classLabel(student.class_code, student.stream)}</dd>
              </div>
              <div>
                <dt>House</dt>
                <dd>{student.house || "—"}</dd>
              </div>
              <div>
                <dt>Campus</dt>
                <dd>{student.campus || "—"}</dd>
              </div>
            </dl>
          </div>
        </article>
      ) : (
        <div className="hw-empty">
          <i className="fa-solid fa-id-card" aria-hidden="true" />
          <p>Your pupil record is not linked yet. Ask the office for help.</p>
        </div>
      )}

      <div className="st-id-login">
        <h2 style={{ margin: "0 0 .5rem", fontSize: "1.15rem" }}>Login email</h2>
        <p className="lead" style={{ marginBottom: "1rem" }}>{portal.profile?.email || "—"}</p>

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
    </div>
  );
}
