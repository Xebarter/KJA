import "../admin/admin.css";
import "../admin/(panel)/applications/applications.css";
import "../admissions_office/office.css";
import "../admissions_office/(office)/overview.css";
import { Overview } from "@/components/office/Overview";
import { OfficeShell } from "@/components/office/Shell";

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pickOne = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const NAMES = ["Amani Nakato", "Brian Ssemakula", "Chloe Namuli", "Daniel Okello", "Esther Achieng", "Felix Mugisha", "Grace Atim", "Henry Kato", "Ivy Nambi", "Joel Kizza", "Kevin Lubega", "Lydia Auma"];
const CLASSES = [["RC", "nursery", 3], ["C2", "nursery", 3], ["C3", "nursery", 4], ["C4", "nursery", 5], ["P1", "primary", 6], ["P2", "primary", 7], ["P3", "primary", 8], ["P4", "primary", 9], ["P5", "primary", 10], ["P6", "primary", 11], ["P7", "primary", 12]] as const;
const SIZES = [18, 34, 41, 46, 62, 58, 55, 60, 52, 49, 44];

const now = new Date();
const iso = (days: number, hours = 0) => new Date(now.getTime() + days * 86_400_000 + hours * 3_600_000).toISOString();
const dob = (age: number, offsetDays: number) => {
  const d = new Date(now.getFullYear() - age, now.getMonth(), now.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const students: Record<string, unknown>[] = [];
CLASSES.forEach(([code, section, age], ci) => {
  for (let i = 0; i < SIZES[ci]; i++) {
    const n = students.length;
    students.push({
      id: `s${n}`,
      full_name: `${pickOne(NAMES)} ${n}`.replace(/ \d+$/, n < 12 ? "" : ` ${String.fromCharCode(65 + (n % 26))}.`),
      sex: rand() < .03 ? null : rand() < .5 ? "M" : "F",
      class_code: code,
      section,
      stream: ci > 3 ? (i % 2 ? "East" : "West") : null,
      date_of_birth: rand() < .02 ? null : n % 97 === 0 ? dob(age, Math.floor(n / 97)) : dob(age, Math.floor(rand() * 300) + 10),
      enrolled_on: rand() < .08 ? iso(-20).slice(0, 10) : "2024-02-01",
      staff_child: rand() < .04,
      medical_notes: rand() < .07 ? "Asthma" : null,
      needs_review: rand() < .015,
      house: section === "nursery" ? null : rand() < .05 ? null : "Kabaka",
    });
  }
});
students.push({ id: "s-x", full_name: "Unplaced Pupil", sex: "F", class_code: null, section: null, stream: null, date_of_birth: dob(7, 2), enrolled_on: iso(-3).slice(0, 10), staff_child: false, medical_notes: null, needs_review: false, house: null });

const STATUSES = ["received", "received", "received", "reviewing", "reviewing", "visit_scheduled", "offered", "enrolled", "enrolled", "enrolled", "waitlisted", "withdrawn"];
const applications = Array.from({ length: 132 }, (_, i) => {
  const status = i < 20 ? "received" : i < 34 ? "reviewing" : i < 43 ? "visit_scheduled" : i < 55 ? "offered" : pickOne(STATUSES.slice(7));
  return {
    id: `a${i}`,
    child_name: `${pickOne(NAMES)}`,
    parent_name: pickOne(["Sarah Nakato", "Peter Ssemakula", "Ruth Namuli", "James Okello"]),
    grade: pickOne(["Baby Class", "Top Class", "Primary One", "Primary Three"]),
    campus: pickOne(["Kololo", "Mbuya"]),
    status,
    created_at: iso(-Math.floor(rand() * 60) - 1),
    visit_at: status === "visit_scheduled" ? iso(Math.floor((i - 34) / 2), 2 + (i % 3)) : null,
    student_id: status === "enrolled" ? (i % 5 ? `s${i}` : null) : null,
  };
});

const activity = [
  { kind: "enrol", body: "Enrolled in P1 West from application." },
  { kind: "note", body: "Mother called to confirm the visit. Prefers mornings." },
  { kind: "status", body: "Moved from New to In review." },
  { kind: "class", body: "Moved from P3 East to P3 West." },
  { kind: "edit", body: "Updated date of birth and house." },
  { kind: "visit", body: "Visit booked for Thursday at 10:00." },
  { kind: "review", body: "Marked the import warnings as checked." },
  { kind: "assign", body: "Assigned to Enock Mutebi." },
];
const studentActivity = activity.slice(0, 6).map((entry, i) => ({ id: `sa${i}`, actor_id: "u1", created_at: iso(-i * .45), student_id: `s${i * 9}`, ...entry }));
const appActivity = activity.slice(2).map((entry, i) => ({ id: `aa${i}`, actor_id: i % 2 ? "u2" : "u1", created_at: iso(-i * .7 - .1), application_id: `a${i * 4}`, ...entry }));

const TABLES: Record<string, { data: unknown[]; count?: number }> = {
  student_directory: { data: students },
  applications: { data: applications },
  students: { data: [], count: 14 },
  family_contacts: { data: [], count: 6 },
  student_activity: { data: studentActivity },
  application_activity: { data: appActivity },
  families: { data: [], count: 438 },
  profiles: { data: [{ id: "u1", full_name: "Enock Mutebi", email: "enock@kja.ac.ug" }, { id: "u2", full_name: "Ruth Achan", email: "ruth@kja.ac.ug" }] },
};

function query(table: string) {
  let range: [number, number] | null = null;
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "neq", "gte", "lt", "in", "order", "limit"]) builder[name] = () => builder;
  builder.range = (from: number, to: number) => { range = [from, to]; return builder; };
  builder.then = (resolve: (value: unknown) => void) => {
    const entry = TABLES[table] ?? { data: [] };
    const data = range ? entry.data.slice(range[0], range[1] + 1) : entry.data;
    resolve({ data, error: null, count: entry.count ?? entry.data.length });
  };
  return builder;
}

export default function Preview() {
  const supabase = { from: query } as never;
  return (
    <div className="kja-admin kja-office">
      <OfficeShell person={{ name: "Enock Mutebi", email: "enock@kja.ac.ug", role: "Admissions officer" }} badges={{ applications: 21, visits: 5, quality: 9 }}>
        <Overview supabase={supabase} user={{ email: "enock@kja.ac.ug" } as never} profile={{ full_name: "Enock Mutebi" } as never} />
      </OfficeShell>
    </div>
  );
}
