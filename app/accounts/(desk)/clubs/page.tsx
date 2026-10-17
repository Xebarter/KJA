import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ClubEdit, ClubPayLink, ClubRegister, type ClubConsentRow } from "@/components/accounts/ClubsDesk";
import { notReady } from "@/components/accounts/ui";
import { Empty } from "@/components/office/ui";
import { loadTerms, requireAccounts } from "@/lib/accounts";
import { amount, percent, ugx, ugxShort } from "@/lib/accounts-format";
import { CLUB_CATEGORIES, clubListHref, type ClubListFilters } from "@/lib/clubs";
import { classLabel } from "@/lib/academics";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./clubs.css";

export const metadata = { title: "Clubs" };

const CLUB_FALLBACK = "Games and Sports";

function audienceLabel(section: string | null) {
  if (section === "nursery") return "Nursery";
  if (section === "primary") return "Primary";
  return "All classes";
}

const CATEGORY_ICONS: Record<string, string> = {
  "Games and Sports": "fa-futbol",
  "Art and Entertainment": "fa-palette",
  "Science and Technology": "fa-flask",
  "Travel and Adventure": "fa-compass",
  "Information and Language": "fa-language",
  Religion: "fa-book-open",
};

type ClubRow = {
  id: string;
  title: string;
  category: string | null;
  fee_amount: number | null;
  section: string | null;
  description: string | null;
  active: boolean | null;
  sort_order: number | null;
};

type ConsentRow = { id: string; student_id: string; club_id: string; consented_at: string };
type PaymentRow = { student_id: string; club_id: string; receipt_no: string; amount: number };
type Pupil = { id: string; full_name: string; student_number: string; class_code: string | null; stream: string | null; campus: string | null; photo_path?: string | null };

function listFilters(params: { q?: string; pay?: string; club?: string; class?: string; stream?: string; campus?: string }): ClubListFilters {
  const pay = String(params.pay || "");
  return {
    q: String(params.q || "").trim(),
    pay: pay === "paid" || pay === "unpaid" || pay === "waiting" ? pay : "",
    club: String(params.club || "").trim(),
    classCode: String(params.class || "").trim(),
    stream: String(params.stream || "").trim(),
    campus: String(params.campus || "").trim(),
  };
}

export default async function ClubsOfficePage({ searchParams }: { searchParams: Promise<{ q?: string; pay?: string; club?: string; class?: string; stream?: string; campus?: string }> }) {
  if (!supabaseConfigured()) return notReady("Clubs", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Clubs", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { terms, current, error } = await loadTerms(supabase);
  if (error) return notReady("Clubs", { kind: "schema", message: error });
  const filters = listFilters(await searchParams);
  const pay = filters.pay;

  const clubsQuery = await supabase.from("clubs").select("id, title, category, fee_amount, section, description, active, sort_order").not("guide_no", "is", null).order("sort_order");
  if (clubsQuery.error) return notReady("Clubs", { kind: "schema", message: clubsQuery.error.message });
  const clubs = (clubsQuery.data || []) as ClubRow[];

  const [consentsQuery, paymentsQuery, waitingQuery] = current
    ? await Promise.all([
        supabase.from("club_consents").select("id, student_id, club_id, consented_at").is("withdrawn_at", null).order("consented_at", { ascending: false }),
        supabase.from("club_payments").select("student_id, club_id, receipt_no, amount").eq("term_id", current.id).is("voided_at", null),
        supabase.from("club_collections").select("id, student_id, club_id").eq("term_id", current.id).eq("status", "pending"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  if (consentsQuery.error) return notReady("Clubs", { kind: "schema", message: consentsQuery.error.message });

  const consents = (consentsQuery.data || []) as ConsentRow[];
  const payments = (paymentsQuery.data || []) as PaymentRow[];
  const paid = new Set(payments.map((row) => `${row.student_id}:${row.club_id}`));
  const receiptOf = new Map(payments.map((row) => [`${row.student_id}:${row.club_id}`, row.receipt_no]));
  const waitingRows = (waitingQuery.data || []) as { id: string; student_id: string; club_id: string }[];
  let waitingItems: { collection_id: string; club_id: string }[] = [];
  if (waitingRows.length) {
    const itemsQuery = await supabase.from("club_collection_items").select("collection_id, club_id").in("collection_id", waitingRows.map((row) => row.id));
    if (!itemsQuery.error) waitingItems = (itemsQuery.data || []) as { collection_id: string; club_id: string }[];
  }
  const waiting = new Set(waitingRows.map((row) => `${row.student_id}:${row.club_id}`));
  const studentByCollection = new Map(waitingRows.map((row) => [row.id, row.student_id]));
  for (const item of waitingItems) {
    const studentId = studentByCollection.get(item.collection_id);
    if (studentId) waiting.add(`${studentId}:${item.club_id}`);
  }
  const studentIds = [...new Set(consents.map((row) => row.student_id))];
  let pupilRows: Pupil[] = [];
  if (studentIds.length) {
    const withPhoto = await supabase.from("students").select("id, full_name, student_number, class_code, stream, campus, photo_path").in("id", studentIds);
    if (withPhoto.error && /photo_path/.test(withPhoto.error.message)) {
      const plain = await supabase.from("students").select("id, full_name, student_number, class_code, stream, campus").in("id", studentIds);
      pupilRows = (plain.data || []) as Pupil[];
    } else {
      pupilRows = (withPhoto.data || []) as Pupil[];
    }
  }
  const pupils = new Map(pupilRows.map((pupil) => [pupil.id, pupil]));
  const clubById = new Map(clubs.map((club) => [club.id, club]));

  const rows = consents
    .map((consent) => {
      const pupil = pupils.get(consent.student_id);
      const club = clubById.get(consent.club_id);
      if (!pupil || !club) return null;
      const key = `${consent.student_id}:${consent.club_id}`;
      const status: ClubConsentRow["status"] = paid.has(key) ? "paid" : waiting.has(key) ? "waiting" : "unpaid";
      return {
        id: consent.id,
        studentId: pupil.id,
        studentName: pupil.full_name,
        studentNumber: pupil.student_number,
        classCode: pupil.class_code || "",
        stream: pupil.stream?.trim() || "",
        classLabel: pupil.class_code ? classLabel(pupil.class_code, pupil.stream) : "No class",
        campus: pupil.campus,
        photoPath: pupil.photo_path || null,
        clubId: club.id,
        clubTitle: club.title,
        fee: Number(club.fee_amount) || 0,
        status,
        receiptNo: receiptOf.get(key) || null,
        consentedAt: consent.consented_at,
      };
    })
    .filter((row): row is ClubConsentRow => Boolean(row));
  const paidCount = rows.filter((row) => row.status === "paid").length;
  const unpaidRows = rows.filter((row) => row.status === "unpaid");
  const waitingCount = rows.filter((row) => row.status === "waiting").length;
  const openCount = clubs.filter((club) => club.active).length;
  const collected = payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const stillDue = [...unpaidRows, ...rows.filter((row) => row.status === "waiting")].reduce((sum, row) => sum + row.fee, 0);
  const rate = rows.length ? percent(paidCount, rows.length) : 0;
  const known = new Set<string>(CLUB_CATEGORIES);
  const groups = [
    ...CLUB_CATEGORIES.map((category) => ({ category, clubs: clubs.filter((club) => club.category === category) })),
    { category: "Other", clubs: clubs.filter((club) => !club.category || !known.has(club.category)) },
  ].filter((group) => group.clubs.length);

  return (
    <div className="app-page ofc-page acc-page clb-page">
      <PageHeader
        kicker="Billing"
        icon="fa-puzzle-piece"
        title="Clubs"
        description={current ? <>Parents consent on the portal, then pay the fee for <strong>{current.label}</strong>. A paid amount stays on the receipt even if the fee changes later.</> : "Set the current term before parents can pay."}
      />

      <section className="clb-board" aria-label={current ? `${current.label} club fees` : "Club fees"}>
        <div className="clb-board-main">
          <div className="clb-collect">
            {rows.length ? (
              <span className={`clb-ring${rate === 100 ? " is-done" : ""}`} title={`${rate}% of consents paid`}>
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15" />
                  <circle className="is-value" cx="18" cy="18" r="15" pathLength={100} style={{ "--clb-rate": rate } as React.CSSProperties} />
                </svg>
                <em>{rate}%</em>
              </span>
            ) : null}
            <div>
              <span>{current ? `Collected · ${current.label}` : "Collected"}</span>
              <strong><small>UGX</small> {ugxShort(collected)}</strong>
              <p>
                {rows.length ? (
                  stillDue > 0 ? <>{ugxShort(stillDue)} still to collect from {unpaidRows.length + waitingCount} {unpaidRows.length + waitingCount === 1 ? "consent" : "consents"}</> : <>Every consent for this term is paid</>
                ) : (
                  <>{openCount} {openCount === 1 ? "club is" : "clubs are"} open for parents</>
                )}
              </p>
            </div>
          </div>
          <ul className="clb-figs">
            <li>
              <Link href="#catalogue">
                <span>Open clubs</span>
                <strong>{openCount}</strong>
                <small>{clubs.length} on the guide</small>
              </Link>
            </li>
            <li>
              <ClubPayLink href={`${clubListHref({ ...filters, pay: "" })}#register`} value="" initialPay={pay}>
                <span>Consented</span>
                <strong>{rows.length}</strong>
                <small>{paidCount ? `${paidCount} paid` : "None paid yet"}</small>
              </ClubPayLink>
            </li>
            <li>
              <ClubPayLink href={`${clubListHref({ ...filters, pay: "unpaid" })}#register`} value="unpaid" initialPay={pay} className={unpaidRows.length ? "is-warn" : ""}>
                <span>Not paid</span>
                <strong>{unpaidRows.length}</strong>
                <small>{unpaidRows.length ? ugxShort(unpaidRows.reduce((sum, row) => sum + row.fee, 0)) : "Nothing outstanding"}</small>
              </ClubPayLink>
            </li>
          </ul>
        </div>
        {current && stillDue > 0 ? (
          <div className="clb-due">
            <i className="fa-solid fa-sack-dollar" aria-hidden="true" />
            <p>
              <strong>{ugx(stillDue)}</strong> is still to come in for {current.label}
              {waitingCount ? <>, including {waitingCount} {waitingCount === 1 ? "payment" : "payments"} waiting on a phone</> : null}.
            </p>
            <ClubPayLink href={`${clubListHref({ ...filters, pay: "unpaid" })}#register`} value="unpaid" initialPay={pay} mark={false}>Review unpaid</ClubPayLink>
          </div>
        ) : null}
        {terms.length && !current ? <div className="clb-due"><i className="fa-regular fa-calendar" aria-hidden="true" /><p>Choose a current term under Fee setup before recording payments.</p></div> : null}
      </section>

      <section className="clb-catalogue" id="catalogue">
        <header>
          <h2>Clubs for pupils</h2>
          <p>{clubs.length} {clubs.length === 1 ? "club" : "clubs"}, grouped by interest. Each fee is for this term.</p>
        </header>
        {groups.length ? groups.map((group) => (
          <div className="clb-cat" key={group.category}>
            <h3>
              <i className={`fa-solid ${CATEGORY_ICONS[group.category] || "fa-puzzle-piece"}`} aria-hidden="true" />
              {group.category}
              <span>{group.clubs.length}</span>
            </h3>
            <ul className="clb-grid">
              {group.clubs.map((club) => (
                <li key={club.id}>
                  <article className={`clb-card${club.active ? "" : " is-closed"}`} title={club.description || undefined}>
                    <header>
                      <h4>{club.title}</h4>
                      <span className={`clb-state${club.active ? " is-open" : ""}`}>{club.active ? "Open" : "Closed"}</span>
                    </header>
                    <p className="clb-aud">{audienceLabel(club.section)}</p>
                    <footer>
                      <p className="clb-price">
                        <strong>{amount(Number(club.fee_amount) || 0)}</strong>
                        <span>UGX</span>
                      </p>
                      <ClubEdit club={{
                        id: club.id,
                        title: club.title,
                        category: club.category || CLUB_FALLBACK,
                        fee: Number(club.fee_amount) || 0,
                        section: club.section || "both",
                        description: club.description,
                        active: Boolean(club.active),
                      }} />
                    </footer>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        )) : (
          <Empty icon="fa-folder-open" title="No clubs yet">Run the clubs migration to load the guide.</Empty>
        )}
      </section>

      <section className="ofc-register" id="register">
        <ClubRegister rows={rows} termLabel={current ? current.label : "This term"} canRecord={Boolean(current)} filters={filters} />
      </section>
    </div>
  );
}
