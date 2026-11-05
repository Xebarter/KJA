import Link from "next/link";
import { notFound } from "next/navigation";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { ClubEdit } from "@/components/clubs/ClubsDesk";
import { AddPatronForm, AddScheduleForm, RemoveLeaderButton, RemoveScheduleButton, CreateSessionForm } from "@/components/clubs/ClubOps";
import { clubsNotReady } from "@/components/clubs/ui";
import { StudentFace } from "@/components/StudentFace";
import { loadTerms } from "@/lib/accounts";
import { amount, day, methodInfo, ugxShort } from "@/lib/accounts-format";
import { requireClubs } from "@/lib/clubs-access";
import { clubListHref, sectionLabel } from "@/lib/clubs";
import { audienceLabel, CATEGORY_ICONS, loadConsentRegister } from "@/lib/clubs-desk";
import { CLUBS_BASE, WEEKDAY_LABELS } from "@/lib/clubs-nav";
import { displayPhone, isUuid, telHref } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

function patronRoleLabel(role: string | null | undefined) {
  if (role === "assistant") return "Assistant";
  return "Patron";
}

export const metadata = { title: "Club" };

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return clubsNotReady("Club", "config");
  const auth = await requireClubs("catalogue");
  if ("error" in auth) return clubsNotReady("Club", "auth", auth.error);
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { current, error: termError } = await loadTerms(auth.supabase);
  if (termError) return clubsNotReady("Club", "schema", termError);

  const { data: club } = await auth.supabase
    .from("clubs")
    .select("id, title, category, fee_amount, section, description, meeting, campus, active, guide_no")
    .eq("id", id)
    .maybeSingle();
  if (!club) notFound();

  const pack = await loadConsentRegister(auth.supabase, current?.id ?? null, auth.campuses, true);
  const roster = pack.rows.filter((row) => row.clubId === id && !row.withdrawnAt);
  const withdrawn = pack.rows.filter((row) => row.clubId === id && row.withdrawnAt);
  const paidCount = roster.filter((row) => row.status === "paid").length;
  const unpaid = roster.filter((row) => row.status === "unpaid");
  const waitingCount = roster.filter((row) => row.status === "waiting").length;
  const fee = Number(club.fee_amount) || 0;
  const expected = roster.reduce((sum, row) => sum + row.fee, 0);
  const unpaidAmount = unpaid.reduce((sum, row) => sum + row.fee, 0);

  const [{ data: paymentsRaw }, { data: waiting }, leadersRes, schedulesRes, sessionsRes, staffRes] = await Promise.all([
    current
      ? auth.supabase
          .from("club_payments")
          .select("id, receipt_no, amount, method, source, paid_on, student_id, voided_at")
          .eq("club_id", id)
          .eq("term_id", current.id)
          .order("paid_on", { ascending: false })
      : Promise.resolve({ data: [] }),
    current
      ? auth.supabase.from("club_collections").select("id, student_id, status, created_at, phone").eq("club_id", id).eq("term_id", current.id).eq("status", "pending")
      : Promise.resolve({ data: [] }),
    auth.supabase.from("club_leaders").select("id, role, profile_id, phone, active").eq("club_id", id).eq("active", true),
    auth.supabase
      .from("club_schedules")
      .select("id, weekday, start_time, end_time, venue, campus, notes, active")
      .eq("club_id", id)
      .eq("active", true)
      .order("weekday"),
    auth.supabase.from("club_sessions").select("id, held_on, venue").eq("club_id", id).order("held_on", { ascending: false }).limit(12),
    auth.supabase.from("profiles").select("id, full_name, email, phone, role").in("role", ["admin", "admissions", "accounts", "academics", "library", "store", "clubs", "officer", "staff"]).order("full_name").limit(400),
  ]);

  const leadersPack =
    leadersRes.error && /phone/i.test(leadersRes.error.message)
      ? await auth.supabase.from("club_leaders").select("id, role, profile_id, active").eq("club_id", id).eq("active", true)
      : leadersRes;
  const schemaHint = [leadersPack.error?.message, schedulesRes.error?.message, sessionsRes.error?.message].find((msg) => msg && /club_leaders|club_schedules|club_sessions|schema cache|does not exist/i.test(msg));
  const payments = (paymentsRaw || []).filter((row) => !row.voided_at);
  const collected = payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const leaders = leadersPack.data || [];
  const schedules = schedulesRes.data || [];
  const sessions = sessionsRes.data || [];
  const staff = (staffRes.data || []).map((row) => ({
    id: row.id as string,
    name: (row.full_name as string)?.trim() || (row.email as string) || "Staff",
    phone: (row.phone as string | null) || null,
  }));
  const staffById = new Map(staff.map((row) => [row.id, row]));
  const pupilById = new Map(roster.map((row) => [row.studentId, row]));

  const category = club.category || "Other";
  const icon = CATEGORY_ICONS[category] || "fa-puzzle-piece";
  const editClub = {
    id: club.id,
    title: club.title,
    category,
    fee,
    section: club.section || "both",
    description: club.description,
    meeting: club.meeting,
    campus: club.campus,
    active: Boolean(club.active),
  };
  const printHref = `${CLUBS_BASE}/roll/pdf?clubs=${id}`;
  const metaBits = [
    sectionLabel(club.section),
    audienceLabel(club.section),
    club.meeting,
    club.campus,
    club.guide_no ? `Guide #${club.guide_no}` : null,
  ].filter(Boolean);

  return (
    <div className="app-page ofc-page clubs-page clubs-detail-page">
      <ClubsPageHeader
        kicker="Catalogue"
        icon={icon}
        title={club.title}
        description={metaBits.join(" · ")}
        actions={
          <>
            <ClubEdit club={editClub} className="clubs-head-btn" />
            <a className="clubs-head-btn is-primary" href={printHref} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-print" aria-hidden="true" /> Print register
            </a>
            <Link className="clubs-head-btn" href={clubListHref({ club: id })}>
              Register
            </Link>
            <Link className="clubs-head-btn" href={`${CLUBS_BASE}/catalogue`}>
              All clubs
            </Link>
          </>
        }
      />

      <div className="clubs-ov-kpis clubs-detail-kpis">
        <div className="clubs-ov-kpi">
          <span>Term fee</span>
          <strong>
            <small>UGX</small>
            {amount(fee)}
          </strong>
          <small>{current ? current.label : "Per consented learner"}</small>
        </div>
        <div className={`clubs-ov-kpi${roster.length ? " is-ok" : ""}`}>
          <span>Members</span>
          <strong>{roster.length}</strong>
          <small>
            {paidCount} paid{waitingCount ? ` · ${waitingCount} waiting` : ""}
          </small>
        </div>
        <div className={`clubs-ov-kpi${unpaid.length ? " is-warn" : ""}`}>
          <span>Not paid</span>
          <strong>{unpaid.length}</strong>
          <small>{unpaid.length ? ugxShort(unpaidAmount) : "Nothing outstanding"}</small>
        </div>
        <div className={`clubs-ov-kpi${collected ? " is-ok" : ""}`}>
          <span>Collected</span>
          <strong>
            <small>UGX</small>
            {ugxShort(collected)}
          </strong>
          <small>{expected ? `${ugxShort(collected)} of ${ugxShort(expected)}` : "No expected fees yet"}</small>
        </div>
      </div>

      <section className="clubs-detail-hero" aria-label="Club details">
        <div className="clubs-detail-hero-main">
          <span className={`clubs-detail-badge${club.active ? " is-open" : " is-closed"}`}>
            {club.active ? "Open for parents" : "Closed"}
          </span>
          <div className="clubs-detail-cat">
            <i className={`fa-solid ${icon}`} aria-hidden="true" />
            <span>{category}</span>
          </div>
          {club.description ? <p>{club.description}</p> : <p className="is-empty">No description on the parent guide yet.</p>}
          <ul className="clubs-detail-meta">
            {club.meeting ? (
              <li>
                <i className="fa-solid fa-clock" aria-hidden="true" />
                {club.meeting}
              </li>
            ) : null}
            {club.campus ? (
              <li>
                <i className="fa-solid fa-location-dot" aria-hidden="true" />
                {club.campus}
              </li>
            ) : null}
            <li>
              <i className="fa-solid fa-users" aria-hidden="true" />
              {audienceLabel(club.section)}
            </li>
          </ul>
        </div>
        <div className="clubs-detail-hero-side">
          <a className="clubs-detail-action" href={printHref} target="_blank" rel="noreferrer">
            <span className="clubs-ov-portal-icon" aria-hidden="true">
              <i className="fa-solid fa-print" />
            </span>
            <span>
              <strong>Print register</strong>
              <small>Members with expected and collected totals</small>
            </span>
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
          </a>
          <Link className="clubs-detail-action" href={clubListHref({ club: id })}>
            <span className="clubs-ov-portal-icon" aria-hidden="true">
              <i className="fa-solid fa-clipboard-list" />
            </span>
            <span>
              <strong>Open on Register</strong>
              <small>Filter, withdraw, or desk consent</small>
            </span>
            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {schemaHint ? (
        <div className="clubs-notice">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h2>Ops tables not ready</h2>
            <p>
              Apply <code>0067_clubs_desk.sql</code> and <code>0068_club_patrons.sql</code> to enable patrons, schedules, and attendance.
            </p>
          </div>
        </div>
      ) : null}

      <div className="clubs-detail-grid">
        <section className="clubs-detail-panel" aria-label="Roster">
          <header>
            <div>
              <h2>Roster</h2>
              <p>{current ? current.label : "Open consents"} · paid and unpaid</p>
            </div>
            <a className="clubs-ov-link" href={printHref} target="_blank" rel="noreferrer">
              Print <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
            </a>
          </header>
          {roster.length ? (
            <div className="clubs-detail-table-wrap">
              <table className="clubs-detail-table">
                <thead>
                  <tr>
                    <th scope="col">Pupil</th>
                    <th scope="col">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Pupil">
                        <span className="clubs-reg-who">
                          <StudentFace className="clubs-reg-face" id={row.studentId} name={row.studentName} photoPath={row.photoPath} />
                          <span>
                            <strong className="clubs-reg-name">{row.studentName}</strong>
                            <small>{[row.studentNumber, row.classLabel, row.campus].filter(Boolean).join(" · ")}</small>
                          </span>
                        </span>
                      </td>
                      <td data-label="Payment">
                        {row.status === "paid" ? (
                          <span className="clubs-reg-pay is-paid">
                            <i className="fa-solid fa-circle-check" aria-hidden="true" /> Paid
                            {row.receiptNo ? <small>{row.receiptNo}</small> : null}
                          </span>
                        ) : null}
                        {row.status === "waiting" ? (
                          <span className="clubs-reg-pay is-waiting">
                            <i className="fa-solid fa-mobile-screen" aria-hidden="true" /> Waiting
                          </span>
                        ) : null}
                        {row.status === "unpaid" ? <span className="clubs-reg-pay is-unpaid">Not paid</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="clubs-reg-empty">
              <span className="clubs-ov-portal-icon" aria-hidden="true">
                <i className="fa-solid fa-handshake" />
              </span>
              <strong>No open consents</strong>
              <p>Parents consent on the portal, or use desk consent on the register.</p>
            </div>
          )}
          {withdrawn.length ? (
            <p className="clubs-detail-note">
              {withdrawn.length} withdrawn consent{withdrawn.length === 1 ? "" : "s"}. See{" "}
              <Link href={clubListHref({ club: id, withdrawn: "1" })}>Register → Withdrawn</Link>.
            </p>
          ) : null}
        </section>

        <section className="clubs-detail-panel" aria-label="Fee history">
          <header>
            <div>
              <h2>Fee history</h2>
              <p>{current ? current.label : "Current term"} receipts</p>
            </div>
            <Link className="clubs-ov-link" href={`${CLUBS_BASE}/receipts`}>
              All receipts <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </Link>
          </header>
          {payments.length ? (
            <div className="clubs-detail-table-wrap">
              <table className="clubs-detail-table">
                <thead>
                  <tr>
                    <th scope="col">Receipt</th>
                    <th scope="col">Pupil</th>
                    <th scope="col">Method</th>
                    <th scope="col" className="is-num">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => {
                    const pupil = pupilById.get(row.student_id as string);
                    return (
                      <tr key={row.id as string}>
                        <td data-label="Receipt">
                          <strong>{row.receipt_no as string}</strong>
                          <small>{day(row.paid_on as string)}</small>
                        </td>
                        <td data-label="Pupil">{pupil?.studentName || "Pupil"}</td>
                        <td data-label="Method">
                          {methodInfo(String(row.method)).label}
                          <small>{String(row.source)}</small>
                        </td>
                        <td data-label="Amount" className="is-num">
                          <strong>{amount(Number(row.amount) || 0)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="clubs-reg-empty">
              <span className="clubs-ov-portal-icon" aria-hidden="true">
                <i className="fa-solid fa-receipt" />
              </span>
              <strong>No receipts yet</strong>
              <p>Club payments for this term will appear here.</p>
            </div>
          )}

          {(waiting || []).length ? (
            <div className="clubs-detail-waiting">
              <h3>Waiting mobile money</h3>
              <ul>
                {(waiting || []).map((row) => (
                  <li key={row.id as string}>
                    <span>{pupilById.get(row.student_id as string)?.studentName || "Pupil"}</span>
                    <small>{row.phone as string}</small>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <div className="clubs-detail-grid">
        <section className="clubs-detail-panel" aria-label="Patrons">
          <header>
            <div>
              <h2>Patrons</h2>
              <p>Staff who patron this club, with a contact phone</p>
            </div>
          </header>
          {leaders.length ? (
            <ul className="clubs-detail-people">
              {leaders.map((row) => {
                const person = staffById.get(row.profile_id as string);
                const name = person?.name || "Staff";
                const phone = String((row as { phone?: string | null }).phone || person?.phone || "").trim();
                const call = telHref(phone);
                return (
                  <li key={row.id as string}>
                    <span className="clubs-detail-person-face" aria-hidden="true">
                      {name.slice(0, 1)}
                    </span>
                    <span className="clubs-detail-person-copy">
                      <strong>{name}</strong>
                      <small>
                        {patronRoleLabel(row.role as string)}
                        {phone ? (
                          <>
                            {" · "}
                            {call ? (
                              <a className="clubs-detail-phone" href={call}>
                                {displayPhone(phone) || phone}
                              </a>
                            ) : (
                              displayPhone(phone) || phone
                            )}
                          </>
                        ) : (
                          " · No phone yet"
                        )}
                      </small>
                    </span>
                    <RemoveLeaderButton id={row.id as string} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="clubs-detail-empty">No patrons yet.</p>
          )}
          <div className="clubs-detail-form-block">
            <AddPatronForm clubId={id} staff={staff} />
          </div>
        </section>

        <section className="clubs-detail-panel" aria-label="Weekly schedule">
          <header>
            <div>
              <h2>Weekly schedule</h2>
              <p>Used on the printable weekly timetable</p>
            </div>
          </header>
          {schedules.length ? (
            <ul className="clubs-detail-schedule">
              {schedules.map((row) => (
                <li key={row.id as string}>
                  <span className="clubs-detail-day">{WEEKDAY_LABELS[row.weekday as number] || "Day"}</span>
                  <span className="clubs-detail-slot">
                    <strong>
                      {String(row.start_time).slice(0, 5)}–{String(row.end_time).slice(0, 5)}
                    </strong>
                    <small>{[row.venue, row.campus].filter(Boolean).join(" · ") || "No venue set"}</small>
                  </span>
                  <RemoveScheduleButton id={row.id as string} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="clubs-detail-empty">No weekly slots yet.</p>
          )}
          <div className="clubs-detail-form-block">
            <AddScheduleForm clubId={id} />
          </div>
        </section>
      </div>

      <section className="clubs-detail-panel" aria-label="Meetings">
        <header>
          <div>
            <h2>Meetings</h2>
            <p>Recent meetings and attendance</p>
          </div>
          <Link className="clubs-ov-link" href={`${CLUBS_BASE}/timetable?club=${id}`}>
            TimeTable <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </Link>
        </header>
        {sessions.length ? (
          <ul className="clubs-detail-sessions">
            {sessions.map((row) => (
              <li key={row.id as string}>
                <Link href={`${CLUBS_BASE}/timetable/${row.id}`}>
                  <span className="clubs-ov-portal-icon" aria-hidden="true">
                    <i className="fa-solid fa-calendar-check" />
                  </span>
                  <span>
                    <strong>{day(row.held_on as string)}</strong>
                    <small>{row.venue ? String(row.venue) : "Mark attendance"}</small>
                  </span>
                  <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="clubs-detail-empty">No meetings yet.</p>
        )}
        <div className="clubs-detail-form-block">
          <CreateSessionForm
            clubs={[{ id, title: club.title }]}
            schedules={schedules.map((row) => ({
              id: row.id as string,
              club_id: id,
              label: `${WEEKDAY_LABELS[row.weekday as number]} ${String(row.start_time).slice(0, 5)}`,
            }))}
            defaultClubId={id}
          />
        </div>
      </section>
    </div>
  );
}
