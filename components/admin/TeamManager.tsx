"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAdmin, removeAdmin, sendTestEmail } from "@/app/admin/(panel)/team/actions";
import { initials } from "@/lib/applications";

type Member = { id: string; name: string; email: string | null; open: number; isYou: boolean };
type Alerts = { provider: string | null; problem: string | null; withoutEmail: number };
type Outcome = { error?: string; ok?: string };
type Result = (Outcome & { source: "list" | "invite" | "alerts" }) | null;
type TeamRole = "admin" | "admissions" | "accounts" | "academics";
type Filter = "all" | TeamRole;

type Listed = Member & {
  role: TeamRole;
  roleLabel: string;
  officeHref: string;
  officeLabel: string;
  canShowLoad: boolean;
};

const ALERTS = [
  { icon: "fa-file-signature", text: "A parent sends in an admission application" },
  { icon: "fa-briefcase", text: "Someone applies for a job, with their CV attached" },
];

const ACCESS = [
  { icon: "fa-file-signature", text: "Review, assign and update admission applications" },
  { icon: "fa-newspaper", text: "Write, schedule and publish stories" },
  { icon: "fa-images", text: "Change images and website content" },
  { icon: "fa-user-shield", text: "Add or remove other admins" },
];

const SIGN_IN: Record<TeamRole, string> = {
  admin: "/admin",
  admissions: "/admissions_office",
  accounts: "/accounts",
  academics: "/academics_office",
};

const ROLE_META: Record<TeamRole, { label: string; officeHref: string; officeLabel: string; canShowLoad: boolean }> = {
  admin: { label: "Admin", officeHref: "/admin/applications", officeLabel: "View applications", canShowLoad: true },
  admissions: { label: "Admissions", officeHref: "/admissions_office", officeLabel: "Admissions office", canShowLoad: true },
  accounts: { label: "Accounts", officeHref: "/accounts", officeLabel: "Accounts office", canShowLoad: false },
  academics: { label: "Academics", officeHref: "/academics_office", officeLabel: "Academics office", canShowLoad: false },
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "admin", label: "Admins" },
  { id: "admissions", label: "Admissions" },
  { id: "accounts", label: "Accounts" },
  { id: "academics", label: "Academics" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

function Feedback({ result }: { result: Result }) {
  if (!result) return null;
  return result.error ? (
    <p className="tm-feedback is-error" role="alert">
      <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {result.error}
    </p>
  ) : (
    <p className="tm-feedback" role="status">
      <i className="fa-solid fa-circle-check" aria-hidden="true" /> {result.ok}
    </p>
  );
}

function asListed(rows: Member[], role: TeamRole): Listed[] {
  const meta = ROLE_META[role];
  return rows.map((row) => ({
    ...row,
    role,
    roleLabel: meta.label,
    officeHref: meta.officeHref,
    officeLabel: meta.officeLabel,
    canShowLoad: meta.canShowLoad,
  }));
}

export function TeamManager({
  members,
  officers,
  accountants,
  teachers,
  alerts,
}: {
  members: Member[];
  officers: Member[];
  accountants: Member[];
  teachers: Member[];
  alerts: Alerts;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("admin");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [pending, startTransition] = useTransition();

  const everyone = useMemo(
    () => [
      ...asListed(members, "admin"),
      ...asListed(officers, "admissions"),
      ...asListed(accountants, "accounts"),
      ...asListed(teachers, "academics"),
    ],
    [members, officers, accountants, teachers],
  );

  const counts = useMemo(
    () => ({
      all: everyone.length,
      admin: members.length,
      admissions: officers.length,
      accounts: accountants.length,
      academics: teachers.length,
    }),
    [everyone.length, members.length, officers.length, accountants.length, teachers.length],
  );

  const busiest = Math.max(1, ...everyone.filter((row) => row.canShowLoad).map((row) => row.open));

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return everyone.filter((row) => {
      if (filter !== "all" && row.role !== filter) return false;
      if (!words.length) return true;
      const hay = `${row.name} ${row.email || ""} ${row.roleLabel}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [everyone, filter, query]);

  const run = (source: NonNullable<Result>["source"], task: () => Promise<Outcome>, after?: () => void) => {
    startTransition(async () => {
      const outcome = await task().catch(() => ({ error: "Something went wrong. Try again." }));
      setTesting(false);
      setResult({ ...outcome, source });
      setRemoving(null);
      if (!outcome.error) {
        after?.();
        router.refresh();
      }
    });
  };

  function removeMember(row: Listed) {
    const aloneAdmin = row.role === "admin" && members.length <= 1;
    if (aloneAdmin) return;
    const text = row.isYou
      ? "Remove your own admin access? You will be signed out of the dashboard."
      : `Remove ${row.roleLabel.toLowerCase()} access for ${row.name}? They keep their parent portal account.`;
    if (!window.confirm(text)) return;
    setRemoving(row.id);
    run("list", () => removeAdmin(row.id), row.isYou ? () => router.push("/") : undefined);
  }

  return (
    <div className="tm-desk">
      <div className="tm-strip" aria-label="Team summary">
        <div>
          <span className="tm-stat-icon" aria-hidden="true"><i className="fa-solid fa-users" /></span>
          <div className="tm-stat-copy">
            <span>Team</span>
            <strong>{nf(counts.all)}</strong>
            <small>People with access</small>
          </div>
        </div>
        <div>
          <span className="tm-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-shield" /></span>
          <div className="tm-stat-copy">
            <span>Admins</span>
            <strong>{nf(counts.admin)}</strong>
            <small>Full dashboard</small>
          </div>
        </div>
        <div>
          <span className="tm-stat-icon" aria-hidden="true"><i className="fa-solid fa-building-user" /></span>
          <div className="tm-stat-copy">
            <span>Officers</span>
            <strong>{nf(counts.admissions + counts.accounts + counts.academics)}</strong>
            <small>Office access</small>
          </div>
        </div>
        <div className={alerts.problem ? "is-warn" : "is-ok"}>
          <span className="tm-stat-icon" aria-hidden="true"><i className="fa-solid fa-envelope" /></span>
          <div className="tm-stat-copy">
            <span>Alerts</span>
            <strong>{alerts.problem ? "Off" : "On"}</strong>
            <small>{alerts.problem ? "Not configured" : alerts.provider || "Ready"}</small>
          </div>
        </div>
      </div>

      <div className="tm-grid">
        <section className="tm-panel" id="team-members" aria-label="Team members">
          <header className="tm-panel-head">
            <div className="tm-panel-title">
              <span className="tm-panel-icon" aria-hidden="true"><i className="fa-solid fa-user-shield" /></span>
              <div>
                <h2>People</h2>
                <p>Search by name or email, then filter by role.</p>
              </div>
            </div>
          </header>

          <div className="tm-tools">
            <label className="tm-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or email"
                aria-label="Search team"
              />
              {query ? (
                <button type="button" className="tm-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <div className="tm-filters" role="tablist" aria-label="Role filter">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? "is-on" : ""}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <em>{nf(counts[item.id])}</em>
                </button>
              ))}
            </div>
          </div>

          {result?.source === "list" ? <Feedback result={result} /> : null}

          {visible.length ? (
            <ul className="tm-list">
              {visible.map((row) => {
                const busy = removing === row.id;
                const aloneAdmin = row.role === "admin" && members.length <= 1;
                const appsHref =
                  row.role === "admin" || row.role === "admissions"
                    ? `/admin/applications?owner=${row.isYou ? "me" : row.id}`
                    : row.officeHref;
                return (
                  <li key={`${row.role}-${row.id}`} className={`${row.isYou ? "is-you" : ""} is-${row.role}`}>
                    <span className="tm-avatar" aria-hidden="true">{initials(row.name)}</span>
                    <div className="tm-who">
                      <strong>
                        <span>{row.name}</span>
                        {row.isYou ? <em className="tm-you">You</em> : null}
                      </strong>
                      {row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : <small>No email on file</small>}
                      <span className={`tm-role-pill is-${row.role}`}>{row.roleLabel}</span>
                    </div>
                    {row.canShowLoad ? (
                      <div className="tm-load">
                        <p>
                          <span>Open apps</span>
                          <strong>{row.open}</strong>
                        </p>
                        <span className="tm-bar" aria-hidden="true">
                          <span style={{ width: `${(row.open / busiest) * 100}%` }} />
                        </span>
                      </div>
                    ) : (
                      <div className="tm-load is-quiet">
                        <p><span>Office</span><strong>—</strong></p>
                      </div>
                    )}
                    <div className="tm-card-actions">
                      {row.role === "admin" || row.role === "admissions" ? (
                        <Link href={appsHref} className="tm-link">
                          Applications <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                        </Link>
                      ) : (
                        <a href={row.officeHref} className="tm-link">
                          {row.officeLabel} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                        </a>
                      )}
                      <button
                        type="button"
                        className="tm-remove"
                        disabled={pending || aloneAdmin}
                        title={aloneAdmin ? "Keep at least one admin" : undefined}
                        onClick={() => removeMember(row)}
                      >
                        <i className="fa-solid fa-user-minus" aria-hidden="true" />
                        {busy ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="tm-empty-state">
              <span className="tm-empty-icon" aria-hidden="true"><i className="fa-regular fa-address-card" /></span>
              <strong>{everyone.length ? "No people match this filter" : "No team members yet"}</strong>
              <p>
                {everyone.length
                  ? "Try All, clear the search, or add someone with the form on the right."
                  : "Add a colleague below once they have a parent portal account."}
              </p>
            </div>
          )}
        </section>

        <aside className="tm-side">
          <section className="tm-panel tm-invite" id="team-invite" aria-labelledby="team-invite-title">
            <header className="tm-panel-head">
              <div className="tm-panel-title">
                <span className="tm-panel-icon" aria-hidden="true"><i className="fa-solid fa-user-plus" /></span>
                <div>
                  <h2 id="team-invite-title">Add access</h2>
                  <p>Promote an existing parent portal account.</p>
                </div>
              </div>
            </header>
            <ol className="tm-steps">
              <li><span>1</span><p>They create an account with <strong>Parent portal</strong>.</p></li>
              <li><span>2</span><p>Enter that email below and choose a role.</p></li>
              <li><span>3</span><p>They sign in at <code>{SIGN_IN[role]}</code>.</p></li>
            </ol>
            <form
              className="tm-add"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run("invite", () => addAdmin(data), () => setEmail(""));
              }}
            >
              <label htmlFor="team-role">Role</label>
              <select
                id="team-role"
                name="role"
                className="tm-role"
                value={role}
                onChange={(event) => setRole(event.target.value as TeamRole)}
              >
                <option value="admin">Admin — whole dashboard</option>
                <option value="admissions">Admissions officer</option>
                <option value="accounts">Accounts officer</option>
                <option value="academics">Academics officer</option>
              </select>
              <label htmlFor="team-email">Email address</label>
              <div className="tm-add-row">
                <span className="tm-add-field">
                  <i className="fa-regular fa-envelope" aria-hidden="true" />
                  <input
                    id="team-email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@kja.ug"
                    autoComplete="off"
                  />
                </span>
                <button className="admin-btn" type="submit" disabled={pending}>
                  {pending && !removing && !testing ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
            {result?.source === "invite" ? <Feedback result={result} /> : null}
          </section>

          <section className="tm-panel tm-alerts" id="team-alerts" aria-labelledby="team-alerts-title">
            <div className="tm-alerts-head">
              <h2 id="team-alerts-title">Email alerts</h2>
              <span className={`tm-alerts-state${alerts.problem ? " is-off" : ""}`}>
                <i className={`fa-solid ${alerts.problem ? "fa-circle-pause" : "fa-circle-check"}`} aria-hidden="true" />
                {alerts.problem ? "Not set up" : `On · ${alerts.provider}`}
              </span>
            </div>
            <p>Every admin gets an email when:</p>
            <ul>
              {ALERTS.map((item) => (
                <li key={item.text}>
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            {alerts.problem ? (
              <p className="tm-alerts-note is-off">
                <i className="fa-solid fa-plug-circle-exclamation" aria-hidden="true" /> {alerts.problem}
              </p>
            ) : null}
            {alerts.withoutEmail ? (
              <p className="tm-alerts-note">
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                {alerts.withoutEmail === 1 ? "1 admin has" : `${alerts.withoutEmail} admins have`} no email and won&apos;t get alerts.
              </p>
            ) : null}
            <button
              type="button"
              className="tm-alerts-test"
              disabled={pending || Boolean(alerts.problem)}
              onClick={() => {
                setTesting(true);
                run("alerts", () => sendTestEmail());
              }}
            >
              <i className="fa-solid fa-paper-plane" aria-hidden="true" />
              {pending && testing ? "Sending…" : "Send me a test email"}
            </button>
            {result?.source === "alerts" ? <Feedback result={result} /> : null}
          </section>

          <section className="tm-panel tm-access" aria-labelledby="team-access-title">
            <h2 id="team-access-title">What admins can do</h2>
            <ul>
              {ACCESS.map((item) => (
                <li key={item.text}>
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            <p className="tm-access-note">
              <i className="fa-solid fa-shield-halved" aria-hidden="true" />
              Removing access keeps their parent portal account; they only lose office or dashboard access.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
