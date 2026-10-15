import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { ClassRoster, type RosterRow } from "@/components/office/ClassRoster";
import { PrintButton } from "@/components/office/client";
import { BirthdaysCard, MedicalCard, type CarePupil } from "@/components/office/PupilCareCards";
import { Card, Empty, MigrationHint, OfficeNotice } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { studentPhotoUrl } from "@/lib/student-photos";
import { CLASS_AGE, HOUSES, OFFICE, SCHOOL_CLASSES, ageOutlier, daysToBirthday, fetchAll, isClassCode, pick } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: SCHOOL_CLASSES.find((entry) => entry.code === code.toUpperCase())?.name ?? "Class" };
}

const COLUMNS = "id, student_number, full_name, preferred_name, sex, date_of_birth, age, stream, house, medical_notes, panadol_allowed, father_name, father_phone, mother_name, mother_phone, needs_review";

type Row = Omit<RosterRow, "outlier" | "photo_url"> & { photo_path?: string | null };

const HOUSE_TONES: Record<string, string> = { Bongo: "#e07a2c", Eland: "#2f6fd6", Kudu: "#1f9d55", Oryx: "#d1394a" };

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
  const query = await searchParams;
  const stream = pick(query, "stream").toUpperCase().slice(0, 20);
  const q = pick(query, "q").slice(0, 60);
  const supabase = await createClient();
  if (!supabase) return <OfficeNotice title={entry.name} heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;

  const load = (columns: string) =>
    fetchAll<Row>((from, to) =>
      supabase
        .from("student_directory")
        .select(columns)
        .eq("status", "active")
        .eq("class_code", code)
        .order("stream", { nullsFirst: false })
        .order("full_name")
        .range(from, to));

  // The class list loads alongside the access check; row-level security keeps it to office staff.
  const [auth, first] = await Promise.all([
    requireOffice(),
    load(`${COLUMNS}, photo_path`).then((data) => ({ data }), (error: Error) => ({ error })),
  ]);
  if ("error" in auth) return <OfficeNotice title={entry.name} icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  let all: Row[];
  try {
    if ("data" in first) all = first.data;
    else if (first.error.message.includes("photo_path")) all = await load(COLUMNS);
    else throw first.error;
  } catch (error) {
    return <OfficeNotice title={entry.name} heading="This class could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  const streams = [...new Set(all.map((row) => row.stream).filter(Boolean) as string[])].sort();
  const unstreamed = all.filter((row) => !row.stream).length;
  const pupils = stream ? all.filter((row) => (stream === "NONE" ? !row.stream : row.stream === stream)) : all;
  const rows: RosterRow[] = pupils.map(({ photo_path, ...row }) => ({
    ...row,
    photo_url: studentPhotoUrl(row.id, photo_path ?? null),
    outlier: ageOutlier(code, row.date_of_birth),
  }));

  const index = SCHOOL_CLASSES.findIndex((item) => item.code === code);
  const prev = SCHOOL_CLASSES[index - 1];
  const next = SCHOOL_CLASSES[index + 1];
  const boys = rows.filter((row) => row.sex === "M").length;
  const girls = rows.filter((row) => row.sex === "F").length;
  const ages = rows.map((row) => row.age).filter((age): age is number => age !== null);
  const averageAge = ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null;
  const outliers = rows.filter((row) => row.outlier).length;
  const medical = rows.filter((row) => row.medical_notes);
  const noPanadol = rows.filter((row) => row.panadol_allowed === false).length;
  const noHouse = rows.filter((row) => !row.house).length;
  const review = rows.filter((row) => row.needs_review).length;
  const birthdays = rows
    .map((row) => ({ ...row, days: daysToBirthday(row.date_of_birth) }))
    .filter((row) => row.days !== null && row.days <= 30)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  const houseCounts = HOUSES.map((house) => ({ house, count: rows.filter((row) => row.house === house).length }));
  const houseMax = Math.max(1, ...houseCounts.map((item) => item.count), noHouse);

  const exportParams = new URLSearchParams({ class: code });
  if (stream && stream !== "NONE") exportParams.set("stream", stream);
  const base = `${OFFICE}/classes/${code}`;
  const streamLabel = stream ? (stream === "NONE" ? "No stream" : `Stream ${stream}`) : "";
  const title = `${entry.name}${streamLabel ? ` · ${streamLabel}` : ""}`;
  const firstName = (name: string, preferred: string | null) => preferred || name.split(/\s+/).slice(-1)[0];
  const typical = CLASS_AGE[code];
  const showStream = !stream && streams.length > 0;
  const scope = stream ? (stream === "NONE" ? "pupils with no stream" : `stream ${stream}`) : "this class";
  const carePupil = (row: RosterRow): CarePupil => ({
    id: row.id,
    name: row.full_name,
    preferred: row.preferred_name,
    sex: row.sex,
    photo: row.photo_url,
    place: row.stream ? `Stream ${row.stream}` : null,
  });

  const streamTiles = [
    { key: "", label: "Whole class", list: all },
    ...streams.map((value) => ({ key: value, label: `Stream ${value}`, list: all.filter((row) => row.stream === value) })),
    ...(streams.length && unstreamed ? [{ key: "NONE", label: "No stream", list: all.filter((row) => !row.stream) }] : []),
  ];

  const glance: { key: string; label: string; icon: string; value: React.ReactNode; sub?: React.ReactNode; warn?: boolean }[] = [
    { key: "pupils", label: "Pupils", icon: "fa-children", value: rows.length, sub: `${boys} boys · ${girls} girls` },
    {
      key: "age",
      label: "Average age",
      icon: "fa-cake-candles",
      value: averageAge !== null ? `${averageAge.toFixed(1)} years` : "Not recorded",
      sub: outliers ? `${outliers} outside the usual age` : typical !== undefined ? `Usual for ${code}: ${typical}–${typical + 1}` : undefined,
      warn: outliers > 0,
    },
    {
      key: "houses",
      label: "Houses",
      icon: "fa-flag",
      value: `${rows.length - noHouse} placed`,
      sub: noHouse ? `${noHouse} without a house` : rows.length ? "Everyone has a house" : undefined,
      warn: noHouse > 0,
    },
    {
      key: "medical",
      label: "Medical notes",
      icon: "fa-notes-medical",
      value: medical.length || "None",
      sub: noPanadol ? `${noPanadol} not allowed Panadol` : medical.length ? "See the list on the right" : "No health notes",
    },
    {
      key: "birthdays",
      label: "Birthdays",
      icon: "fa-gift",
      value: birthdays.length ? `${birthdays.length} this month` : "None soon",
      sub: birthdays[0]
        ? `${firstName(birthdays[0].full_name, birthdays[0].preferred_name)} ${birthdays[0].days === 0 ? "today" : birthdays[0].days === 1 ? "tomorrow" : `in ${birthdays[0].days} days`}`
        : "In the next 30 days",
    },
    {
      key: "review",
      label: "To review",
      icon: "fa-clipboard-check",
      value: review || "None",
      sub: review ? "Imported details to check" : "All records checked",
      warn: review > 0,
    },
  ];

  return (
    <div className="app-page ofc-page ofc-class-page">
      <nav className="ofc-cls-nav no-print" aria-label="Classes">
        <Link href={`${OFFICE}/classes`} className="app-back"><i className="fa-solid fa-arrow-left" /> Classes</Link>
        <div className="ofc-cls-switch">
          {prev ? (
            <Link href={`${OFFICE}/classes/${prev.code}`} className="ofc-cls-step" aria-label={`Previous class, ${prev.name}`} title={prev.name}>
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </Link>
          ) : <span className="ofc-cls-step is-off" aria-hidden="true"><i className="fa-solid fa-chevron-left" /></span>}
          <ul>
            {SCHOOL_CLASSES.map((item, position) => (
              <li key={item.code} className={position > 0 && item.section !== SCHOOL_CLASSES[position - 1].section ? "is-break" : ""}>
                <Link href={`${OFFICE}/classes/${item.code}`} className={item.code === code ? "is-on" : ""} aria-current={item.code === code ? "page" : undefined} title={item.name}>
                  {item.code}
                </Link>
              </li>
            ))}
          </ul>
          {next ? (
            <Link href={`${OFFICE}/classes/${next.code}`} className="ofc-cls-step" aria-label={`Next class, ${next.name}`} title={next.name}>
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </Link>
          ) : <span className="ofc-cls-step is-off" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></span>}
        </div>
      </nav>

      <PageHeader
        kicker={`${entry.section === "nursery" ? "Nursery" : "Primary"} · ${code}${streamLabel ? ` · ${streamLabel}` : ""}`}
        icon="fa-chalkboard-user"
        title={title}
        description={
          <>
            {all.length} pupil{all.length === 1 ? "" : "s"} in {entry.name}
            {streams.length ? ` across ${streams.length} stream${streams.length === 1 ? "" : "s"}` : ""}.
            {stream ? ` Showing ${rows.length} in ${streamLabel.toLowerCase()}.` : " Open a stream to see its own list."}
          </>
        }
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${OFFICE}/students/new`}><i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol</Link>
            <PrintButton label="Print list" />
            <a className="admin-hero-btn" href={`${OFFICE}/students/export?${exportParams}`}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV</a>
          </>
        }
      />

      <div className="ofc-print-head" aria-hidden="true">
        <strong>Kampala Junior Academy · {title}</strong>
        <span>{rows.length} pupils ({boys} boys, {girls} girls) · Printed {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Kampala" })}</span>
      </div>

      {streams.length ? (
        <nav className="ofc-cls-streams no-print" aria-label="Streams">
          {streamTiles.map((tile) => {
            const on = stream === tile.key;
            const tileBoys = tile.list.filter((row) => row.sex === "M").length;
            const tileGirls = tile.list.filter((row) => row.sex === "F").length;
            const share = tile.list.length ? Math.round((tileBoys / tile.list.length) * 100) : 0;
            return (
              <Link
                key={tile.key || "all"}
                href={tile.key ? `${base}?stream=${tile.key === "NONE" ? "none" : tile.key}` : base}
                scroll={false}
                className={`ofc-cls-stream-tile${on ? " is-on" : ""}${tile.key === "NONE" ? " is-none" : ""}`}
                aria-current={on ? "true" : undefined}
              >
                <span className="ofc-cls-stream-top">
                  <span>{tile.label}</span>
                  <strong>{tile.list.length}</strong>
                </span>
                <span className="ofc-cls-split" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
                <small>{tileBoys} boys · {tileGirls} girls</small>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <dl className="ofc-glance no-print" aria-label="At a glance">
        {glance.map((item) => (
          <div key={item.key} className={item.warn ? "is-warn" : ""}>
            <span className="ofc-glance-icon" aria-hidden="true"><i className={`fa-solid ${item.icon}`} /></span>
            <dt>{item.label}</dt>
            <dd>
              <strong>{item.value}</strong>
              {item.sub ? <small>{item.sub}</small> : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="app-detail-grid ofc-profile-grid ofc-cls-grid">
        <section className="admin-card ofc-card ofc-cls-list" aria-labelledby="class-list">
          <header className="ofc-card-head">
            <span className="ofc-card-icon" aria-hidden="true"><i className="fa-solid fa-list-ol" /></span>
            <h2 id="class-list">{streamLabel ? `${streamLabel} list` : "Class list"}</h2>
            <span className="ofc-card-count">{rows.length}</span>
            <span className="ofc-cls-head-hint no-print"><i className="fa-regular fa-square-check" aria-hidden="true" /> Tick pupils to move them</span>
          </header>
          {rows.length ? (
            <ClassRoster
              key={`${code}-${stream}`}
              rows={rows}
              streams={streams}
              classCode={code}
              showStream={!stream && streams.length > 0}
              initialQuery={q}
              wholeClassHref={stream ? base : null}
            />
          ) : (
            <Empty icon="fa-chalkboard" title={stream ? `No pupils in ${streamLabel.toLowerCase()}` : "No pupils in this class"}>
              Enrol a student or move pupils here from the register.
            </Empty>
          )}
        </section>

        <aside className="app-detail-side no-print">
          <Card title="Houses" icon="fa-flag" action={noHouse ? <Link className="ofc-card-link" href={`${OFFICE}/students?class=${code}&house=none`}>Place {noHouse} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link> : null}>
            <ul className="ofc-cls-houses">
              {houseCounts.map(({ house, count }) => (
                <li key={house}>
                  <Link href={`${OFFICE}/students?class=${code}&house=${house}`}>
                    <span className={`ofc-house is-${house.toLowerCase()}`}>{house}</span>
                    <span className="ofc-cls-bar" aria-hidden="true"><span style={{ width: `${(count / houseMax) * 100}%`, background: HOUSE_TONES[house] }} /></span>
                    <strong>{count}</strong>
                  </Link>
                </li>
              ))}
              {noHouse ? (
                <li className="is-none">
                  <Link href={`${OFFICE}/students?class=${code}&house=none`}>
                    <span className="ofc-house">No house</span>
                    <span className="ofc-cls-bar" aria-hidden="true"><span style={{ width: `${(noHouse / houseMax) * 100}%` }} /></span>
                    <strong>{noHouse}</strong>
                  </Link>
                </li>
              ) : null}
            </ul>
          </Card>

          <BirthdaysCard
            pupils={rows.map((row) => ({ ...carePupil(row), dob: row.date_of_birth }))}
            scope={scope}
            href={`${OFFICE}/birthdays?class=${code}`}
            showPlace={showStream}
          />

          <MedicalCard
            pupils={medical.map((row) => ({ ...carePupil(row), notes: row.medical_notes ?? "", panadol: row.panadol_allowed }))}
            scope={scope}
            href={`${OFFICE}/medical?class=${code}`}
            showPlace={showStream}
          />
        </aside>
      </div>
    </div>
  );
}
