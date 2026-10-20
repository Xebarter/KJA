import { PageHeader } from "@/components/admin/PageHeader";
import { PrintButton } from "@/components/office/client";
import { MedicalRegister, type MedicalRow, type MedicalView } from "@/components/office/MedicalRegister";
import { MigrationHint, OfficeNotice } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { studentPhotoUrl } from "@/lib/student-photos";
import { fetchAll, isClassCode, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./medical.css";

export const metadata = { title: "Medical" };

type Row = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  student_number: string;
  sex: string | null;
  class_code: string | null;
  stream: string | null;
  age: number | null;
  medical_notes: string | null;
  panadol_allowed: boolean | null;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  photo_path?: string | null;
};

const COLUMNS = "id, full_name, preferred_name, student_number, sex, class_code, stream, age, medical_notes, panadol_allowed, father_name, father_phone, mother_name, mother_phone";
const VIEWS: MedicalView[] = ["notes", "allergy", "no-panadol", "unknown", "all"];
const ALLERGY = /allerg|anaphyl|epipen|peanut|nut\b|bee sting|penicillin/i;
const CHRONIC = /asthma|epilep|seizure|diabet|sickle|heart|inhaler/i;

export default async function MedicalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Medical" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const [auth, params] = await Promise.all([requireOffice(), searchParams]);
  if ("error" in auth) return <OfficeNotice title="Medical" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const view = VIEWS.find((entry) => entry === pick(params, "view")) ?? "notes";
  const requested = pick(params, "class");
  const cls = isClassCode(requested) || requested === "none" ? requested : "";

  // Skip photo_path so a missing column never doubles a full-register scan.
  let all: Row[];
  try {
    all = await fetchAll<Row>((from, to) =>
      auth.supabase
        .from("student_directory")
        .select(COLUMNS)
        .eq("status", "active")
        .order("class_order", { nullsFirst: false })
        .order("full_name")
        .range(from, to));
  } catch (error) {
    return <OfficeNotice title="Medical" heading="Medical records could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  const rows: MedicalRow[] = all.map((row) => ({
    id: row.id,
    name: row.full_name,
    preferred: row.preferred_name,
    number: row.student_number,
    sex: row.sex,
    classCode: row.class_code,
    stream: row.stream,
    age: row.age,
    notes: row.medical_notes?.trim() || null,
    panadol: row.panadol_allowed,
    phone: row.mother_phone || row.father_phone,
    phoneName: row.mother_phone ? row.mother_name || "Mother" : row.father_phone ? row.father_name || "Father" : null,
    contacts: [row.mother_name, row.mother_phone, row.father_name, row.father_phone].filter(Boolean).join(" "),
    photo: studentPhotoUrl(row.id, null),
  }));

  const withNotes = rows.filter((row) => row.notes);
  const stats = [
    { label: "Medical notes", value: withNotes.length, note: `${Math.round((withNotes.length / Math.max(1, rows.length)) * 100)}% of ${rows.length} pupils`, icon: "fa-notes-medical", tone: "med" },
    { label: "Allergies", value: withNotes.filter((row) => ALLERGY.test(row.notes ?? "")).length, note: "Notes mentioning an allergy", icon: "fa-triangle-exclamation", tone: "red" },
    { label: "Ongoing conditions", value: withNotes.filter((row) => CHRONIC.test(row.notes ?? "")).length, note: "Asthma, epilepsy, diabetes and similar", icon: "fa-heart-pulse", tone: "violet" },
    { label: "No Panadol", value: rows.filter((row) => row.panadol === false).length, note: "Parents said no", icon: "fa-ban", tone: "gold" },
    { label: "Panadol not asked", value: rows.filter((row) => row.panadol === null).length, note: "Ask at the next contact", icon: "fa-circle-question", tone: "slate" },
  ];

  return (
    <div className="app-page ofc-page omd-page">
      <PageHeader
        kicker="Insights"
        icon="fa-notes-medical"
        title="Medical"
        description="Health notes, allergies and Panadol consent for every pupil, grouped by class. Search as you type, then print a copy for the sick bay and class teachers."
        actions={<PrintButton label="Print for the sick bay" />}
      />

      <div className="omd-stats">
        {stats.map((stat) => (
          <div key={stat.label} className={`omd-stat is-${stat.tone}`}>
            <span className="omd-stat-icon"><i className={`fa-solid ${stat.icon}`} aria-hidden="true" /></span>
            <div>
              <strong>{stat.value.toLocaleString("en-GB")}</strong>
              <span>{stat.label}</span>
              <small>{stat.note}</small>
            </div>
          </div>
        ))}
      </div>

      <MedicalRegister rows={rows} initialView={view} initialClass={cls} printedBy={auth.profile.full_name || auth.profile.email || "Admissions office"} />
    </div>
  );
}
