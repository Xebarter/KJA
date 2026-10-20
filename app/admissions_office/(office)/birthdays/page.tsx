import { PageHeader } from "@/components/admin/PageHeader";
import { BirthdayPlanner, type BirthdayRow, type BirthdayView } from "@/components/office/BirthdayPlanner";
import { PrintButton } from "@/components/office/client";
import { MigrationHint, OfficeNotice } from "@/components/office/ui";
import { BIRTHDAY_RANGES, type BirthdayRange } from "@/lib/birthdays";
import { requireOffice } from "@/lib/office";
import { studentPhotoUrl } from "@/lib/student-photos";
import { fetchAll, isClassCode, pick, todayIso } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./birthdays.css";

export const metadata = { title: "Birthdays" };

type Row = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  student_number: string;
  sex: string | null;
  date_of_birth: string | null;
  class_code: string | null;
  stream: string | null;
  house: string | null;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  photo_path?: string | null;
};

const COLUMNS = "id, full_name, preferred_name, student_number, sex, date_of_birth, class_code, stream, house, father_name, father_phone, mother_name, mother_phone";
const VIEWS: BirthdayView[] = ["upcoming", "calendar", "missing"];

export default async function BirthdaysPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Birthdays" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const [auth, params] = await Promise.all([requireOffice(), searchParams]);
  if ("error" in auth) return <OfficeNotice title="Birthdays" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;

  const view = VIEWS.find((entry) => entry === pick(params, "view")) ?? "upcoming";
  const requested = pick(params, "class").toUpperCase();
  const cls = isClassCode(requested) ? requested : requested === "NONE" ? "none" : "";
  const month = Number(pick(params, "month"));
  const range = BIRTHDAY_RANGES.find((entry) => entry === Number(pick(params, "range"))) ?? 30;

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
    return <OfficeNotice title="Birthdays" heading="Birthdays could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  const rows: BirthdayRow[] = all.map((row) => ({
    id: row.id,
    name: row.full_name,
    preferred: row.preferred_name,
    number: row.student_number,
    sex: row.sex,
    dob: row.date_of_birth,
    classCode: row.class_code,
    stream: row.stream,
    house: row.house,
    phone: row.mother_phone || row.father_phone,
    parent: row.mother_phone ? row.mother_name || "Mother" : row.father_phone ? row.father_name || "Father" : null,
    photo: studentPhotoUrl(row.id, null),
  }));

  return (
    <div className="app-page ofc-page bdy-page">
      <PageHeader
        kicker="Insights"
        icon="fa-cake-candles"
        title="Birthdays"
        description="Who is celebrating today, this week and in the months ahead. Send wishes to parents, plan class celebrations and print lists for class teachers."
        actions={<PrintButton label="Print list" />}
      />
      <BirthdayPlanner
        rows={rows}
        today={todayIso()}
        initialView={view}
        initialClass={cls}
        initialMonth={month >= 1 && month <= 12 ? month : 0}
        initialRange={range as BirthdayRange}
        printedBy={auth.profile.full_name || auth.profile.email || "Admissions office"}
      />
    </div>
  );
}
