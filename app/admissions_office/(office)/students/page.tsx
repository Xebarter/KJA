import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { StudentFinder, StudentTable, type RegisterRow } from "@/components/office/StudentRegister";
import { Empty, LoadErrorNotice, OfficeNotice, Pager } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { studentPhotoUrl } from "@/lib/student-photos";
import {
  OFFICE,
  STREAMS,
  className,
  exactCount,
  loadStudentRegisterTiles,
  parseStudentFilters,
  studentFilterHref,
  studentStatusInfo,
  studentsQuery,
  type StudentFilters,
} from "@/lib/students";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Students" };
export const dynamic = "force-dynamic";

const COLUMNS = "id, student_number, full_name, preferred_name, sex, age, date_of_birth, class_code, stream, house, campus, status, staff_child, medical_notes, needs_review, family_id, family_code, father_name, father_phone, mother_name, mother_phone, siblings, photo_path";

type Tile = {
  key: string;
  label: string;
  icon: string;
  tone: string;
  count: number;
  note: string;
  on: boolean;
  href: string;
};

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  if (!supabase || !supabaseConfigured()) {
    return <OfficeNotice title="Students" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Students" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;

  const parsedFilters = parseStudentFilters(await searchParams);
  const filters =
    !parsedFilters.campus || auth.campuses.some((campus) => campus === parsedFilters.campus)
      ? parsedFilters
      : { ...parsedFilters, campus: "" };
  const from = (filters.page - 1) * filters.size;
  const campusScope = { campuses: auth.campuses };

  // Tiles ignore search / sort / page / quick toggles; cached RPC is keyed on this scope only.
  const tileScope = {
    status: filters.status,
    section: filters.section,
    class: filters.class,
    stream: filters.stream,
    house: filters.house,
    campus: filters.campus,
    campuses: auth.campuses,
  };

  const [{ data, count, error }, tilesCounts] = await Promise.all([
    studentsQuery(supabase, filters, COLUMNS, { count: "exact", ...campusScope }).range(from, from + filters.size - 1),
    loadStudentRegisterTiles(supabase, tileScope),
  ]);
  if (error) {
    // Until 0013_student_photos.sql has run there is no photo column; show the register without photos.
    if (/photo_path/.test(error.message)) {
      const fallback = await studentsQuery(
        supabase,
        filters,
        COLUMNS.replace(", photo_path", ""),
        { count: "exact", ...campusScope },
      ).range(from, from + filters.size - 1);
      if (fallback.error) {
        return <LoadErrorNotice title="Students" message={fallback.error.message} fallbackHeading="The student register could not be loaded" />;
      }
      return renderRegister({
        filters,
        from,
        rows: (fallback.data || []) as unknown as RegisterRow[],
        total: exactCount(fallback.count),
        tilesCounts,
        campuses: auth.campuses,
      });
    }
    return <LoadErrorNotice title="Students" message={error.message} fallbackHeading="The student register could not be loaded" />;
  }

  return renderRegister({
    filters,
    from,
    rows: (data || []) as unknown as RegisterRow[],
    total: exactCount(count),
    tilesCounts,
    campuses: auth.campuses,
  });
}

function renderRegister({
  filters,
  from,
  rows,
  total,
  tilesCounts,
  campuses,
}: {
  filters: StudentFilters;
  from: number;
  rows: RegisterRow[];
  total: number;
  tilesCounts: Awaited<ReturnType<typeof loadStudentRegisterTiles>>;
  campuses: string[];
}) {
  for (const row of rows) row.photo_url = studentPhotoUrl(row.id, row.photo_path ?? null);
  const pages = Math.max(1, Math.ceil(total / filters.size));
  const streams = [...new Set([
    ...STREAMS,
    ...rows.map((row) => row.stream).filter((stream): stream is string => Boolean(stream)),
  ])];
  const exportHref = studentFilterHref(filters, { page: 1 }, `${OFFICE}/students/export`);
  const sheetHref = studentFilterHref(filters, { page: 1 }, `${OFFICE}/students/sheet`);
  const returnHref = studentFilterHref(filters, { page: filters.page });

  const statusLabel = filters.status === "all" ? "" : studentStatusInfo(filters.status).label.toLowerCase();
  const noun = (n: number) => `${statusLabel ? `${statusLabel} ` : ""}student${n === 1 ? "" : "s"}`;
  const scope = [
    filters.class ? `in ${className(filters.class)}${filters.stream ? `, stream ${filters.stream}` : ""}` : filters.stream ? `in stream ${filters.stream}` : "",
    filters.campus ? `at ${filters.campus}` : "",
    !filters.class && filters.section ? `in the ${filters.section} section` : "",
    filters.house ? (filters.house === "none" ? "without a house" : `in ${filters.house} house`) : "",
    filters.sex === "M" ? "boys only" : filters.sex === "F" ? "girls only" : "",
    filters.staff ? "staff children" : "",
    filters.medical ? "with medical notes" : "",
    filters.review ? "needing review" : "",
    filters.q ? `matching “${filters.q}”` : "",
  ].filter(Boolean).join(" · ");

  const base = tilesCounts.total;
  const share = (n: number) => (base ? `${Math.round((n / base) * 100)}% of ${base.toLocaleString("en-GB")}` : "None in view");
  const quickOff = !filters.sex && !filters.staff && !filters.medical && !filters.review;
  const { boys: boysCount, girls: girlsCount, medical: medicalCount, staff: staffCount, review: reviewCount } = tilesCounts;
  const tiles: Tile[] = [
    {
      key: "all", label: statusLabel ? `${statusLabel[0].toUpperCase()}${statusLabel.slice(1)} students` : "All students", icon: "fa-children", tone: "navy",
      count: base, note: !quickOff ? "Show everyone in this view" : "On the register in this view", on: quickOff,
      href: studentFilterHref(filters, { sex: "", staff: false, medical: false, review: false }),
    },
    {
      key: "boys", label: "Boys", icon: "fa-person", tone: "boy", count: boysCount, note: share(boysCount), on: filters.sex === "M",
      href: studentFilterHref(filters, { sex: filters.sex === "M" ? "" : "M" }),
    },
    {
      key: "girls", label: "Girls", icon: "fa-person-dress", tone: "girl", count: girlsCount, note: share(girlsCount), on: filters.sex === "F",
      href: studentFilterHref(filters, { sex: filters.sex === "F" ? "" : "F" }),
    },
    {
      key: "medical", label: "Medical notes", icon: "fa-notes-medical", tone: "med", count: medicalCount,
      note: medicalCount ? "Allergies and conditions on file" : "No medical notes", on: filters.medical,
      href: studentFilterHref(filters, { medical: !filters.medical }),
    },
    {
      key: "staff", label: "Staff children", icon: "fa-id-badge", tone: "gold", count: staffCount,
      note: staffCount ? "Children of KJA staff" : "No staff children", on: filters.staff,
      href: studentFilterHref(filters, { staff: !filters.staff }),
    },
    {
      key: "review", label: "Needs review", icon: "fa-triangle-exclamation", tone: reviewCount ? "warn" : "ok", count: reviewCount,
      note: reviewCount ? "Records with details to check" : "Every record is complete", on: filters.review,
      href: studentFilterHref(filters, { review: !filters.review }),
    },
  ];

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Register"
        icon="fa-children"
        title="Students"
        description="Every pupil on the KJA register. Search by name, number, family or parent phone, then open a record or select several to update them together."
        actions={
          <Link className="admin-hero-btn is-primary" href={`${OFFICE}/students/new`}>
            <i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol a student
          </Link>
        }
      />

      <nav className="ofc-reg-summary" aria-label="Register summary and quick filters">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className={`ofc-reg-tile is-${tile.tone}${tile.on ? " is-on" : ""}`}
            aria-current={tile.on ? "true" : undefined}
            scroll={false}
          >
            <span className="ofc-reg-tile-icon" aria-hidden="true"><i className={`fa-solid ${tile.icon}`} /></span>
            <span className="ofc-reg-tile-body">
              <span className="ofc-reg-tile-label">{tile.label}</span>
              <strong>{tile.count.toLocaleString("en-GB")}</strong>
              <small>{tile.note}</small>
            </span>
          </Link>
        ))}
      </nav>

      <section className="admin-card ofc-register" aria-labelledby="register-results">
        <StudentFinder filters={filters} streams={streams} campuses={campuses} />

        <header className="ofc-reg-results">
          <div>
            <h2 id="register-results">
              {total.toLocaleString("en-GB")} {noun(total)}
            </h2>
            <p>{scope ? scope.charAt(0).toUpperCase() + scope.slice(1) : "Showing the whole register"}</p>
          </div>
          {rows.length ? (
            <p className="ofc-reg-hint">
              <i className="fa-regular fa-square-check" aria-hidden="true" /> Tick students to move, update or export several at once
            </p>
          ) : null}
        </header>

        {rows.length ? (
          <StudentTable rows={rows} exportHref={exportHref} sheetHref={sheetHref} returnHref={returnHref} />
        ) : (
          <Empty icon="fa-face-meh" title="No students found">
            {filters.q
              ? "Try a shorter search, part of a phone number, or set the status to Any status."
              : "No students match these filters. Remove a filter above to widen the search."}
          </Empty>
        )}
        <Pager page={filters.page} pages={pages} total={total} from={from} size={filters.size} href={(page) => studentFilterHref(filters, { page })} />
      </section>
    </div>
  );
}
