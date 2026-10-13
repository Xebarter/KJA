import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { StudentForm, type GuardianPrefill, type StudentFormValues } from "@/components/office/StudentForm";
import { OfficeNotice } from "@/components/office/ui";
import { statusInfo } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { OFFICE, classCodeFromName, displayPhone, isUuid, pick, splitName, todayIso } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import type { FamilyMatch } from "../actions";

export const metadata = { title: "Enrol a student" };

type AppRow = {
  id: string;
  child_name: string | null;
  child_dob: string | null;
  grade: string | null;
  campus: string | null;
  parent_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  student_id?: string | null;
};

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Enrol a student" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Enrol a student" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase } = auth;
  const params = await searchParams;
  const applicationId = pick(params, "application");
  const familyId = pick(params, "family");

  const [appResult, familyResult, numberResult, streamResult] = await Promise.all([
    isUuid(applicationId)
      ? supabase.from("applications").select("id, child_name, child_dob, grade, campus, parent_name, phone, email, status, student_id").eq("id", applicationId).maybeSingle()
      : Promise.resolve({ data: null }),
    isUuid(familyId)
      ? Promise.all([
          supabase.from("families").select("id, family_code, mailing_name, home_area").eq("id", familyId).maybeSingle(),
          supabase.from("guardians").select("full_name, phone").eq("family_id", familyId),
          supabase.from("students").select("full_name, class_code, status").eq("family_id", familyId).order("date_of_birth"),
        ])
      : Promise.resolve(null),
    supabase.rpc("next_student_number"),
    supabase.from("students").select("stream").not("stream", "is", null).eq("status", "active").limit(2000),
  ]);

  const app = appResult.data as AppRow | null;
  let family: FamilyMatch | null = null;
  if (familyResult && familyResult[0].data) {
    const row = familyResult[0].data;
    const parents = familyResult[1].data || [];
    family = {
      id: row.id,
      code: row.family_code,
      name: row.mailing_name || parents.map((parent) => parent.full_name).join(" & ") || row.family_code,
      area: row.home_area,
      parents: parents.map((parent) => parent.full_name),
      phones: parents.map((parent) => displayPhone(parent.phone)).filter(Boolean),
      children: (familyResult[2].data || []).map((kid) => `${kid.full_name}${kid.status === "active" && kid.class_code ? ` (${kid.class_code})` : kid.status !== "active" ? ` (${kid.status})` : ""}`),
    };
  }

  if (app?.student_id) {
    return (
      <OfficeNotice title="Enrol a student" icon="fa-circle-check" heading="Already on the register">
        <p>{app.child_name || "This child"} was enrolled from this application.</p>
        <p><Link className="admin-btn" href={`${OFFICE}/students/${app.student_id}`}>Open the student record</Link></p>
      </OfficeNotice>
    );
  }

  const initial: StudentFormValues = { enrolled_on: todayIso() };
  const guardians: GuardianPrefill = {};
  if (app) {
    const name = splitName(app.child_name || "");
    Object.assign(initial, {
      surname: name.surname,
      given_names: name.given,
      date_of_birth: app.child_dob,
      class_code: classCodeFromName(app.grade),
      campus: app.campus,
    });
    if (app.parent_name) Object.assign(guardians, { guardian_name: app.parent_name, guardian_phone: app.phone ?? "", guardian_email: app.email ?? "" });
  }
  const streams = [...new Set((streamResult.data || []).map((row) => row.stream as string))];
  const nextNumber = numberResult.error ? null : String(numberResult.data);

  return (
    <div className="app-page ofc-page ofc-narrow">
      <Link href={app ? `${OFFICE}/applications/${app.id}` : `${OFFICE}/students`} className="app-back">
        <i className="fa-solid fa-arrow-left" /> {app ? "Back to the application" : "Students"}
      </Link>
      <PageHeader
        kicker="Register"
        icon="fa-user-plus"
        title={app ? `Enrol ${app.child_name || "applicant"}` : family ? `Add a sibling to ${family.name}` : "Enrol a student"}
        description={
          app
            ? "Details from the application are filled in. Check them against the birth certificate before saving."
            : "Add a pupil to the register. They get the next student number unless you enter one."
        }
      />
      {app ? (
        <div className="ofc-banner">
          <i className="fa-solid fa-file-signature" aria-hidden="true" />
          <p>
            From the application by <strong>{app.parent_name || "a parent"}</strong> for {app.grade || "a place"}{app.campus ? ` at ${app.campus}` : ""}.
            It&apos;s currently <strong>{statusInfo(app.status).label}</strong> and will be marked Enrolled. The parent&apos;s details are entered as the
            guardian: move them to Father or Mother if that&apos;s who applied. Names are filled in as surname first; swap them if needed.
          </p>
        </div>
      ) : null}
      {numberResult.error ? (
        <div className="ofc-banner is-warn">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <p>Run <code>supabase/0011_admissions_office.sql</code> in the Supabase SQL editor before enrolling students.</p>
        </div>
      ) : null}
      <StudentForm
        mode="new"
        initial={initial}
        applicationId={app?.id}
        family={family}
        guardians={guardians}
        streams={streams}
        nextNumber={nextNumber}
      />
    </div>
  );
}
