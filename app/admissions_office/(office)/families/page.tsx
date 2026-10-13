import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { Empty, MigrationHint, OfficeNotice, Pager } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { OFFICE, displayPhone, pick, searchNeedle } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Families" };

const PAGE_SIZE = 40;
const SHOWS = [
  { value: "current", label: "With children at KJA" },
  { value: "all", label: "All families" },
  { value: "check", label: "Contacts to check" },
  { value: "large", label: "Three or more children" },
] as const;

type FamilyRow = { id: string; family_code: string; mailing_name: string | null; home_area: string | null };

export default async function FamiliesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Families" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Families" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase } = auth;
  const params = await searchParams;
  const q = searchNeedle(pick(params, "q")).slice(0, 60);
  const show = SHOWS.find((entry) => entry.value === pick(params, "show"))?.value ?? "current";
  const page = Math.max(1, Number.parseInt(pick(params, "page"), 10) || 1);
  const href = (changes: { q?: string; show?: string; page?: number }) => {
    const next = new URLSearchParams();
    const nq = changes.q ?? q;
    const ns = changes.show ?? show;
    const np = changes.page ?? 1;
    if (nq) next.set("q", nq);
    if (ns !== "current") next.set("show", ns);
    if (np > 1) next.set("page", String(np));
    const query = next.toString();
    return `${OFFICE}/families${query ? `?${query}` : ""}`;
  };

  // Narrow down to a set of family ids first when the filter needs other tables.
  let ids: string[] | null = null;
  if (q) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const phoneLike = digits.length >= 6 ? `%${digits.slice(-9)}%` : null;
    const [families, guardians, contacts, kids] = await Promise.all([
      supabase.from("families").select("id").or(`family_code.ilike.${like},mailing_name.ilike.${like},home_area.ilike.${like}`).limit(300),
      supabase.from("guardians").select("family_id").or([`full_name.ilike.${like}`, `email.ilike.${like}`, ...(phoneLike ? [`phone.ilike.${phoneLike}`] : [])].join(",")).limit(300),
      phoneLike ? supabase.from("family_contacts").select("family_id").ilike("value", phoneLike).limit(300) : Promise.resolve({ data: [] }),
      supabase.from("students").select("family_id").ilike("full_name", like).not("family_id", "is", null).limit(300),
    ]);
    if (families.error) {
      return <OfficeNotice title="Families" heading="Families could not be loaded"><MigrationHint message={families.error.message} /></OfficeNotice>;
    }
    ids = [...new Set([
      ...(families.data || []).map((row) => row.id as string),
      ...(guardians.data || []).map((row) => row.family_id as string),
      ...((contacts.data || []) as { family_id: string }[]).map((row) => row.family_id),
      ...(kids.data || []).map((row) => row.family_id as string),
    ])].filter(Boolean);
  }
  if (show === "check") {
    const { data } = await supabase.from("family_contacts").select("family_id").eq("needs_check", true).limit(5000);
    const flagged = new Set((data || []).map((row) => row.family_id as string));
    ids = ids ? ids.filter((id) => flagged.has(id)) : [...flagged];
  }
  if (show === "current" || show === "large") {
    const { data } = await supabase.from("students").select("family_id").eq("status", "active").not("family_id", "is", null).limit(10000);
    const counts = new Map<string, number>();
    for (const row of data || []) counts.set(row.family_id as string, (counts.get(row.family_id as string) ?? 0) + 1);
    const keep = [...counts.entries()].filter(([, count]) => (show === "large" ? count >= 3 : count >= 1)).map(([id]) => id);
    const keepSet = new Set(keep);
    ids = ids ? ids.filter((id) => keepSet.has(id)) : keep;
  }

  const from = (page - 1) * PAGE_SIZE;
  let rows: FamilyRow[] = [];
  let total = 0;
  if (ids === null || ids.length) {
    // Large id lists go in batches to stay inside URL limits.
    if (ids && ids.length > 300) {
      const all: FamilyRow[] = [];
      for (let start = 0; start < ids.length; start += 300) {
        const { data } = await supabase.from("families").select("id, family_code, mailing_name, home_area").in("id", ids.slice(start, start + 300));
        all.push(...((data || []) as FamilyRow[]));
      }
      all.sort((a, b) => (a.mailing_name || a.family_code).localeCompare(b.mailing_name || b.family_code));
      total = all.length;
      rows = all.slice(from, from + PAGE_SIZE);
    } else {
      let query = supabase.from("families").select("id, family_code, mailing_name, home_area", { count: "exact" });
      if (ids) query = query.in("id", ids);
      const { data, count, error } = await query.order("mailing_name", { nullsFirst: false }).order("family_code").range(from, from + PAGE_SIZE - 1);
      if (error) return <OfficeNotice title="Families" heading="Families could not be loaded"><MigrationHint message={error.message} /></OfficeNotice>;
      rows = (data || []) as FamilyRow[];
      total = count ?? 0;
    }
  }

  const pageIds = rows.map((row) => row.id);
  const [{ data: guardians }, { data: kids }, { data: flagged }, { count: familyCount }] = await Promise.all([
    pageIds.length ? supabase.from("guardians").select("family_id, relationship, full_name, phone").in("family_id", pageIds) : Promise.resolve({ data: [] }),
    pageIds.length ? supabase.from("students").select("id, family_id, full_name, class_code, stream, status").in("family_id", pageIds).order("date_of_birth") : Promise.resolve({ data: [] }),
    pageIds.length ? supabase.from("family_contacts").select("family_id").eq("needs_check", true).in("family_id", pageIds) : Promise.resolve({ data: [] }),
    supabase.from("families").select("id", { count: "exact", head: true }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Register"
        icon="fa-people-roof"
        title="Families"
        description={<>{(familyCount ?? 0).toLocaleString("en-GB")} families on file. Brothers and sisters share one family, so a change of phone number only needs making once.</>}
        actions={<Link className="admin-hero-btn is-primary" href={`${OFFICE}/students/new`}><i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol a student</Link>}
      />

      <section className="admin-card ofc-register">
        <div className="ofc-filters">
          <form className="app-search ofc-filter-search" role="search" action={`${OFFICE}/families`}>
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <label className="visually-hidden" htmlFor="family-q">Search families</label>
            <input id="family-q" type="search" name="q" defaultValue={q} placeholder="Family code, parent, phone, email, area or child's name" />
            {show !== "current" ? <input type="hidden" name="show" value={show} /> : null}
          </form>
          <div className="ofc-chips">
            {SHOWS.map((entry) => (
              <Link key={entry.value} href={href({ show: entry.value })} className={show === entry.value ? "is-on" : ""}>{entry.label}</Link>
            ))}
            {q ? <Link className="app-clear" href={href({ q: "" })}><i className="fa-solid fa-xmark" aria-hidden="true" /> Clear search</Link> : null}
          </div>
        </div>
        <p className="ofc-scope"><strong>{total.toLocaleString("en-GB")}</strong> {SHOWS.find((entry) => entry.value === show)?.label.toLowerCase()}{q ? ` matching “${q}”` : ""}</p>

        {rows.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table ofc-table">
              <thead>
                <tr>
                  <th>Family</th>
                  <th>Parents</th>
                  <th>Children</th>
                  <th>Area</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((family) => {
                  const parents = (guardians || []).filter((row) => row.family_id === family.id);
                  const children = (kids || []).filter((row) => row.family_id === family.id);
                  const current = children.filter((row) => row.status === "active");
                  const checks = (flagged || []).filter((row) => row.family_id === family.id).length;
                  return (
                    <tr key={family.id}>
                      <td className="app-col-child">
                        <Link href={`${OFFICE}/families/${family.id}`}>{family.mailing_name || parents.map((row) => row.full_name).join(" & ") || family.family_code}</Link>
                        <small>
                          <span className="ofc-num">{family.family_code}</span>
                          {checks ? <span className="ofc-flag-text"> · {checks} contact{checks === 1 ? "" : "s"} to check</span> : null}
                        </small>
                      </td>
                      <td className="ofc-parents">
                        {parents.length ? parents.map((parent) => (
                          <span key={`${parent.relationship}-${parent.full_name}`}>
                            {parent.full_name}
                            <small>{parent.relationship}{parent.phone ? ` · ${displayPhone(parent.phone)}` : ""}</small>
                          </span>
                        )) : <span className="app-muted">None on file</span>}
                      </td>
                      <td>
                        <ul className="ofc-kids">
                          {children.map((kid) => (
                            <li key={kid.id} className={kid.status === "active" ? "" : "is-gone"}>
                              <Link href={`${OFFICE}/students/${kid.id}`}>{kid.full_name}</Link>
                              <span>{kid.status === "active" ? `${kid.class_code ?? "–"}${kid.stream ? ` ${kid.stream}` : ""}` : kid.status}</span>
                            </li>
                          ))}
                        </ul>
                        {!children.length ? <span className="app-muted">No children</span> : current.length !== children.length ? <small>{current.length} at KJA now</small> : null}
                      </td>
                      <td>{family.home_area ?? <span className="app-muted">–</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-face-meh" title="No families found">
            {q ? "Try part of a phone number, a surname, or switch to All families." : "No families match this filter."}
          </Empty>
        )}
        <Pager page={page} pages={pages} total={total} from={from} size={PAGE_SIZE} href={(next) => href({ page: next })} />
      </section>
    </div>
  );
}
