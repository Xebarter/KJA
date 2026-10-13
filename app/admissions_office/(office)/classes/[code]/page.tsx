import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { ClassRoster, type RosterRow } from "@/components/office/ClassRoster";
import { PrintButton } from "@/components/office/client";
import { Empty, MigrationHint, OfficeNotice, Panel } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { HOUSES, OFFICE, SCHOOL_CLASSES, ageOutlier, daysToBirthday, fetchAll, isClassCode, pick } from "@/lib/students";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: SCHOOL_CLASSES.find((entry) => entry.code === code.toUpperCase())?.name ?? "Class" };
}

type Row = Omit<RosterRow, "outlier">;

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const code = (await params).code.toUpperCase();
  if (!isClassCode(code)) notFound();
  const entry = SCHOOL_CLASSES.find((item) => item.code === code)!;
  const stream = pick(await searchParams, "stream").toUpperCase().slice(0, 20);
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title={entry.name} icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;

  let all: Row[];
  try {
    all = await fetchAll<Row>((from, to) =>
      auth.supabase
        .from("student_directory")
        .select("id, student_number, full_name, sex, date_of_birth, age, stream, house, medical_notes, panadol_allowed, father_name, father_phone, mother_name, mother_phone")
        .eq("status", "active")
        .eq("class_code", code)
        .order("stream", { nullsFirst: false })
        .order("full_name")
        .range(from, to));
  } catch (error) {
    return <OfficeNotice title={entry.name} heading="This class could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  const streams = [...new Set(all.map((row) => row.stream).filter(Boolean) as string[])].sort();
  const rows: RosterRow[] = (stream ? all.filter((row) => (stream === "NONE" ? !row.stream : row.stream === stream)) : all)
    .map((row) => ({ ...row, outlier: ageOutlier(code, row.date_of_birth) }));
  const index = SCHOOL_CLASSES.findIndex((item) => item.code === code);
  const prev = SCHOOL_CLASSES[index - 1];
  const next = SCHOOL_CLASSES[index + 1];
  const boys = rows.filter((row) => row.sex === "M").length;
  const girls = rows.filter((row) => row.sex === "F").length;
  const birthdays = rows
    .map((row) => ({ ...row, days: daysToBirthday(row.date_of_birth) }))
    .filter((row) => row.days !== null && row.days <= 30)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  const exportParams = new URLSearchParams({ class: code });
  if (stream && stream !== "NONE") exportParams.set("stream", stream);
  const base = `${OFFICE}/classes/${code}`;
  const title = `${entry.name}${stream ? (stream === "NONE" ? " · no stream" : ` ${stream}`) : ""}`;

  return (
    <div className="app-page ofc-page ofc-class-page">
      <div className="ofc-crumbs no-print">
        <Link href={`${OFFICE}/classes`} className="app-back"><i className="fa-solid fa-arrow-left" /> Classes</Link>
        <span>
          {prev ? <Link href={`${OFFICE}/classes/${prev.code}`}><i className="fa-solid fa-chevron-left" aria-hidden="true" /> {prev.code}</Link> : null}
          {next ? <Link href={`${OFFICE}/classes/${next.code}`}>{next.code} <i className="fa-solid fa-chevron-right" aria-hidden="true" /></Link> : null}
        </span>
      </div>
      <PageHeader
        kicker={`${entry.section === "nursery" ? "Nursery" : "Primary"} · ${code}`}
        icon="fa-chalkboard-user"
        title={title}
        description={`${rows.length} pupils · ${boys} boys, ${girls} girls${streams.length ? ` · streams ${streams.join(", ")}` : ""}`}
        actions={
          <>
            <PrintButton label="Print class list" />
            <a className="admin-hero-btn" href={`${OFFICE}/students/export?${exportParams}`}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV</a>
            <Link className="admin-hero-btn" href={`${OFFICE}/students/new`}><i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol</Link>
          </>
        }
      />

      <div className="ofc-print-head" aria-hidden="true">
        <strong>Kampala Junior Academy · {title}</strong>
        <span>{rows.length} pupils ({boys} boys, {girls} girls) · Printed {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Kampala" })}</span>
      </div>

      {streams.length ? (
        <div className="ofc-chips no-print" aria-label="Stream">
          <Link href={base} className={stream ? "" : "is-on"}>Whole class <span>{all.length}</span></Link>
          {streams.map((value) => (
            <Link key={value} href={`${base}?stream=${value}`} className={stream === value ? "is-on" : ""}>
              Stream {value} <span>{all.filter((row) => row.stream === value).length}</span>
            </Link>
          ))}
          {all.some((row) => !row.stream) ? (
            <Link href={`${base}?stream=none`} className={stream === "NONE" ? "is-on" : ""}>No stream <span>{all.filter((row) => !row.stream).length}</span></Link>
          ) : null}
        </div>
      ) : null}

      <div className="dash-grid ofc-grid-wide">
        <div className="dash-col">
          <section className="admin-card ofc-register">
            {rows.length ? <ClassRoster rows={rows} streams={streams} /> : <Empty icon="fa-chalkboard" title="No pupils in this class">Enrol a student or move pupils here from the register.</Empty>}
          </section>
        </div>
        <div className="dash-col no-print">
          <Panel title="Houses" description="Balance across the four houses.">
            <ul className="ofc-health">
              {HOUSES.map((house) => (
                <li key={house}>
                  <Link href={`${OFFICE}/students?class=${code}&house=${house}`}><span>{house}</span><strong>{rows.filter((row) => row.house === house).length}</strong></Link>
                </li>
              ))}
              <li>
                <Link href={`${OFFICE}/students?class=${code}&house=none`}>
                  <span>No house</span>
                  <strong className={rows.some((row) => !row.house) ? "is-warn" : ""}>{rows.filter((row) => !row.house).length}</strong>
                </Link>
              </li>
            </ul>
          </Panel>
          <Panel title="Birthdays" description="In the next 30 days.">
            {birthdays.length ? (
              <ul className="ofc-list">
                {birthdays.slice(0, 8).map((row) => (
                  <li key={row.id}>
                    <span className={`ofc-cake${row.days === 0 ? " is-today" : ""}`}><i className="fa-solid fa-cake-candles" aria-hidden="true" /></span>
                    <div>
                      <Link href={`${OFFICE}/students/${row.id}`}>{row.full_name}</Link>
                      <small>{new Date(`${row.date_of_birth}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</small>
                    </div>
                    <span className="ofc-when">{row.days === 0 ? "Today" : `${row.days}d`}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted">None this month.</p>}
          </Panel>
          <Panel title="Medical" description="Pupils with notes on file.">
            {rows.some((row) => row.medical_notes) ? (
              <ul className="ofc-list">
                {rows.filter((row) => row.medical_notes).map((row) => (
                  <li key={row.id}>
                    <span className="ofc-mono is-med"><i className="fa-solid fa-notes-medical" aria-hidden="true" /></span>
                    <div>
                      <Link href={`${OFFICE}/students/${row.id}?tab=medical`}>{row.full_name}</Link>
                      <small>{row.medical_notes}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted">No medical notes in this class.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
