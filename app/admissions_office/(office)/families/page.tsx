import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { FamilyFinder, FamilyTable, type FamilyListRow } from "@/components/office/FamilyRegister";
import { Empty, MigrationHint, OfficeNotice, Pager } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { OFFICE, cap, everyWord, pick, searchNeedle, searchWords, splitName } from "@/lib/students";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Families" };

const PAGE_SIZE = 40;
const SHOWS = [
  { value: "current", label: "With children at KJA", short: "Current families", icon: "fa-children", tone: "navy", note: "At least one child on the register" },
  { value: "all", label: "All families", short: "All families", icon: "fa-people-roof", tone: "gold", note: "Including families who have left" },
  { value: "large", label: "Three or more children", short: "Three or more children", icon: "fa-people-group", tone: "boy", note: "Three or more children at KJA now" },
  { value: "check", label: "Contacts to check", short: "Contacts to check", icon: "fa-triangle-exclamation", tone: "warn", note: "Imported numbers to confirm" },
] as const;

type FamilyRow = { id: string; family_code: string; mailing_name: string | null; home_area: string | null };

export default async function FamiliesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  if (!supabase || !supabaseConfigured()) {
    return <OfficeNotice title="Families" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
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

  // The search matches names word by word, in any order: "Mary Kato" finds Kato Mary.
  const words = searchWords(q);
  const like = `%${q}%`;
  const digits = q.replace(/\D/g, "");
  const phoneLike = digits.length >= 6 ? `%${digits.slice(-9)}%` : null;

  // The tile counts and the view filters come from the same two small queries, run alongside the
  // access check and the search; row-level security keeps the data to office staff.
  const [auth, activeKids, checkRows, familyTotal, found] = await Promise.all([
    requireOffice(),
    supabase.from("students").select("family_id").eq("status", "active").not("family_id", "is", null).limit(10000),
    supabase.from("family_contacts").select("family_id").eq("needs_check", true).limit(5000),
    supabase.from("families").select("id", { count: "exact", head: true }),
    q && words.length
      ? Promise.all([
          supabase.from("families").select("id").or([`family_code.ilike.${like}`, `home_area.ilike.${like}`, everyWord(words, ["mailing_name"])].join(",")).limit(300),
          supabase.from("guardians").select("family_id").or([everyWord(words, ["full_name"]), `email.ilike.${like}`, ...(phoneLike ? [`phone.ilike.${phoneLike}`] : [])].join(",")).limit(300),
          phoneLike ? supabase.from("family_contacts").select("family_id").ilike("value", phoneLike).limit(300) : Promise.resolve({ data: [], error: null }),
          supabase.from("students").select("family_id").or(everyWord(words, ["full_name", "preferred_name"])).not("family_id", "is", null).limit(300),
        ])
      : Promise.resolve(null),
  ]);
  if ("error" in auth) return <OfficeNotice title="Families" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  if (activeKids.error) {
    return <OfficeNotice title="Families" heading="Families could not be loaded"><MigrationHint message={activeKids.error.message} /></OfficeNotice>;
  }

  const childCounts = new Map<string, number>();
  for (const row of activeKids.data || []) childCounts.set(row.family_id as string, (childCounts.get(row.family_id as string) ?? 0) + 1);
  const currentIds = [...childCounts.keys()];
  const largeIds = [...childCounts.entries()].filter(([, count]) => count >= 3).map(([id]) => id);
  const checkIds = [...new Set((checkRows.data || []).map((row) => row.family_id as string))];
  const counts: Record<string, number> = {
    current: currentIds.length,
    all: familyTotal.count ?? 0,
    large: largeIds.length,
    check: checkIds.length,
  };

  let ids: string[] | null = null;
  if (found) {
    const [families, guardians, contacts, kids] = found;
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
  const viewIds = show === "current" ? currentIds : show === "large" ? largeIds : show === "check" ? checkIds : null;
  if (viewIds) {
    const keep = new Set(viewIds);
    ids = ids ? ids.filter((id) => keep.has(id)) : viewIds;
  }

  const from = (page - 1) * PAGE_SIZE;
  let rows: FamilyRow[] = [];
  let total = 0;
  if (ids === null || ids.length) {
    // Large id lists go in batches to stay inside URL limits.
    if (ids && ids.length > 300) {
      const batches = [];
      for (let start = 0; start < ids.length; start += 300) {
        batches.push(supabase.from("families").select("id, family_code, mailing_name, home_area").in("id", ids.slice(start, start + 300)));
      }
      const all = (await Promise.all(batches)).flatMap((result) => (result.data || []) as FamilyRow[]);
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
  const [{ data: guardians }, { data: kids }] = await Promise.all([
    pageIds.length ? supabase.from("guardians").select("family_id, relationship, full_name, phone").in("family_id", pageIds) : Promise.resolve({ data: [] }),
    pageIds.length ? supabase.from("students").select("id, family_id, full_name, given_names, class_code, stream, status").in("family_id", pageIds).order("date_of_birth") : Promise.resolve({ data: [] }),
  ]);
  const checksByFamily = new Map<string, number>();
  for (const row of checkRows.data || []) checksByFamily.set(row.family_id as string, (checksByFamily.get(row.family_id as string) ?? 0) + 1);

  const list: FamilyListRow[] = rows.map((family) => {
    const parents = (guardians || [])
      .filter((row) => row.family_id === family.id)
      .sort((a, b) => String(a.relationship).localeCompare(String(b.relationship)))
      .map((row) => ({ role: cap(String(row.relationship)), name: row.full_name as string, phone: row.phone as string | null }));
    const children = (kids || [])
      .filter((row) => row.family_id === family.id)
      .map((row) => ({
        id: row.id as string,
        full: row.full_name as string,
        given: ((row.given_names as string | null) || splitName(row.full_name as string).given || (row.full_name as string)).split(/\s+/)[0],
        cls: row.class_code ? `${row.class_code}${row.stream ? ` ${row.stream}` : ""}` : null,
        status: row.status as string,
      }));
    return {
      id: family.id,
      code: family.family_code,
      name: family.mailing_name || parents.map((row) => row.name).join(" & ") || `Family ${family.family_code}`,
      area: family.home_area,
      checks: checksByFamily.get(family.id) ?? 0,
      parents,
      children,
      current: children.filter((row) => row.status === "active").length,
    };
  });

  const view = SHOWS.find((entry) => entry.value === show) ?? SHOWS[0];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Register"
        icon="fa-people-roof"
        title="Families"
        description={<>{counts.all.toLocaleString("en-GB")} families on file. Brothers and sisters share one family, so a change of phone number only needs making once.</>}
        actions={<Link className="admin-hero-btn is-primary" href={`${OFFICE}/students/new`}><i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol a student</Link>}
      />

      <nav className="ofc-reg-summary ofc-fam-summary" aria-label="Family views">
        {SHOWS.map((entry) => {
          const on = show === entry.value;
          const tone = entry.value === "check" && !counts.check ? "ok" : entry.tone;
          return (
            <Link
              key={entry.value}
              href={href({ show: entry.value })}
              className={`ofc-reg-tile is-${tone}${on ? " is-on" : ""}`}
              aria-current={on ? "true" : undefined}
              scroll={false}
            >
              <span className="ofc-reg-tile-icon" aria-hidden="true"><i className={`fa-solid ${entry.icon}`} /></span>
              <span className="ofc-reg-tile-body">
                <span className="ofc-reg-tile-label">{entry.short}</span>
                <strong>{counts[entry.value].toLocaleString("en-GB")}</strong>
                <small>{entry.value === "check" && !counts.check ? "Every contact is confirmed" : entry.note}</small>
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="admin-card ofc-register" aria-labelledby="family-results">
        <FamilyFinder q={q} show={show} showLabel={view.label} />

        <header className="ofc-reg-results">
          <div>
            <h2 id="family-results">{total.toLocaleString("en-GB")} {total === 1 ? "family" : "families"}</h2>
            <p>{view.label}{q ? ` · matching “${q}”` : ""}</p>
          </div>
          {list.length ? <p className="ofc-reg-hint"><i className="fa-regular fa-hand-pointer" aria-hidden="true" /> Open a family to edit parents, contacts and address</p> : null}
        </header>

        {list.length ? (
          <FamilyTable rows={list} />
        ) : (
          <Empty icon="fa-face-meh" title="No families found">
            {q ? "Try part of a phone number, a surname, or switch to All families." : "No families match this view."}
          </Empty>
        )}
        <Pager page={page} pages={pages} total={total} from={from} size={PAGE_SIZE} href={(next) => href({ page: next })} />
      </section>
    </div>
  );
}
