import { changeStudentPassword } from "@/app/student/actions";
import { ActionForm } from "@/components/account/ActionForm";
import { PrintCardButton } from "@/components/student/PrintCardButton";
import { StudentFace } from "@/components/StudentFace";
import { classLabel, displayName } from "@/lib/student";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "My card" };

async function savePassword(formData: FormData) {
  "use server";
  const result = await changeStudentPassword(formData);
  if (result.error) throw new Error(result.error);
}

function houseTone(house: string | null | undefined) {
  const key = (house || "").toLowerCase();
  if (/red|ruby|rose|phoenix/.test(key)) return "rose";
  if (/blue|sky|ocean|sapphire/.test(key)) return "sky";
  if (/green|emerald|leaf|forest/.test(key)) return "mint";
  if (/gold|yellow|sun|amber/.test(key)) return "sun";
  if (/orange|coral|tiger/.test(key)) return "coral";
  return "teal";
}

export default async function StudentProfilePage() {
  const portal = await getStudentPortal();
  const student = portal.student;
  const name = student ? displayName(student) : "Student";
  const tone = houseTone(student?.house);
  const mustReset = portal.mustResetPassword;
  const className = student ? classLabel(student.class_code, student.stream) : "—";

  return (
    <div className={`sp-page sp-page--${tone}`}>
      <section className="sp-hero">
        <div className="sp-hero-bg" aria-hidden="true">
          <span className="sp-blob sp-blob-a" />
          <span className="sp-blob sp-blob-b" />
        </div>
        <div className="sp-hero-copy">
          <p className="sp-kicker">
            <i className="fa-solid fa-id-card" aria-hidden="true" />
            About me
          </p>
          <h1>My card</h1>
          <p className="sp-hero-lead">
            Your digital student card for Kampala Junior Academy. Keep your login safe and only share your card with teachers.
          </p>
        </div>
        <div className="sp-hero-actions">
          {student ? <PrintCardButton /> : null}
          <div className="sp-hero-stats" aria-label="Profile summary">
            <div className="sp-hero-stat">
              <strong>{student?.class_code || "—"}</strong>
              <span>Class</span>
            </div>
            <div className="sp-hero-stat">
              <strong>{student?.house ? student.house.slice(0, 8) : "—"}</strong>
              <span>House</span>
            </div>
          </div>
        </div>
      </section>

      {student ? (
        <div className="sp-layout">
          <article className={`sp-card sp-card--${tone}`} aria-label="Student identity card">
            <div className="sp-card-ribbon" aria-hidden="true">
              <span /><span /><span /><span /><span />
            </div>
            <div className="sp-card-glow" aria-hidden="true" />

            <div className="sp-card-top">
              <div className="sp-card-brand">
                <span className="sp-card-seal" aria-hidden="true">
                  <img src="/images/kja-logo.png" alt="" />
                </span>
                <div>
                  <p className="sp-card-school">Kampala Junior Academy</p>
                  <p className="sp-card-tag">Official student card</p>
                </div>
              </div>
              <span className="sp-card-badge">
                <i className="fa-solid fa-star" aria-hidden="true" />
                {student.house || "KJA"}
              </span>
            </div>

            <div className="sp-card-main">
              <div className={`sp-card-photo-ring sp-card-photo-ring--${tone}`}>
                <StudentFace
                  id={student.id}
                  name={name}
                  photoPath={student.photo_path}
                  className="sp-card-photo"
                />
              </div>
              <div className="sp-card-who">
                <p className="sp-card-hello">Hello, I am</p>
                <h2>{name}</h2>
                {student.preferred_name && student.preferred_name !== student.full_name ? (
                  <p className="sp-card-aka">Full name: {student.full_name}</p>
                ) : null}
                <p className="sp-card-class">
                  <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
                  {className}
                </p>
              </div>
            </div>

            <dl className="sp-card-facts">
              <div className="sp-fact sp-fact--sky">
                <dt>Student no.</dt>
                <dd className="ofc-num">{student.student_number}</dd>
              </div>
              <div className="sp-fact sp-fact--sun">
                <dt>Class</dt>
                <dd>{className}</dd>
              </div>
              <div className={`sp-fact sp-fact--${tone}`}>
                <dt>House</dt>
                <dd>{student.house || "—"}</dd>
              </div>
              <div className="sp-fact sp-fact--mint">
                <dt>Campus</dt>
                <dd>{student.campus || "—"}</dd>
              </div>
            </dl>

            <p className="sp-card-foot">
              <i className="fa-solid fa-heart" aria-hidden="true" />
              Show this card to a teacher if they ask. You can print it anytime.
            </p>
          </article>

          <section className={`sp-panel${mustReset ? " is-urgent" : ""}`} aria-label="Login settings">
            <header className="sp-panel-head">
              <span className="sp-panel-ico" aria-hidden="true">
                <i className="fa-solid fa-key" />
              </span>
              <div>
                <h2>My login</h2>
                <p>
                  {mustReset
                    ? "Please choose a new password before you continue."
                    : "Keep your password private and easy for you to remember."}
                </p>
              </div>
            </header>

            <div className="sp-email">
              <span className="sp-email-label">Login email</span>
              <strong>{portal.profile?.email || "—"}</strong>
            </div>

            <ActionForm action={savePassword} className="sp-form" success="Password updated. Nice work!">
              <label className="sp-field">
                <span>New password</span>
                <input
                  name="password"
                  type="password"
                  minLength={6}
                  required
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
              </label>
              <label className="sp-field">
                <span>Confirm password</span>
                <input
                  name="confirm"
                  type="password"
                  minLength={6}
                  required
                  placeholder="Type it again"
                  autoComplete="new-password"
                />
              </label>
              <button className="sp-submit" type="submit">
                <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
                Save password
              </button>
            </ActionForm>
          </section>
        </div>
      ) : (
        <div className="sp-empty">
          <span aria-hidden="true">
            <i className="fa-solid fa-id-card" />
          </span>
          <h2>Card not ready</h2>
          <p>Your pupil record is not linked yet. Ask the office for help.</p>
        </div>
      )}
    </div>
  );
}
