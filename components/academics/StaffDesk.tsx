"use client";

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DeskForm } from "@/components/academics/Form";
import { TeacherFace } from "@/components/TeacherFace";
import { CAMPUS_OPTIONS } from "@/lib/applications";
import type { SubjectRow } from "@/lib/academics";
import { subjectFits } from "@/lib/subject-bands";
import type { StaffGap, StaffGroup, StaffLead, StaffMember, StaffPost } from "@/lib/academics-staff";
import { className, displayPhone, SCHOOL_CLASSES, telHref } from "@/lib/students";

type SaveStaff = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string; email?: string; password?: string; temporary?: boolean }>;
type PostAction = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string; email?: string; password?: string; temporary?: boolean }>;
type IssuedLogin = { email: string; password: string; name: string; temporary?: boolean };
type Duty = "all" | "class" | "subject" | "open" | "hidden";
type DeskView = "teachers" | "coverage";
type FileTab = "overview" | "assign" | "details";

const DUTIES: { id: Duty; label: string }[] = [
  { id: "all", label: "All" },
  { id: "class", label: "Class teachers" },
  { id: "subject", label: "Subjects" },
  { id: "open", label: "Unassigned" },
  { id: "hidden", label: "Hidden" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

/** Report-card mark from a full name (first + last letter). */
function suggestInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  const first = parts[0].replace(/[^A-Za-z]/g, "");
  const last = parts[parts.length - 1].replace(/[^A-Za-z]/g, "");
  return `${first[0] || ""}${last[0] || ""}`.toUpperCase();
}

function cleanInitials(value: string) {
  return value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8);
}

function loadOf(member: StaffMember) {
  return member.classes.length + member.subjects.length + member.periods.length;
}

export function StaffDesk({
  members,
  gaps = [],
  groups,
  subjects,
  posts,
  leads,
  termId,
  termLabel,
  initialId,
  initialView = "teachers",
  initialIssued = [],
  loginNotes = [],
  save,
  assign,
  release,
  issue,
  reset,
  revoke,
  remove,
}: {
  members: StaffMember[];
  gaps: StaffGap[];
  groups: StaffGroup[];
  subjects: SubjectRow[];
  posts: StaffPost[];
  leads: StaffLead[];
  termId: string | null;
  termLabel: string | null;
  initialId: string;
  initialView?: DeskView;
  /** One-time passwords created while repairing assigned teachers without a desk login. */
  initialIssued?: IssuedLogin[];
  /** Soft notices from the repair pass (missing email, etc.). */
  loginNotes?: string[];
  save: SaveStaff;
  assign: PostAction;
  release: PostAction;
  issue?: SaveStaff;
  reset?: SaveStaff;
  revoke?: SaveStaff;
  remove: SaveStaff;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [memberId, setMemberId] = useState(() => {
    if (initialId === "new") return "new";
    if (members.some((member) => member.id === initialId)) return initialId;
    return members.find((member) => member.active)?.id || members[0]?.id || "new";
  });
  const [query, setQuery] = useState("");
  const [campus, setCampus] = useState("");
  const [duty, setDuty] = useState<Duty>("all");
  const [sort, setSort] = useState<"name" | "load">("name");
  const [gapsOpen, setGapsOpen] = useState(false);
  const [deskView, setDeskView] = useState<DeskView>(initialView);
  const [issuedQueue, setIssuedQueue] = useState<IssuedLogin[]>(initialIssued);
  const issued = issuedQueue[0] || null;

  function pushIssued(next: IssuedLogin) {
    setIssuedQueue((queue) => [...queue, { ...next, temporary: Boolean(next.temporary) }]);
  }

  function dismissIssued() {
    setIssuedQueue((queue) => queue.slice(1));
  }
  const teachers = useMemo(() => members.filter((member) => member.active).map((member) => ({ id: member.id, name: member.full_name })), [members]);
  const openPosts = useMemo(() => {
    if (!termId || !groups.length) return 0;
    let open = gaps.length;
    for (const group of groups) {
      const fitting = subjects.filter((subject) => subjectFits(subject, group.code));
      for (const subject of fitting) {
        const held = posts.some((row) => row.classCode === group.code && row.stream === group.stream && row.subjectId === subject.id);
        if (!held) open += 1;
      }
    }
    return open;
  }, [termId, groups, subjects, posts, gaps.length]);

  useEffect(() => {
    if (initialId === "new" || members.some((member) => member.id === initialId)) setMemberId(initialId);
  }, [initialId, members]);

  const campuses = useMemo(() => {
    const values = new Set<string>(CAMPUS_OPTIONS);
    for (const member of members) if (member.campus) values.add(member.campus);
    return [...values];
  }, [members]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const words = needle.split(/\s+/).filter(Boolean);
    const rows = members.filter((member) => {
      if (campus && (member.campus || "") !== campus) return false;
      if (duty === "hidden" && member.active) return false;
      if (duty === "class" && !(member.active && member.classes.length)) return false;
      if (duty === "subject" && !(member.active && member.subjects.length)) return false;
      if (duty === "open" && !(member.active && !member.classes.length && !member.subjects.length)) return false;
      if (!words.length) return true;
      const hay = [member.full_name, member.title, member.campus, member.email, member.phone, ...member.classes.map((row) => row.label), ...member.subjects.map((row) => `${row.subject} ${row.label}`)].join(" ").toLowerCase();
      return words.every((word) => hay.includes(word));
    });
    return rows.sort((a, b) => Number(b.active) - Number(a.active) || (sort === "load" ? loadOf(b) - loadOf(a) : 0) || a.full_name.localeCompare(b.full_name));
  }, [members, query, campus, duty, sort]);

  const counts = useMemo(() => {
    const inCampus = campus ? members.filter((member) => (member.campus || "") === campus) : members;
    return {
      all: inCampus.length,
      class: inCampus.filter((member) => member.active && member.classes.length).length,
      subject: inCampus.filter((member) => member.active && member.subjects.length).length,
      open: inCampus.filter((member) => member.active && !member.classes.length && !member.subjects.length).length,
      hidden: inCampus.filter((member) => !member.active).length,
    };
  }, [members, campus]);

  function choose(id: string) {
    setMemberId(id);
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    params.set("member", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const selected = members.find((member) => member.id === memberId) || null;
  const adding = memberId === "new" || !selected;
  const shownGaps = gapsOpen ? gaps : gaps.slice(0, 6);
  const activeTeachers = members.filter((member) => member.active).length;
  const needLogin = members.filter((member) => member.active && !member.profile_id && loadOf(member) > 0).length;

  return (
    <div className="stf-desk" id="stf-desk">
      <div className="stf-modes" role="tablist" aria-label="Staff desk">
        <button type="button" role="tab" aria-selected={deskView === "teachers"} className={deskView === "teachers" ? "is-on" : ""} onClick={() => setDeskView("teachers")}>
          <i className="fa-solid fa-chalkboard-user" aria-hidden="true" />
          <span>Teachers</span>
          <em>{activeTeachers}</em>
        </button>
        <button type="button" role="tab" aria-selected={deskView === "coverage"} className={deskView === "coverage" ? "is-on" : ""} onClick={() => setDeskView("coverage")}>
          <i className="fa-solid fa-table-list" aria-hidden="true" />
          <span>Fill gaps</span>
          {openPosts ? <em className="is-warn">{openPosts}</em> : <em>0</em>}
        </button>
      </div>

      {deskView === "teachers" && gaps.length ? (
        <div className="stf-banner">
          <div className="stf-banner-icon" aria-hidden="true"><i className="fa-solid fa-triangle-exclamation" /></div>
          <div>
            <strong>{gaps.length === 1 ? "1 class still needs a class teacher" : `${gaps.length} classes still need a class teacher`}</strong>
            <p>Jump to Fill gaps to cover leadership and subject posts by stream.</p>
          </div>
          <button type="button" onClick={() => setDeskView("coverage")}>Fill gaps</button>
        </div>
      ) : null}

      {issued ? <IssuedLoginCard issued={issued} remaining={issuedQueue.length - 1} onClose={dismissIssued} /> : null}
      {loginNotes.length ? (
        <div className="stf-banner is-warn" role="status">
          <div className="stf-banner-icon" aria-hidden="true"><i className="fa-solid fa-key" /></div>
          <div>
            <strong>Some assigned teachers still need a desk sign-in</strong>
            <p>{loginNotes.slice(0, 3).join(" ")}{loginNotes.length > 3 ? ` (+${loginNotes.length - 3} more)` : ""}</p>
          </div>
        </div>
      ) : null}

      {deskView === "coverage" ? (
        <Coverage
          groups={groups}
          subjects={subjects}
          posts={posts}
          leads={leads}
          termId={termId}
          termLabel={termLabel}
          teachers={teachers}
          assign={assign}
          onIssued={(next) => {
            const match = members.find((member) => member.email && member.email.toLowerCase() === next.email.toLowerCase());
            pushIssued({ ...next, name: match?.full_name || "Teacher", temporary: Boolean(next.temporary) });
          }}
        />
      ) : (
        <div className="stf-layout">
          <section className="stf-card stf-directory" aria-label="Teachers">
            <header className="stf-dir-hero">
              <div className="stf-dir-hero-copy">
                <p className="stf-cover-kicker">{termLabel || "No current term"}</p>
                <h2>Teachers</h2>
                <p>{termLabel ? "Search the roll, then open a file to assign work." : "Add teachers first. Set a current term to assign classes."}</p>
              </div>
              <button className={`stf-add${adding ? " is-on" : ""}`} type="button" onClick={() => choose("new")}>
                <i className="fa-solid fa-plus" aria-hidden="true" /> Add teacher
              </button>
            </header>

            <div className="stf-dir-stats" aria-label="Directory summary">
              <div>
                <span>Active</span>
                <strong>{counts.all - counts.hidden}</strong>
              </div>
              <div className={counts.open ? "is-warn" : ""}>
                <span>Unassigned</span>
                <strong>{counts.open}</strong>
              </div>
              <div className={needLogin ? "is-warn" : "is-ok"}>
                <span>Need login</span>
                <strong>{needLogin}</strong>
              </div>
              <div>
                <span>Showing</span>
                <strong>{visible.length}</strong>
              </div>
            </div>

            <div className="stf-tools">
              <label className="stf-search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, class, or subject" aria-label="Search teachers" />
                {query ? (
                  <button type="button" className="stf-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <div className="stf-tools-row">
                <label className="stf-select">
                  <span>Campus</span>
                  <select value={campus} onChange={(event) => setCampus(event.target.value)} aria-label="Campus">
                    <option value="">All campuses</option>
                    {campuses.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label className="stf-select">
                  <span>Order</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value === "load" ? "load" : "name")} aria-label="Order">
                    <option value="name">Name A–Z</option>
                    <option value="load">Heaviest load</option>
                  </select>
                </label>
              </div>
              <div className="stf-duties" role="tablist" aria-label="Show">
                {DUTIES.map((item) => (
                  <button key={item.id} type="button" className={duty === item.id ? "is-on" : ""} aria-pressed={duty === item.id} onClick={() => setDuty(item.id)}>
                    {item.label}<em>{counts[item.id]}</em>
                  </button>
                ))}
              </div>
            </div>

            {gaps.length ? (
              <div className="stf-gaps">
                <div className="stf-gaps-head">
                  <strong>{gaps.length} open class-teacher {gaps.length === 1 ? "post" : "posts"}</strong>
                  <button type="button" className="stf-linkish" onClick={() => setDeskView("coverage")}>Fill gaps</button>
                </div>
                <div>
                  {shownGaps.map((gap) => <Link key={gap.href} href={gap.href}>{gap.label}</Link>)}
                  {gaps.length > 6 ? <button type="button" onClick={() => setGapsOpen((open) => !open)}>{gapsOpen ? "Show fewer" : `+${gaps.length - 6} more`}</button> : null}
                </div>
              </div>
            ) : null}

            {visible.length ? (
              <ul className="stf-people">
                {visible.map((member) => {
                  const load = loadOf(member);
                  const isLead = member.classes.some((row) => row.role === "lead");
                  const isAssist = member.classes.some((row) => row.role === "assistant");
                  const needsWork = member.active && !load;
                  const loadLabel = member.classes.length
                    ? member.classes.map((row) => row.label).join(", ")
                    : member.subjects.length === 1
                      ? "1 subject"
                      : member.subjects.length
                        ? `${member.subjects.length} subjects`
                        : "No load";
                  return (
                    <li key={member.id}>
                      <button
                        type="button"
                        className={[
                          member.id === memberId ? "is-on" : "",
                          member.active ? "" : "is-hidden",
                          needsWork ? "is-open" : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => choose(member.id)}
                      >
                        <TeacherFace id={member.id} name={member.full_name} photoPath={member.photo_path} className="stf-face" />
                        <span className="stf-people-meta">
                          <strong>{member.full_name}</strong>
                          <small>{[member.title, member.campus].filter(Boolean).join(" · ") || "Teacher"}</small>
                          <span className="stf-people-tags">
                            {isLead ? <em className="is-lead">Lead</em> : null}
                            {isAssist ? <em className="is-assist">Assist</em> : null}
                            {member.subjects.length ? <em className="is-subj">{member.subjects.length} subj</em> : null}
                            {!member.profile_id && member.active ? <em className="is-warn">No login</em> : null}
                            {!member.active ? <em className="is-soft">Hidden</em> : null}
                            {needsWork ? <em className="is-warn">Unassigned</em> : null}
                          </span>
                        </span>
                        <span className={`stf-people-load${needsWork ? " is-warn" : load ? " is-ok" : ""}`}>
                          <strong>{load || "—"}</strong>
                          <small>{loadLabel}</small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="stf-empty">
                <span className="stf-empty-icon" aria-hidden="true"><i className="fa-solid fa-magnifying-glass" /></span>
                <strong>No teacher matches</strong>
                <p>Try another campus, clear the search, or add a new teacher.</p>
                <button type="button" onClick={() => { setQuery(""); setDuty("all"); setCampus(""); }}>Clear filters</button>
              </div>
            )}
          </section>

          <div className="stf-detail">
            {adding ? (
              <TeacherForm save={save} campuses={campuses} onIssued={pushIssued} onCancel={() => choose(members.find((member) => member.active)?.id || members[0]?.id || "new")} />
            ) : selected ? (
              <TeacherFile key={selected.id} member={selected} save={save} campuses={campuses} termLabel={termLabel} groups={groups} subjects={subjects} posts={posts} leads={leads} termId={termId} assign={assign} release={release} issue={issue} reset={reset} revoke={revoke} remove={remove} onIssued={pushIssued} />
            ) : (
              <div className="stf-card stf-empty is-panel">
                <span className="stf-empty-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span>
                <strong>Select a teacher</strong>
                <p>Choose someone from the directory, or add a new teacher to the roll.</p>
                <button type="button" onClick={() => choose("new")}>Add a teacher</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TeacherFile({
  member,
  save,
  campuses,
  termLabel,
  groups,
  subjects,
  posts,
  leads,
  termId,
  assign,
  release,
  issue,
  reset,
  revoke,
  remove,
  onIssued,
}: {
  member: StaffMember;
  save: SaveStaff;
  campuses: string[];
  termLabel: string | null;
  groups: StaffGroup[];
  subjects: SubjectRow[];
  posts: StaffPost[];
  leads: StaffLead[];
  termId: string | null;
  assign: PostAction;
  release: PostAction;
  issue?: SaveStaff;
  reset?: SaveStaff;
  revoke?: SaveStaff;
  remove: SaveStaff;
  onIssued: (issued: IssuedLogin) => void;
}) {
  const [tab, setTab] = useState<FileTab>(!member.classes.length && !member.subjects.length && termId ? "assign" : "overview");
  const papers = member.subjects.reduce((sum, row) => sum + row.papers, 0);
  const submitted = member.subjects.reduce((sum, row) => sum + row.submitted, 0);
  const days = DAYS.map((day, index) => ({ day, rows: member.periods.filter((row) => row.weekday === index + 1) })).filter((day) => day.rows.length);
  const campusChoices = member.campus && !campuses.includes(member.campus) ? [member.campus, ...campuses] : campuses;
  const load = loadOf(member);
  const markPct = papers ? Math.round((submitted / papers) * 100) : 0;
  const lessonPct = member.lessonsPlanned ? Math.round((member.lessonsTaught / member.lessonsPlanned) * 100) : 0;
  const needsWork = member.active && !load;

  return (
    <div className="stf-file">
      <section className="stf-card stf-profile" aria-label={member.full_name}>
        <header className="stf-profile-hero">
          <TeacherFace id={member.id} name={member.full_name} photoPath={member.photo_path} className="stf-face is-lg" />
          <div className="stf-profile-copy">
            <p className="stf-cover-kicker">{termLabel || "Teacher file"}</p>
            <h2>{member.full_name}</h2>
            <p>{[member.title, member.campus].filter(Boolean).join(" · ") || "Teacher"}</p>
            <div className="stf-pills">
              {member.initials ? <span className="stf-pill is-linked" title="Report card initials">{member.initials}</span> : null}
              {member.classes.some((row) => row.role === "lead") ? <span className="stf-pill is-class">Class teacher</span> : null}
              {member.classes.some((row) => row.role === "assistant") ? <span className="stf-pill is-assist">Assistant</span> : null}
              {member.profile_id ? <span className="stf-pill is-linked">Can sign in</span> : <span className="stf-pill is-late">No sign-in</span>}
              {!member.active ? <span className="stf-pill is-hidden">Hidden</span> : null}
              {member.lessonsOverdue ? <span className="stf-pill is-late">{member.lessonsOverdue} overdue</span> : null}
              {needsWork ? <span className="stf-pill is-late">Needs assignments</span> : null}
            </div>
          </div>
          <div className={`stf-profile-load${needsWork ? " is-warn" : load ? " is-ok" : ""}`}>
            <strong>{load || 0}</strong>
            <span>posts this term</span>
            {termId && needsWork ? (
              <button type="button" className="stf-profile-cta" onClick={() => setTab("assign")}>Assign now</button>
            ) : null}
          </div>
          <DeleteTeacher member={member} remove={remove} compact />
        </header>

        <div className="stf-contact">
          {member.email ? (
            <a href={`mailto:${member.email}`}><i className="fa-solid fa-envelope" aria-hidden="true" /> {member.email}</a>
          ) : (
            <span className="is-muted"><i className="fa-solid fa-envelope" aria-hidden="true" /> No email</span>
          )}
          {telHref(member.phone) ? (
            <a href={telHref(member.phone)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(member.phone)}</a>
          ) : (
            <span className="is-muted"><i className="fa-solid fa-phone" aria-hidden="true" /> No phone</span>
          )}
        </div>

        <div className="stf-figs" aria-label="This term">
          <div><span>Classes</span><strong>{member.classes.length}</strong></div>
          <div><span>Subjects</span><strong>{member.subjects.length}</strong></div>
          <div><span>Periods</span><strong>{member.periods.length}</strong></div>
          <div>
            <span>Markbooks</span>
            <strong>{submitted}/{papers || 0}</strong>
            {papers ? <em style={{ "--stf-fig-pct": markPct } as CSSProperties} /> : null}
          </div>
          <div>
            <span>Lessons</span>
            <strong>{member.lessonsTaught}/{member.lessonsPlanned || 0}</strong>
            {member.lessonsPlanned ? <em style={{ "--stf-fig-pct": lessonPct } as CSSProperties} /> : null}
          </div>
        </div>

        <div className="stf-tabs" role="tablist" aria-label="Teacher sections">
          <button type="button" role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "is-on" : ""} onClick={() => setTab("overview")}>
            <i className="fa-solid fa-eye" aria-hidden="true" /> Overview
          </button>
          <button type="button" role="tab" aria-selected={tab === "assign"} className={tab === "assign" ? "is-on" : ""} onClick={() => setTab("assign")}>
            <i className="fa-solid fa-list-check" aria-hidden="true" /> Assign
          </button>
          <button type="button" role="tab" aria-selected={tab === "details"} className={tab === "details" ? "is-on" : ""} onClick={() => setTab("details")}>
            <i className="fa-solid fa-id-card" aria-hidden="true" /> Details
          </button>
        </div>
      </section>

      {tab === "assign" ? (
        <Assignments
          member={member}
          groups={groups}
          subjects={subjects}
          posts={posts}
          leads={leads}
          termId={termId}
          termLabel={termLabel}
          assign={assign}
          release={release}
          onIssued={(issued) => onIssued({ ...issued, name: member.full_name })}
        />
      ) : null}

      {tab === "overview" ? (
        <>
          <section className="stf-card stf-overview-card" aria-label="Classes">
            <header className="stf-cover-section-head">
              <div>
                <h3>Classes led</h3>
                <p>Where this teacher is the class teacher or assistant.</p>
              </div>
              <span className={`stf-cover-badge${member.classes.length ? " is-ok" : " is-warn"}`}>{member.classes.length}</span>
            </header>
            {member.classes.length ? (
              <ul className="stf-rows">
                {member.classes.map((row) => (
                  <li key={`${row.href}-${row.role}`}>
                    <Link href={row.href}>
                      <span className={`stf-row-face${row.role === "assistant" ? " is-assist" : " is-lead"}`} aria-hidden="true">
                        <i className={`fa-solid ${row.role === "assistant" ? "fa-user-plus" : "fa-user"}`} />
                      </span>
                      <span>
                        <strong>{row.label}</strong>
                        <small>{row.role === "assistant" ? "Assistant class teacher" : "Class teacher"}</small>
                      </span>
                      <em>Open</em>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="stf-quiet-box">
                <p>No class leadership this term.</p>
                {termId ? <button type="button" className="stf-linkish" onClick={() => setTab("assign")}>Assign a class</button> : null}
              </div>
            )}
          </section>

          <section className="stf-card stf-overview-card" aria-label="Subjects">
            <header className="stf-cover-section-head">
              <div>
                <h3>Subjects</h3>
                <p>Scheme coverage and markbooks for each class.</p>
              </div>
              <span className={`stf-cover-badge${member.subjects.length ? " is-ok" : " is-warn"}`}>{member.subjects.length}</span>
            </header>
            {member.subjects.length ? (
              <ul className="stf-subjects">
                {member.subjects.map((row) => {
                  const width = row.papers > 0 ? Math.round((row.submitted / row.papers) * 100) : row.scheme && row.scheme.planned > 0 ? Math.round((row.scheme.taught / row.scheme.planned) * 100) : 0;
                  return (
                    <li key={row.key}>
                      <div>
                        <strong>{row.subject}</strong>
                        <Link href={row.href}>{row.label}</Link>
                        {row.scheme ? <Link className={`stf-pill is-${row.scheme.status}`} href={row.scheme.href}>{row.scheme.status}</Link> : <span className="stf-pill">No scheme</span>}
                      </div>
                      <p>{row.papers ? `${row.submitted}/${row.papers} markbooks` : "No markbook yet"}{row.scheme ? ` · ${row.scheme.taught}/${row.scheme.planned} lessons` : ""}{row.scheme?.overdue ? ` · ${row.scheme.overdue} late` : ""}</p>
                      <span className="stf-track" aria-hidden="true"><i style={{ width: `${width}%` }} /></span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="stf-quiet-box">
                <p>No subject assigned this term.</p>
                {termId ? <button type="button" className="stf-linkish" onClick={() => setTab("assign")}>Assign subjects</button> : null}
              </div>
            )}
          </section>

          <section className="stf-card stf-overview-card" aria-label="Timetable">
            <header className="stf-cover-section-head">
              <div>
                <h3>This week</h3>
                <p>Periods already on the timetable.</p>
              </div>
              <span className={`stf-cover-badge${days.length ? " is-ok" : ""}`}>{member.periods.length}</span>
            </header>
            {days.length ? (
              <div className="stf-week">
                {days.map((day) => (
                  <div key={day.day}>
                    <h3>{day.day}</h3>
                    <ul>
                      {day.rows.map((row) => (
                        <li key={row.key}><strong>P{row.period}</strong><span>{row.subject}</span><small>{row.label}{row.room ? ` · ${row.room}` : ""}</small></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : <p className="stf-quiet">No periods on the timetable yet.</p>}
          </section>
        </>
      ) : null}

      {tab === "details" ? (
        <section className="stf-card" aria-label="Record">
          <CardHead icon="fa-pen" title="Teacher record" text="Name, campus, contact, and sign-in." />
          <DeskForm
            action={save}
            className="stf-form"
            onIssued={(issued) => onIssued({ ...issued, name: member.full_name })}
          >
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="profile_id" value={member.profile_id || ""} />
            <input type="hidden" name="active" value={member.active ? "1" : "0"} />
            <label className="ofc-field"><span>Name</span><input name="full_name" defaultValue={member.full_name} required /></label>
            <label className="ofc-field"><span>Title</span><input name="title" defaultValue={member.title || ""} placeholder="Class teacher" /></label>
            <div className="stf-initials-block">
              <div>
                <strong>Report card initials</strong>
                <p>These letters appear in the Initials column on pupil report cards for subjects this teacher marks.</p>
              </div>
              <label className="ofc-field stf-initials-field">
                <span>Initials</span>
                <input
                  name="initials"
                  defaultValue={member.initials || suggestInitials(member.full_name)}
                  required
                  maxLength={8}
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="e.g. GN"
                  onChange={(event) => {
                    event.currentTarget.value = cleanInitials(event.currentTarget.value);
                  }}
                />
              </label>
            </div>
            <label className="ofc-field"><span>Campus</span>
              <select name="campus" defaultValue={member.campus || ""}>
                <option value="">Not set</option>
                {campusChoices.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="ofc-field"><span>Email</span><input name="email" type="email" defaultValue={member.email || ""} /></label>
            <label className="ofc-field"><span>Phone</span><input name="phone" defaultValue={member.phone || ""} /></label>
            <button className="stf-commit" type="submit">Save record</button>
          </DeskForm>
          {issue && revoke ? (
            <LoginActions member={member} issue={issue} reset={reset} revoke={revoke} onIssued={onIssued} />
          ) : null}
          <DeskForm action={save} className="stf-hide">
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="full_name" value={member.full_name} />
            <input type="hidden" name="initials" value={member.initials || suggestInitials(member.full_name)} />
            <input type="hidden" name="title" value={member.title || ""} />
            <input type="hidden" name="campus" value={member.campus || ""} />
            <input type="hidden" name="email" value={member.email || ""} />
            <input type="hidden" name="phone" value={member.phone || ""} />
            <input type="hidden" name="profile_id" value={member.profile_id || ""} />
            <input type="hidden" name="active" value={member.active ? "0" : "1"} />
            <button type="submit">{member.active ? "Hide from assignments" : "Show on assignments"}</button>
          </DeskForm>
          <DeleteTeacher member={member} remove={remove} />
        </section>
      ) : null}
    </div>
  );
}

function TeacherForm({
  save,
  campuses,
  onIssued,
  onCancel,
}: {
  save: SaveStaff;
  campuses: string[];
  onIssued: (issued: IssuedLogin) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [mark, setMark] = useState("");
  const [markTouched, setMarkTouched] = useState(false);
  const [email, setEmail] = useState("");

  return (
    <section className="stf-card stf-file stf-add-panel" aria-label="Add a teacher">
      <header className="stf-dir-hero">
        <div className="stf-dir-hero-copy">
          <p className="stf-cover-kicker">New staff</p>
          <h2>Add a teacher</h2>
          <p>Enter their name and report-card initials. Add an email and password if they should sign in right away.</p>
        </div>
        {onCancel ? (
          <button type="button" className="stf-add is-on" onClick={onCancel}>Cancel</button>
        ) : null}
      </header>
      <form
        className="stf-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const fullName = String(data.get("full_name") || "").trim();
          setError("");
          startTransition(async () => {
            let outcome: Awaited<ReturnType<SaveStaff>>;
            try {
              outcome = await save(data);
            } catch {
              outcome = { error: "Something went wrong. Try again." };
            }
            if (outcome.email && outcome.password) {
              onIssued({
                email: outcome.email,
                password: outcome.password,
                name: fullName || "Teacher",
                temporary: Boolean(outcome.temporary),
              });
            }
            if (outcome.error) {
              setError(outcome.error);
              if (outcome.href) router.refresh();
              return;
            }
            if (outcome.href) {
              router.push(outcome.href);
              router.refresh();
            }
          });
        }}
      >
        <label className="ofc-field">
          <span>Name</span>
          <input
            name="full_name"
            required
            autoFocus
            placeholder="Full name"
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              if (!markTouched) setMark(suggestInitials(next));
            }}
          />
        </label>
        <label className="ofc-field"><span>Title <em>optional</em></span><input name="title" placeholder="Class teacher" /></label>
        <div className="stf-initials-block">
          <div>
            <strong>Report card initials</strong>
            <p>Shown in the Initials column on pupil report cards for subjects this teacher marks.</p>
          </div>
          <label className="ofc-field stf-initials-field">
            <span>Initials</span>
            <input
              name="initials"
              required
              maxLength={8}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. GN"
              value={mark}
              onChange={(event) => {
                setMarkTouched(true);
                setMark(cleanInitials(event.target.value));
              }}
            />
          </label>
          {mark ? <span className="stf-initials-preview" aria-hidden="true">{mark}</span> : null}
        </div>
        <label className="ofc-field"><span>Campus <em>optional</em></span>
          <select name="campus" defaultValue="">
            <option value="">Not set</option>
            {campuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
        <label className="ofc-field">
          <span>Email <em>for sign-in</em></span>
          <input
            name="email"
            type="email"
            placeholder="teacher@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
          />
        </label>
        {email.trim() ? (
          <div className="stf-password-block">
            <div>
              <strong>Sign-in password</strong>
              <p>Set it now, or leave blank to issue a temporary password they must change on first login.</p>
            </div>
            <label className="ofc-field">
              <span>Password <em>optional</em></span>
              <input name="password" type="password" minLength={6} autoComplete="new-password" placeholder="At least 6 characters" />
            </label>
            <label className="ofc-field">
              <span>Confirm password</span>
              <input name="confirm" type="password" minLength={6} autoComplete="new-password" placeholder="Repeat password" />
            </label>
          </div>
        ) : null}
        <label className="ofc-field"><span>Phone <em>optional</em></span><input name="phone" /></label>
        {error ? <p className="stf-form-error">{error}</p> : null}
        <div className="stf-form-actions">
          {onCancel ? <button className="stf-ghost" type="button" onClick={onCancel}>Cancel</button> : null}
          <button className="stf-commit" type="submit" disabled={pending}>{pending ? "Adding…" : "Add teacher"}</button>
        </div>
      </form>
    </section>
  );
}

const CLASS_ORDER = new Map<string, number>(SCHOOL_CLASSES.map((entry) => [entry.code, entry.order]));

function streamName(stream: string) {
  return stream ? `Stream ${stream}` : "No stream";
}

function classCodes(groups: StaffGroup[]) {
  return [...new Set(groups.map((group) => group.code))].sort((a, b) => (CLASS_ORDER.get(a) ?? 99) - (CLASS_ORDER.get(b) ?? 99) || a.localeCompare(b));
}

function campusesFor(groups: StaffGroup[], code: string) {
  return [...new Set(groups.filter((group) => group.code === code).map((group) => group.campus))].sort((a, b) => a.localeCompare(b));
}

function Coverage({
  groups,
  subjects,
  posts,
  leads,
  termId,
  termLabel,
  teachers,
  assign,
  onIssued,
}: {
  groups: StaffGroup[];
  subjects: SubjectRow[];
  posts: StaffPost[];
  leads: StaffLead[];
  termId: string | null;
  termLabel: string | null;
  teachers: { id: string; name: string }[];
  assign: PostAction;
  onIssued?: (issued: { email: string; password: string; temporary?: boolean }) => void;
}) {
  const codes = classCodes(groups);
  const [code, setCode] = useState(codes[0] || "");
  const campuses = campusesFor(groups, code);
  const [campus, setCampus] = useState(campuses[0] || "");
  const activeCampus = campuses.includes(campus) ? campus : (campuses[0] || "");
  const streams = groups.filter((group) => group.code === code && group.campus === activeCampus);
  const [stream, setStream] = useState(streams[0]?.stream ?? "");
  const chosen = streams.some((group) => group.stream === stream) ? stream : (streams[0]?.stream ?? "");
  const currentGroup = streams.find((group) => group.stream === chosen) || streams[0] || null;
  const fitting = subjects.filter((subject) => subjectFits(subject, code));
  const lead = leads.find((row) => row.classCode === code && row.stream === chosen && row.campus === activeCampus && row.role === "lead") || null;
  const assistant = leads.find((row) => row.classCode === code && row.stream === chosen && row.campus === activeCampus && row.role === "assistant") || null;
  const rows = fitting.map((subject) => {
    const post = posts.find((row) => row.classCode === code && row.stream === chosen && row.campus === activeCampus && row.subjectId === subject.id) || null;
    return { id: subject.id, name: subject.name, staffId: post?.staffId || "", teacher: post?.staffName || "" };
  });
  const openSubjects = rows.filter((row) => !row.teacher).length;
  const openLead = lead ? 0 : 1;
  const openRequired = openSubjects + openLead;
  const covered = rows.length - openSubjects + (lead ? 1 : 0);
  const total = rows.length + 1;
  const pct = total ? Math.round((covered / total) * 100) : 0;
  const canEdit = Boolean(termId && teachers.length);
  const streamLabel = currentGroup?.label || `${className(code)} ${streamName(chosen)}`;

  function chooseClass(next: string) {
    setCode(next);
    const nextCampuses = campusesFor(groups, next);
    setCampus(nextCampuses[0] || "");
    setStream(groups.find((group) => group.code === next && group.campus === nextCampuses[0])?.stream ?? "");
  }

  function chooseCampus(next: string) {
    setCampus(next);
    setStream(groups.find((group) => group.code === code && group.campus === next)?.stream ?? "");
  }

  return (
    <section className="stf-card stf-cover" aria-label="Fill gaps">
      <header className="stf-cover-hero">
        <div className="stf-cover-hero-copy">
          <p className="stf-cover-kicker">{termLabel || "No current term"}</p>
          <h2>Fill gaps</h2>
          <p>Pick a stream, then assign or replace teachers until every post is covered.</p>
        </div>
        {termLabel && groups.length ? (
          <div className={`stf-cover-meter${openRequired ? " is-warn" : " is-ok"}`} aria-label={`${covered} of ${total} required posts covered`}>
            <div className="stf-cover-ring" style={{ "--stf-cover-pct": pct } as CSSProperties}>
              <strong>{pct}%</strong>
            </div>
            <div>
              <span>{openRequired ? `${openRequired} still open` : "Stream complete"}</span>
              <small>{covered} of {total} required · assistant optional</small>
            </div>
          </div>
        ) : null}
      </header>

      {!termLabel ? (
        <div className="stf-cover-empty">
          <i className="fa-solid fa-calendar-day" aria-hidden="true" />
          <div>
            <strong>Set a current term</strong>
            <p>Assignments start once Accounts marks a term as current.</p>
          </div>
        </div>
      ) : null}
      {termLabel && !groups.length ? (
        <div className="stf-cover-empty">
          <i className="fa-solid fa-users" aria-hidden="true" />
          <div>
            <strong>No classes with pupils yet</strong>
            <p>Streams appear here once the register has active pupils.</p>
          </div>
        </div>
      ) : null}

      {termLabel && groups.length ? (
        <>
          <div className="stf-cover-picker">
            <div className="stf-cover-tools">
              <label className="stf-select">
                <span>Class</span>
                <select value={code} onChange={(event) => chooseClass(event.target.value)} aria-label="Class">
                  {codes.map((entry) => <option key={entry} value={entry}>{className(entry)}</option>)}
                </select>
              </label>
              {campuses.length > 1 ? (
                <label className="stf-select">
                  <span>Campus</span>
                  <select value={activeCampus} onChange={(event) => chooseCampus(event.target.value)} aria-label="Campus">
                    {campuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
              ) : null}
            </div>

            {streams.length > 1 ? (
              <div className="stf-cover-streams" role="tablist" aria-label="Streams">
                {streams.map((group) => {
                  const streamLead = leads.some((row) => row.classCode === code && row.stream === group.stream && row.campus === activeCampus && row.role === "lead");
                  const streamOpenSubjects = fitting.filter((subject) => !posts.some((row) => row.classCode === code && row.stream === group.stream && row.campus === activeCampus && row.subjectId === subject.id)).length;
                  const streamOpen = (streamLead ? 0 : 1) + streamOpenSubjects;
                  const on = group.stream === chosen;
                  return (
                    <button
                      key={`${group.campus}-${group.stream || "-"}`}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className={`stf-cover-stream${on ? " is-on" : ""}${streamOpen ? " is-open" : " is-done"}`}
                      onClick={() => setStream(group.stream)}
                    >
                      <strong>{streamName(group.stream)}</strong>
                      <small>{group.pupils} {group.pupils === 1 ? "pupil" : "pupils"}</small>
                      <em>{streamOpen ? `${streamOpen} open` : "Done"}</em>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="stf-cover-stream-solo">
                <strong>{streamLabel}</strong>
                <span>{currentGroup?.pupils || 0} {(currentGroup?.pupils || 0) === 1 ? "pupil" : "pupils"}{activeCampus ? ` · ${activeCampus}` : ""}</span>
              </div>
            )}
          </div>

          <div className="stf-cover-body">
            <section className="stf-cover-section" aria-label="Leadership">
              <header className="stf-cover-section-head">
                <div>
                  <h3>Leadership</h3>
                  <p>Class teacher and optional assistant for this stream.</p>
                </div>
                <span className={`stf-cover-badge${openLead ? " is-warn" : " is-ok"}`}>
                  {lead ? "Lead set" : "Lead needed"}
                  {assistant ? " · +assist" : ""}
                </span>
              </header>
              <div className="stf-cover-lead-grid">
                <article className={`stf-cover-tile${lead ? " is-covered" : " is-open"}`}>
                  <div className="stf-cover-tile-top">
                    <span className="stf-cover-face" aria-hidden="true">
                      {lead ? initials(lead.staffName) : <i className="fa-solid fa-user" />}
                    </span>
                    <div>
                      <strong>Class teacher</strong>
                      <small>{lead?.staffName || "Needed for this stream"}</small>
                    </div>
                    <em className={lead ? "is-ok" : "is-warn"}>{lead ? "Filled" : "Open"}</em>
                  </div>
                  {canEdit ? (
                    <ClaimPost assign={assign} teachers={teachers} posts={posts} leads={leads} termId={termId!} classCode={code} stream={chosen} campus={activeCampus} classTeacher currentStaffId={lead?.staffId} onIssued={onIssued} />
                  ) : null}
                </article>
                <article className={`stf-cover-tile${assistant ? " is-covered" : " is-open is-optional"}`}>
                  <div className="stf-cover-tile-top">
                    <span className="stf-cover-face" aria-hidden="true">
                      {assistant ? initials(assistant.staffName) : <i className="fa-solid fa-user-plus" />}
                    </span>
                    <div>
                      <strong>Assistant</strong>
                      <small>{assistant?.staffName || "Optional second lead"}</small>
                    </div>
                    <em className={assistant ? "is-ok" : "is-soft"}>{assistant ? "Filled" : "Optional"}</em>
                  </div>
                  {canEdit ? (
                    <ClaimPost assign={assign} teachers={teachers} posts={posts} leads={leads} termId={termId!} classCode={code} stream={chosen} campus={activeCampus} assistantTeacher currentStaffId={assistant?.staffId} onIssued={onIssued} />
                  ) : null}
                </article>
              </div>
            </section>

            <section className="stf-cover-section" aria-label="Subjects">
              <header className="stf-cover-section-head">
                <div>
                  <h3>Subjects</h3>
                  <p>One teacher per subject. Choose someone to assign or replace.</p>
                </div>
                <span className={`stf-cover-badge${openSubjects ? " is-warn" : " is-ok"}`}>
                  {rows.length - openSubjects}/{rows.length}
                </span>
              </header>
              {fitting.length ? (
                <div className="stf-cover-subject-grid">
                  {rows.map((row) => (
                    <article key={row.id} className={`stf-cover-tile is-subject${row.teacher ? " is-covered" : " is-open"}`}>
                      <div className="stf-cover-tile-top">
                        <span className="stf-cover-face is-subject" aria-hidden="true">
                          {row.teacher ? initials(row.teacher) : <i className="fa-solid fa-book-open" />}
                        </span>
                        <div>
                          <strong>{row.name}</strong>
                          <small>{row.teacher || "No teacher yet"}</small>
                        </div>
                        <em className={row.teacher ? "is-ok" : "is-warn"}>{row.teacher ? "Filled" : "Open"}</em>
                      </div>
                      {canEdit ? (
                        <ClaimPost assign={assign} teachers={teachers} posts={posts} leads={leads} termId={termId!} classCode={code} stream={chosen} campus={activeCampus} subjectId={row.id} currentStaffId={row.staffId || undefined} onIssued={onIssued} />
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="stf-cover-empty is-inline">
                  <i className="fa-solid fa-book" aria-hidden="true" />
                  <div>
                    <strong>No subjects for this class</strong>
                    <p>Add subjects in the Subjects desk, then return here to assign teachers.</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Assignments({
  member,
  groups,
  subjects,
  posts,
  leads,
  termId,
  termLabel,
  assign,
  release,
  onIssued,
}: {
  member: StaffMember;
  groups: StaffGroup[];
  subjects: SubjectRow[];
  posts: StaffPost[];
  leads: StaffLead[];
  termId: string | null;
  termLabel: string | null;
  assign: PostAction;
  release: PostAction;
  onIssued?: (issued: { email: string; password: string; temporary?: boolean }) => void;
}) {
  type LeadPick = "" | "lead" | "assistant";
  const codes = classCodes(groups);
  const [code, setCode] = useState(codes[0] || "");
  const campuses = campusesFor(groups, code);
  const [campus, setCampus] = useState(campuses[0] || "");
  const activeCampus = campuses.includes(campus) ? campus : (campuses[0] || "");
  const streams = groups.filter((group) => group.code === code && group.campus === activeCampus);
  const [stream, setStream] = useState(streams[0]?.stream ?? "");
  const chosen = streams.some((group) => group.stream === stream) ? stream : (streams[0]?.stream ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [leadPick, setLeadPick] = useState<LeadPick>("");
  const fitting = subjects.filter((subject) => subjectFits(subject, code));
  const classHolder = leads.find((row) => row.classCode === code && row.stream === chosen && row.campus === activeCampus && row.role === "lead") || null;
  const assistantHolder = leads.find((row) => row.classCode === code && row.stream === chosen && row.campus === activeCampus && row.role === "assistant") || null;
  const ownLeadElsewhere = leads.find(
    (row) =>
      row.staffId === member.id &&
      !(row.classCode === code && row.stream === chosen && row.campus === activeCampus),
  ) || null;
  const mine = posts
    .filter((row) => row.staffId === member.id)
    .sort((a, b) => (CLASS_ORDER.get(a.classCode) ?? 99) - (CLASS_ORDER.get(b.classCode) ?? 99) || a.subject.localeCompare(b.subject));
  const mineLeads = leads
    .filter((row) => row.staffId === member.id)
    .sort((a, b) => (CLASS_ORDER.get(a.classCode) ?? 99) - (CLASS_ORDER.get(b.classCode) ?? 99) || a.stream.localeCompare(b.stream));
  const openSubjects = fitting.filter((subject) => {
    const current = posts.find((row) => row.classCode === code && row.stream === chosen && row.campus === activeCampus && row.subjectId === subject.id);
    return !current;
  }).length;
  const streamLabel = groups.find((group) => group.code === code && group.stream === chosen && group.campus === activeCampus)?.label
    || `${className(code)} ${streamName(chosen)}`;

  useEffect(() => {
    setPicked(
      posts
        .filter((row) => row.staffId === member.id && row.classCode === code && row.stream === chosen && row.campus === activeCampus)
        .map((row) => row.subjectId),
    );
    if (leads.some((row) => row.staffId === member.id && row.classCode === code && row.stream === chosen && row.campus === activeCampus && row.role === "lead")) {
      setLeadPick("lead");
    } else if (leads.some((row) => row.staffId === member.id && row.classCode === code && row.stream === chosen && row.campus === activeCampus && row.role === "assistant")) {
      setLeadPick("assistant");
    } else {
      setLeadPick("");
    }
  }, [member.id, code, chosen, activeCampus, posts, leads]);

  function chooseClass(next: string) {
    setCode(next);
    const nextCampuses = campusesFor(groups, next);
    setCampus(nextCampuses[0] || "");
    setStream(groups.find((group) => group.code === next && group.campus === nextCampuses[0])?.stream ?? "");
  }

  function chooseCampus(next: string) {
    setCampus(next);
    setStream(groups.find((group) => group.code === code && group.campus === next)?.stream ?? "");
  }

  function holder(subjectId: string) {
    return posts.find((row) => row.classCode === code && row.stream === chosen && row.campus === activeCampus && row.subjectId === subjectId) || null;
  }

  const leadOn = leadPick === "lead";
  const assistOn = leadPick === "assistant";
  const replacingLead = Boolean(leadOn && classHolder && classHolder.staffId !== member.id);
  const replacingAssist = Boolean(assistOn && assistantHolder && assistantHolder.staffId !== member.id);
  const movingLeadership = Boolean((leadOn || assistOn) && ownLeadElsewhere);
  const replacingSubjects = fitting
    .filter((subject) => {
      if (!picked.includes(subject.id)) return false;
      const current = holder(subject.id);
      return Boolean(current && current.staffId !== member.id);
    })
    .map((subject) => {
      const current = holder(subject.id)!;
      return { id: subject.id, subject: subject.name, from: current.staffName };
    });
  const substitutions = [
    ...(replacingLead ? [`Class teacher ← ${classHolder!.staffName}`] : []),
    ...(replacingAssist ? [`Assistant ← ${assistantHolder!.staffName}`] : []),
    ...replacingSubjects.map((row) => `${row.subject} ← ${row.from}`),
  ];
  const elsewhereLabel = ownLeadElsewhere
    ? groups.find((group) => group.code === ownLeadElsewhere.classCode && group.stream === ownLeadElsewhere.stream && group.campus === ownLeadElsewhere.campus)?.label || ownLeadElsewhere.classCode
    : "";

  return (
    <section className="stf-card stf-assign-card" aria-label="Assignments">
      <CardHead
        icon="fa-list-check"
        title="Assign work"
        text={termLabel ? `Pick a stream and assign posts. If someone else holds a role, saving replaces them.` : "Set a current term before assigning classes and subjects."}
      />

      {(mineLeads.length || mine.length) ? (
        <div className="stf-load">
          <div className="stf-load-head">
            <span>This term</span>
            <em>{mineLeads.length + mine.length}</em>
          </div>
          <ul className="stf-load-chips">
            {mineLeads.map((row) => {
              const label = groups.find((group) => group.code === row.classCode && group.stream === row.stream && group.campus === row.campus)?.label || row.classCode;
              return (
                <li key={`class-${row.role}-${row.campus}-${row.classCode}-${row.stream}`} className={row.role === "assistant" ? "is-assist" : "is-lead"}>
                  <span>{label}<small>{row.role === "assistant" ? "Assistant" : "Class teacher"}</small></span>
                  {termId ? (
                    <DeskForm action={release} className="stf-chip-drop" quiet status="Removing">
                      <input type="hidden" name="staff_id" value={member.id} />
                      <input type="hidden" name="term_id" value={termId} />
                      <input type="hidden" name="class_code" value={row.classCode} />
                      <input type="hidden" name="stream" value={row.stream} />
                      <input type="hidden" name="campus" value={row.campus} />
                      <input type="hidden" name="kind" value="class" />
                      <input type="hidden" name="role" value={row.role} />
                      <button type="submit" aria-label={`Remove ${row.role === "assistant" ? "assistant" : "class teacher"} for ${label}`}>×</button>
                    </DeskForm>
                  ) : null}
                </li>
              );
            })}
            {mine.map((row) => {
              const label = groups.find((group) => group.code === row.classCode && group.stream === row.stream && group.campus === row.campus)?.label || row.classCode;
              return (
                <li key={`${row.campus}-${row.classCode}-${row.stream}-${row.subjectId}`}>
                  <span>{row.subject}<small>{label}</small></span>
                  {termId ? (
                    <DeskForm action={release} className="stf-chip-drop" quiet status="Removing">
                      <input type="hidden" name="staff_id" value={member.id} />
                      <input type="hidden" name="term_id" value={termId} />
                      <input type="hidden" name="class_code" value={row.classCode} />
                      <input type="hidden" name="stream" value={row.stream} />
                      <input type="hidden" name="campus" value={row.campus} />
                      <input type="hidden" name="subject_id" value={row.subjectId} />
                      <input type="hidden" name="kind" value="subject" />
                      <button type="submit" aria-label={`Remove ${row.subject}`}>×</button>
                    </DeskForm>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="stf-quiet stf-assign-empty">Nothing assigned this term yet.</p>
      )}

      {termId && groups.length ? (
        <DeskForm action={assign} className="stf-form stf-assign" onIssued={onIssued}>
          <input type="hidden" name="staff_id" value={member.id} />
          <input type="hidden" name="term_id" value={termId} />
          <input type="hidden" name="class_code" value={code} />
          <input type="hidden" name="stream" value={chosen} />
          <input type="hidden" name="campus" value={activeCampus} />
          {leadOn ? <input type="hidden" name="class_teacher" value="1" /> : null}
          {assistOn ? <input type="hidden" name="assistant_teacher" value="1" /> : null}
          <input type="hidden" name="replace" value="1" />

          {!member.profile_id ? (
            <p className="stf-assign-note">
              {member.email
                ? "Saving creates a teacher desk sign-in if they do not have one yet."
                : "Add an email on Details before assigning — they need it to open the teacher desk."}
            </p>
          ) : null}

          <div className="stf-assign-toolbar">
            <label className="stf-select">
              <span>Class</span>
              <select value={code} onChange={(event) => chooseClass(event.target.value)} aria-label="Class to assign">
                {codes.map((entry) => <option key={entry} value={entry}>{className(entry)}</option>)}
              </select>
            </label>
            {campuses.length > 1 ? (
              <label className="stf-select">
                <span>Campus</span>
                <select value={activeCampus} onChange={(event) => chooseCampus(event.target.value)} aria-label="Campus to assign">
                  {campuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
            ) : null}
            <label className="stf-select">
              <span>Stream</span>
              <select value={chosen} onChange={(event) => setStream(event.target.value)} aria-label="Stream to assign">
                {streams.map((group) => (
                  <option key={`${group.campus}-${group.stream || "-"}`} value={group.stream}>
                    {streamName(group.stream)} · {group.pupils}
                  </option>
                ))}
              </select>
            </label>
            <div className="stf-assign-summary" aria-live="polite">
              <strong>{streamLabel}</strong>
              <span>{picked.length}/{fitting.length} subjects · {openSubjects ? `${openSubjects} open` : "subjects filled"}</span>
            </div>
          </div>

          <div className="stf-assign-section">
            <div className="stf-assign-section-head">
              <span>Leadership</span>
              <small>Tap to assign or replace</small>
            </div>
            <div className="stf-lead-seg" role="radiogroup" aria-label="Class leadership">
              {([
                { id: "" as LeadPick, label: "None", hint: "Subjects only", tone: "" },
                {
                  id: "lead" as LeadPick,
                  label: "Class teacher",
                  hint: classHolder
                    ? (classHolder.staffId === member.id ? "Yours" : leadPick === "lead" ? `Replace ${classHolder.staffName}` : classHolder.staffName)
                    : "Open",
                  tone: classHolder && classHolder.staffId !== member.id ? "is-swap" : "",
                },
                {
                  id: "assistant" as LeadPick,
                  label: "Assistant",
                  hint: assistantHolder
                    ? (assistantHolder.staffId === member.id ? "Yours" : leadPick === "assistant" ? `Replace ${assistantHolder.staffName}` : assistantHolder.staffName)
                    : "Open",
                  tone: assistantHolder && assistantHolder.staffId !== member.id ? "is-swap" : "",
                },
              ]).map((option) => {
                const active = leadPick === option.id;
                const status = option.id === ""
                  ? (active ? "is-on" : "")
                  : active
                    ? (option.tone === "is-swap" ? "is-on is-swap" : "is-on is-covered")
                    : option.hint === "Open"
                      ? "is-missing"
                      : option.hint === "Yours"
                        ? "is-covered"
                        : "is-swap";
                return (
                  <button
                    key={option.id || "none"}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`stf-lead-opt ${status}`.trim()}
                    onClick={() => setLeadPick(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="stf-assign-section">
            <div className="stf-assign-section-head">
              <span>Subjects</span>
              <small>Tap to assign or replace</small>
            </div>
            <div className="stf-subject-grid" role="group" aria-label="Subjects">
              {fitting.length ? fitting.map((subject) => {
                const current = holder(subject.id);
                const checked = picked.includes(subject.id);
                const mineHere = current?.staffId === member.id;
                const heldByOther = Boolean(current && current.staffId !== member.id);
                const status = checked
                  ? (heldByOther ? "is-swap is-on" : "is-covered is-on")
                  : heldByOther
                    ? "is-swap"
                    : mineHere
                      ? "is-covered"
                      : "is-missing";
                const hint = !current
                  ? "Open"
                  : mineHere
                    ? "Yours"
                    : checked
                      ? `Replace ${current.staffName}`
                      : current.staffName;
                return (
                  <label
                    key={subject.id}
                    className={`stf-subject-cell ${status}`.trim()}
                    title={heldByOther ? `Currently ${current!.staffName}. Tap to take over.` : (mineHere ? "Assigned to this teacher" : "Open")}
                  >
                    <input
                      type="checkbox"
                      name="subject_id"
                      value={subject.id}
                      checked={checked}
                      onChange={(event) => setPicked((currentIds) => event.target.checked ? [...currentIds, subject.id] : currentIds.filter((id) => id !== subject.id))}
                    />
                    <span>
                      <strong>{subject.name}</strong>
                      <small>{hint}</small>
                    </span>
                  </label>
                );
              }) : <p className="stf-picks-empty">No subjects apply to this class.</p>}
            </div>
          </div>

          {(substitutions.length || movingLeadership) ? (
            <div className="stf-swap-preview" role="status">
              <div>
                <strong>{substitutions.length ? "Replacements on save" : "Leadership move"}</strong>
                {movingLeadership ? (
                  <p>
                    Moves {ownLeadElsewhere!.role === "assistant" ? "assistant" : "class teacher"} role from <em>{elsewhereLabel}</em> to this stream.
                  </p>
                ) : null}
                {substitutions.length ? (
                  <ul>
                    {substitutions.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="stf-assign-bar">
            <p className="stf-assign-hint">Saving replaces anyone currently on the posts you select.</p>
            <button className="stf-commit" type="submit">
              {substitutions.length || movingLeadership ? "Save & replace" : "Save"}
            </button>
          </div>
        </DeskForm>
      ) : null}
    </section>
  );
}

function ClaimPost({
  assign,
  teachers,
  posts,
  leads,
  termId,
  classCode,
  stream,
  campus,
  subjectId,
  classTeacher = false,
  assistantTeacher = false,
  currentStaffId,
  onIssued,
}: {
  assign: PostAction;
  teachers: { id: string; name: string }[];
  posts: StaffPost[];
  leads: StaffLead[];
  termId: string;
  classCode: string;
  stream: string;
  campus: string;
  subjectId?: string;
  classTeacher?: boolean;
  assistantTeacher?: boolean;
  currentStaffId?: string;
  onIssued?: (issued: { email: string; password: string; temporary?: boolean }) => void;
}) {
  const initial = currentStaffId && teachers.some((teacher) => teacher.id === currentStaffId)
    ? currentStaffId
    : "";
  const [staffId, setStaffId] = useState(initial);
  useEffect(() => {
    setStaffId(initial);
  }, [initial, classCode, stream, campus, subjectId, classTeacher, assistantTeacher]);

  const held = posts
    .filter((row) => row.staffId === staffId && row.classCode === classCode && row.stream === stream && row.campus === campus)
    .map((row) => row.subjectId);
  const alreadyLead = leads.some((row) => row.staffId === staffId && row.classCode === classCode && row.stream === stream && row.campus === campus && row.role === "lead");
  const alreadyAssistant = leads.some((row) => row.staffId === staffId && row.classCode === classCode && row.stream === stream && row.campus === campus && row.role === "assistant");
  const subjectIds = [...new Set(subjectId ? [...held, subjectId] : held)];
  const takingOver = Boolean(currentStaffId && staffId && currentStaffId !== staffId);
  const unchanged = Boolean(currentStaffId && staffId === currentStaffId);

  return (
    <DeskForm action={assign} className="stf-claim" quiet status="Assigning" onIssued={onIssued}>
      <input type="hidden" name="staff_id" value={staffId} />
      <input type="hidden" name="term_id" value={termId} />
      <input type="hidden" name="class_code" value={classCode} />
      <input type="hidden" name="stream" value={stream} />
      <input type="hidden" name="campus" value={campus} />
      {takingOver ? <input type="hidden" name="replace" value="1" /> : null}
      {subjectIds.map((id) => <input key={id} type="hidden" name="subject_id" value={id} />)}
      {(classTeacher || (alreadyLead && !assistantTeacher)) && !assistantTeacher ? <input type="hidden" name="class_teacher" value="1" /> : null}
      {(assistantTeacher || (alreadyAssistant && !classTeacher)) && !classTeacher ? <input type="hidden" name="assistant_teacher" value="1" /> : null}
      <select value={staffId} onChange={(event) => setStaffId(event.target.value)} aria-label="Teacher">
        {!currentStaffId ? <option value="">Choose teacher…</option> : null}
        {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
      </select>
      <button type="submit" disabled={unchanged || !staffId}>{takingOver ? "Replace" : "Assign"}</button>
    </DeskForm>
  );
}

function DeleteTeacher({
  member,
  remove,
  compact = false,
}: {
  member: StaffMember;
  remove: SaveStaff;
  compact?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const load = loadOf(member);

  function run() {
    const loadNote = load
      ? ` Their current class/subject posts will be cleared.`
      : "";
    const loginNote = member.profile_id ? " Their sign-in will be revoked." : "";
    if (
      !confirm(
        `Remove ${member.full_name} from the staff list?${loadNote}${loginNote} Homework, resources, schemes, and markbooks they created stay on the system.`,
      )
    ) {
      return;
    }
    const data = new FormData();
    data.set("id", member.id);
    setError("");
    startTransition(async () => {
      let outcome: Awaited<ReturnType<SaveStaff>>;
      try {
        outcome = await remove(data);
      } catch {
        outcome = { error: "Something went wrong. Try again." };
      }
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      if (outcome.href) {
        router.push(outcome.href);
        router.refresh();
        return;
      }
      router.push("/academics_office/staff");
      router.refresh();
    });
  }

  if (compact) {
    return (
      <div className="stf-delete-compact">
        <button type="button" className="stf-delete-btn is-compact" disabled={pending} onClick={run}>
          {pending ? "Removing…" : "Remove"}
        </button>
        {error ? <p className="stf-form-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="stf-danger">
      <div>
        <strong>Remove from staff list</strong>
        <p>Clears class/subject posts and sign-in. Homework, resources, schemes, and markbooks stay.</p>
      </div>
      {error ? <p className="stf-form-error">{error}</p> : null}
      <button type="button" className="stf-delete-btn" disabled={pending} onClick={run}>
        <i className="fa-solid fa-trash-can" aria-hidden="true" />
        {pending ? "Removing…" : `Remove ${member.full_name.split(/\s+/)[0] || "teacher"}`}
      </button>
    </div>
  );
}

function LoginActions({
  member,
  issue,
  reset,
  revoke,
  onIssued,
}: {
  member: StaffMember;
  issue: SaveStaff;
  reset?: SaveStaff;
  revoke: SaveStaff;
  onIssued: (issued: IssuedLogin) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(action: SaveStaff, data: FormData, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setError("");
    startTransition(async () => {
      let outcome: Awaited<ReturnType<SaveStaff>>;
      try {
        outcome = await action(data);
      } catch {
        outcome = { error: "Something went wrong. Try again." };
      }
      if (outcome.email && outcome.password) {
        onIssued({
          email: outcome.email,
          password: outcome.password,
          name: member.full_name,
          temporary: Boolean(outcome.temporary),
        });
      }
      if (outcome.error) setError(outcome.error);
      else router.refresh();
    });
  }

  if (member.profile_id) {
    return (
      <div className="stf-login">
        <div>
          <strong>Sign-in</strong>
          <p>{member.email ? `Active for ${member.email}. Reset the password here if they forget it.` : "Sign-in is linked. Reset the password here if they forget it."}</p>
        </div>
        {reset ? (
          <form
            className="stf-login-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              data.set("id", member.id);
              run(reset, data);
            }}
          >
            <label className="ofc-field">
              <span>New password</span>
              <input name="password" type="password" required minLength={6} autoComplete="new-password" placeholder="At least 6 characters" />
            </label>
            <label className="ofc-field">
              <span>Confirm password</span>
              <input name="confirm" type="password" required minLength={6} autoComplete="new-password" placeholder="Repeat password" />
            </label>
            <div className="stf-login-actions">
              <button type="submit" className="stf-commit" disabled={pending}>{pending ? "Saving…" : "Set password"}</button>
              <button
                type="button"
                className="stf-ghost"
                disabled={pending}
                onClick={() => {
                  const data = new FormData();
                  data.set("id", member.id);
                  data.set("temporary", "1");
                  run(reset, data, `Issue a temporary password for ${member.full_name}? They will change it on first login.`);
                }}
              >
                Temporary password
              </button>
            </div>
          </form>
        ) : null}
        <form
          className="stf-login-revoke"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData();
            data.set("id", member.id);
            run(revoke, data, `Revoke the sign-in for ${member.full_name}?`);
          }}
        >
          <button type="submit" disabled={pending}>{pending ? "Revoking…" : "Revoke sign-in"}</button>
        </form>
        {error ? <p className="stf-form-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="stf-login">
      <div>
        <strong>Sign-in</strong>
        <p>{member.email ? `Create a sign-in for ${member.email}. Set a password now, or leave blank for a temporary one.` : "Save an email on this record, then issue a sign-in."}</p>
      </div>
      <form
        className="stf-login-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          data.set("id", member.id);
          run(issue, data);
        }}
      >
        <label className="ofc-field">
          <span>Password <em>optional</em></span>
          <input name="password" type="password" minLength={6} autoComplete="new-password" placeholder="At least 6 characters" disabled={!member.email} />
        </label>
        <label className="ofc-field">
          <span>Confirm password</span>
          <input name="confirm" type="password" minLength={6} autoComplete="new-password" placeholder="Repeat password" disabled={!member.email} />
        </label>
        <div className="stf-login-actions">
          <button type="submit" className="stf-commit" disabled={pending || !member.email}>{pending ? "Issuing…" : "Issue sign-in"}</button>
        </div>
      </form>
      {error ? <p className="stf-form-error">{error}</p> : null}
    </div>
  );
}

function IssuedLoginCard({
  issued,
  remaining = 0,
  onClose,
}: {
  issued: IssuedLogin;
  remaining?: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"email" | "password" | "both" | null>(null);
  const [showPassword, setShowPassword] = useState(true);
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(kind: "email" | "password" | "both", value: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopied(null);
      setCopyError("Could not copy. Select the text and copy it manually.");
    }
  }

  const both = issued.temporary
    ? `Email: ${issued.email}\nTemporary password: ${issued.password}\n\nSign in, then change this password on first login.`
    : `Email: ${issued.email}\nPassword: ${issued.password}`;

  return (
    <section className="stf-card stf-issued" aria-label="Teacher sign-in" role="status">
      <header className="stf-issued-head">
        <span className="stf-issued-badge" aria-hidden="true"><i className="fa-solid fa-key" /></span>
        <div>
          <p className="stf-issued-kicker">Sign-in ready</p>
          <h2>Share these details with {issued.name.split(/\s+/)[0] || "the teacher"}</h2>
          <p>
            {issued.temporary
              ? "Copy them now. The temporary password will not be shown again. They must change it on first login."
              : "Copy them now. The password will not be shown again."}
          </p>
        </div>
      </header>

      <div className="stf-issued-warn" role="note">
        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
        <span>Do not email this password to a shared inbox. Prefer WhatsApp or hand it over in person.</span>
      </div>

      <div className="stf-issued-fields">
        <div className="stf-issued-field">
          <span>Email</span>
          <div className="stf-issued-value">
            <code>{issued.email}</code>
            <button
              type="button"
              className={copied === "email" ? "is-done" : ""}
              onClick={() => copy("email", issued.email)}
              aria-label={copied === "email" ? "Email copied" : "Copy email"}
            >
              <i className={`fa-solid ${copied === "email" ? "fa-check" : "fa-copy"}`} aria-hidden="true" />
              {copied === "email" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="stf-issued-field">
          <span>{issued.temporary ? "Temporary password" : "Password"}</span>
          <div className="stf-issued-value">
            <code className={showPassword ? "" : "is-masked"}>{showPassword ? issued.password : "••••••••••••"}</code>
            <button
              type="button"
              className="is-ghost"
              onClick={() => setShowPassword((current) => !current)}
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
              {showPassword ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              className={copied === "password" ? "is-done" : ""}
              onClick={() => copy("password", issued.password)}
              aria-label={copied === "password" ? "Password copied" : "Copy password"}
            >
              <i className={`fa-solid ${copied === "password" ? "fa-check" : "fa-copy"}`} aria-hidden="true" />
              {copied === "password" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      {copyError ? <p className="stf-form-error">{copyError}</p> : null}
      {copied === "both" ? <p className="stf-issued-toast" role="status">Email and password copied together.</p> : null}

      <div className="stf-issued-actions">
        <button
          type="button"
          className={`stf-issued-secondary${copied === "both" ? " is-done" : ""}`}
          onClick={() => copy("both", both)}
        >
          <i className={`fa-solid ${copied === "both" ? "fa-check" : "fa-clone"}`} aria-hidden="true" />
          {copied === "both" ? "Copied both" : "Copy email & password"}
        </button>
        <button type="button" className="stf-issued-primary" onClick={onClose}>
          {remaining > 0 ? `Next (${remaining} more)` : "Done"}
        </button>
      </div>
    </section>
  );
}

function CardHead({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <header className="stf-card-head">
      <div className="stf-card-title">
        <span className="stf-card-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </div>
    </header>
  );
}
