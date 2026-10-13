import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { StudentFiltersBar, StudentTable, type RegisterRow } from "@/components/office/StudentRegister";
import { Empty, MigrationHint, OfficeNotice, Pager } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { OFFICE, className, parseStudentFilters, studentFilterHref, studentStatusInfo, studentsQuery } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Students" };

const COLUMNS = "id, student_number, full_name, preferred_name, sex, age, date_of_birth, class_code, stream, house, campus, status, staff_child, medical_notes, needs_review, family_id, family_code, father_name, father_phone, mother_name, mother_phone, siblings";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Students" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Students" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase } = auth;
  const filters = parseStudentFilters(await searchParams);
  const from = (filters.page - 1) * filters.size;

  const [{ data, count, error }, { data: streamRows }] = await Promise.all([
    studentsQuery(supabase, filters, COLUMNS, { count: "exact" }).range(from, from + filters.size - 1),
    supabase.from("students").select("stream").not("stream", "is", null).eq("status", "active").limit(2000),
  ]);
  if (error) {
    return <OfficeNotice title="Students" heading="The student register could not be loaded"><MigrationHint message={error.message} /></OfficeNotice>;
  }
  const rows = (data || []) as unknown as RegisterRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / filters.size));
  const streams = [...new Set((streamRows || []).map((row) => row.stream as string))];
  const exportHref = studentFilterHref(filters, { page: 1 }, `${OFFICE}/students/export`);

  const scope = [
    filters.status === "all" ? "All students" : `${studentStatusInfo(filters.status).label} students`,
    filters.class ? `in ${className(filters.class)}${filters.stream ? ` ${filters.stream}` : ""}` : filters.stream ? `in stream ${filters.stream}` : "",
    filters.house ? (filters.house === "none" ? "without a house" : `in ${filters.house}`) : "",
    filters.q ? `matching “${filters.q}”` : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Register"
        icon="fa-children"
        title="Students"
        description="Every pupil on the KJA register. Search by name, number, family or parent phone, then open a record or select several to update them together."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${OFFICE}/students/new`}><i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol a student</Link>
            <a className="admin-hero-btn" href={exportHref}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV</a>
          </>
        }
      />

      <section className="admin-card ofc-register">
        <StudentFiltersBar filters={filters} streams={streams} />
        <p className="ofc-scope">
          <strong>{total.toLocaleString("en-GB")}</strong> {scope.charAt(0).toLowerCase() + scope.slice(1)}
        </p>
        {rows.length ? (
          <StudentTable rows={rows} exportHref={exportHref} />
        ) : (
          <Empty icon="fa-face-meh" title="No students found">
            {filters.q ? "Try a shorter search, part of a phone number, or switch the status to Any status." : "No students match these filters."}
          </Empty>
        )}
        <Pager page={filters.page} pages={pages} total={total} from={from} size={filters.size} href={(page) => studentFilterHref(filters, { page })} />
      </section>
    </div>
  );
}
