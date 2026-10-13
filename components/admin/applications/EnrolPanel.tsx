import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import type { Application } from "@/lib/applications";
import { OFFICE, className, classCodeFromName, normalizePhone } from "@/lib/students";

type Match = { id: string; family_code: string; mailing_name: string | null; reason: string; children: string[] };

/** Families already on the register with the same parent phone or email, so siblings join the right family. */
async function findFamilies(supabase: SupabaseClient, phone: string | null, email: string | null): Promise<Match[]> {
  const tail = normalizePhone(phone).replace(/\D/g, "").slice(-9);
  const reasons = new Map<string, string>();
  const lookups = [];
  if (tail.length === 9) {
    lookups.push(supabase.from("family_contacts").select("family_id").eq("kind", "phone").ilike("value", `%${tail}`).limit(10)
      .then(({ data }) => (data || []).forEach((row) => reasons.set(row.family_id, "Same phone number"))));
  }
  if (email) {
    lookups.push(supabase.from("family_contacts").select("family_id").eq("kind", "email").ilike("value", email.trim()).limit(10)
      .then(({ data }) => (data || []).forEach((row) => { if (!reasons.has(row.family_id)) reasons.set(row.family_id, "Same email address"); })));
  }
  await Promise.all(lookups);
  const ids = [...reasons.keys()].slice(0, 5);
  if (!ids.length) return [];
  const [{ data: families }, { data: kids }] = await Promise.all([
    supabase.from("families").select("id, family_code, mailing_name").in("id", ids),
    supabase.from("students").select("family_id, full_name, class_code, status").in("family_id", ids),
  ]);
  return (families || []).map((family) => ({
    ...family,
    reason: reasons.get(family.id) ?? "",
    children: (kids || []).filter((kid) => kid.family_id === family.id && kid.status === "active").map((kid) => `${kid.full_name} (${kid.class_code ?? "no class"})`),
  })) as Match[];
}

export async function EnrolPanel({ application, supabase }: { application: Application & { student_id?: string | null }; supabase: SupabaseClient }) {
  if (application.student_id) {
    const { data: student } = await supabase.from("students").select("id, full_name, student_number, class_code, stream, status").eq("id", application.student_id).maybeSingle();
    if (student) {
      return (
        <section className="admin-card ofc-enrol is-done" id="enrol">
          <h2 className="app-card-title">On the register</h2>
          <p>
            <i className="fa-solid fa-circle-check" aria-hidden="true" /> {student.full_name} is student <strong>{student.student_number}</strong> in {className(student.class_code)}
            {student.stream ? ` ${student.stream}` : ""}.
          </p>
          <Link className="admin-btn admin-btn-ghost" href={`${OFFICE}/students/${student.id}`}>
            <i className="fa-solid fa-id-card" aria-hidden="true" /> Open student record
          </Link>
        </section>
      );
    }
  }
  if (application.status === "declined" || application.status === "withdrawn") return null;
  if ("student_id" in application === false) {
    return (
      <section className="admin-card ofc-enrol" id="enrol">
        <h2 className="app-card-title">Student register</h2>
        <p className="app-muted">Run <code>supabase/0011_admissions_office.sql</code> to enrol applicants straight into the student register.</p>
      </section>
    );
  }

  const matches = await findFamilies(supabase, application.phone, application.email);
  const ready = application.status === "offered" || application.status === "enrolled";
  const href = `${OFFICE}/students/new?application=${application.id}`;
  const classCode = classCodeFromName(application.grade);

  return (
    <section className={`admin-card ofc-enrol${ready ? " is-ready" : ""}`} id="enrol">
      <h2 className="app-card-title">Enrol as a student</h2>
      <p className="app-muted">
        {ready
          ? "This child has a place. Add them to the student register to give them a student number and class."
          : "Once a place is offered, add the child to the student register from here."}
        {classCode ? ` They applied for ${className(classCode)}.` : ""}
      </p>
      {matches.length ? (
        <div className="ofc-enrol-matches">
          <p><i className="fa-solid fa-people-roof" aria-hidden="true" /> This parent may already have children at KJA:</p>
          <ul>
            {matches.map((match) => (
              <li key={match.id}>
                <div>
                  <strong>{match.mailing_name || match.family_code}</strong>
                  <small>{match.family_code} · {match.reason}</small>
                  {match.children.length ? <small>{match.children.join(", ")}</small> : null}
                </div>
                <Link className="app-link-btn" href={`${href}&family=${match.id}`}>Enrol as sibling</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link className={`admin-btn${ready ? "" : " admin-btn-ghost"} ofc-enrol-btn`} href={href}>
        <i className="fa-solid fa-user-plus" aria-hidden="true" /> {matches.length ? "Enrol with a new family" : "Enrol as a student"}
      </Link>
    </section>
  );
}
