"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  const [deskView, setDeskView] = useState<DeskView>("teachers");
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
  const shownGaps = gapsOpen ? gaps : gaps.slice(0, 8);

  return (
    <div className="stf-desk">
      <div className="stf-modes" role="tablist" aria-label="Staff desk">
        <button type="button" role="tab" aria-selected={deskView === "teachers"} className={deskView === "teachers" ? "is-on" : ""} onClick={() => setDeskView("teachers")}>
          <i className="fa-solid fa-chalkboard-user" aria-hidden="true" />
          <span>Teachers</span>
          <em>{members.filter((member) => member.active).length}</em>
        </button>
        <button type="button" role="tab" aria-selected={deskView === "coverage"} className={deskView === "coverage" ? "is-on" : ""} onClick={() => setDeskView("coverage")}>
          <i className="fa-solid fa-table-list" aria-hidden="true" />
          <span>Fill gaps</span>
          {openPosts ? <em className="is-warn">{openPosts}</em> : <em>0</em>}
        </button>
      </div>

      {deskView === "teachers" && gaps.length ? (
        <div className="stf-banner">
          <div>
            <strong>{gaps.length === 1 ? "1 class still needs a class teacher" : `${gaps.length} classes still need a class teacher`}</strong>
            <p>Open Fill gaps to assign class teachers and subject posts by stream.</p>
          </div>
          <button type="button" onClick={() => setDeskView("coverage")}>Fill gaps</button>
        </div>
      ) : null}

      {issued ? <IssuedLoginCard issued={issued} remaining={issuedQueue.length - 1} onClose={dismissIssued} /> : null}
      {loginNotes.length ? (
        <div className="stf-banner is-warn" role="status">
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
            <header className="stf-card-head">
              <div className="stf-card-title">
                <span className="stf-card-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span>
                <div>
                  <h2>Directory</h2>
                  <p>{termLabel ? `Find a teacher, then assign classes for ${termLabel}.` : "Add teachers first. Set a current term to assign work."}</p>
                </div>
              </div>
              <button className={`stf-add${adding ? " is-on" : ""}`} type="button" onClick={() => choose("new")}>
                <i className="fa-solid fa-plus" aria-hidden="true" /> Add
              </button>
            </header>
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
                <p><strong>{gaps.length}</strong> {gaps.length === 1 ? "class has" : "classes have"} no class teacher.</p>
                <div>
                  {shownGaps.map((gap) => <Link key={gap.href} href={gap.href}>{gap.label}</Link>)}
                  {gaps.length > 8 ? <button type="button" onClick={() => setGapsOpen((open) => !open)}>{gapsOpen ? "Show fewer" : `+${gaps.length - 8} more`}</button> : null}
                </div>
              </div>
            ) : null}
            {visible.length ? (
              <ul className="stf-people">
                {visible.map((member) => (
                  <li key={member.id}>
                    <button type="button" className={`${member.id === memberId ? "is-on" : ""} ${member.active ? "" : "is-hidden"}`.trim()} onClick={() => choose(member.id)}>
                      <TeacherFace id={member.id} name={member.full_name} photoPath={member.photo_path} className="stf-face" />
                      <span>
                        <strong>{member.full_name}</strong>
                        <small>{[member.title, member.campus].filter(Boolean).join(" · ") || "Teacher"}</small>
                      </span>
                      <em>{member.classes.length ? member.classes.map((row) => row.label).join(", ") : member.subjects.length === 1 ? "1 subject" : member.subjects.length ? `${member.subjects.length} subjects` : "No load"}</em>
                    </button>
                  </li>
                ))}
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

  return (
    <div className="stf-file">
      <section className="stf-card" aria-label={member.full_name}>
        <header className="stf-file-head">
          <TeacherFace id={member.id} name={member.full_name} photoPath={member.photo_path} className="stf-face is-lg" />
          <div>
            <h2>{member.full_name}</h2>
            <p>{[member.title, member.campus, termLabel].filter(Boolean).join(" · ") || "Teacher"}</p>
            <div className="stf-pills">
              {member.initials ? <span className="stf-pill is-linked" title="Report card initials">{member.initials}</span> : null}
              {member.classes.length ? <span className="stf-pill is-class">Class teacher</span> : null}
              {member.profile_id ? <span className="stf-pill is-linked">Can sign in</span> : <span className="stf-pill">No sign-in</span>}
              {!member.active ? <span className="stf-pill is-hidden">Hidden</span> : null}
              {member.lessonsOverdue ? <span className="stf-pill is-late">{member.lessonsOverdue} overdue</span> : null}
              {!load && member.active ? <span className="stf-pill is-late">Needs assignments</span> : null}
            </div>
          </div>
          <DeleteTeacher member={member} remove={remove} compact />
        </header>
        <div className="stf-contact">
          {member.email ? <a href={`mailto:${member.email}`}><i className="fa-solid fa-envelope" aria-hidden="true" /> {member.email}</a> : <span>No email</span>}
          {telHref(member.phone) ? <a href={telHref(member.phone)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(member.phone)}</a> : <span>No phone</span>}
        </div>
        <div className="stf-figs" aria-label="This term">
          <div><span>Classes</span><strong>{member.classes.length}</strong></div>
          <div><span>Subjects</span><strong>{member.subjects.length}</strong></div>
          <div><span>Periods</span><strong>{member.periods.length}</strong></div>
          <div><span>Markbooks</span><strong>{submitted}/{papers}</strong></div>
          <div><span>Lessons</span><strong>{member.lessonsTaught}/{member.lessonsPlanned}</strong></div>
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
          <section className="stf-card" aria-label="Classes">
            <CardHead icon="fa-users" title="Classes led" text="Where this teacher is the class teacher." />
            {member.classes.length ? (
              <ul className="stf-rows">
                {member.classes.map((row) => (
                  <li key={row.href}><Link href={row.href}><strong>{row.label}</strong><small>Class teacher</small><em>Open</em></Link></li>
                ))}
              </ul>
            ) : (
              <div className="stf-quiet-box">
                <p>Not a class teacher this term.</p>
                {termId ? <button type="button" className="stf-linkish" onClick={() => setTab("assign")}>Assign a class</button> : null}
              </div>
            )}
          </section>

          <section className="stf-card" aria-label="Subjects">
            <CardHead icon="fa-book-open" title="Subjects" text="Scheme coverage and markbooks for each class." />
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

          <section className="stf-card" aria-label="Timetable">
            <CardHead icon="fa-calendar-week" title="This week" text="Periods already on the timetable." />
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
    <section className="stf-card stf-file" aria-label="Add a teacher">
      <CardHead icon="fa-user-plus" title="Add a teacher" text="Enter their name and report-card initials. Add an email and password if they should sign in right away." />
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
  const streams = groups.filter((group) => group.code === code);
  const [stream, setStream] = useState(streams[0]?.stream ?? "");
  const chosen = streams.some((group) => group.stream === stream) ? stream : (streams[0]?.stream ?? "");
  const fitting = subjects.filter((subject) => subjectFits(subject, code));
  const lead = leads.find((row) => row.classCode === code && row.stream === chosen) || null;
  const rows = fitting.map((subject) => {
    const post = posts.find((row) => row.classCode === code && row.stream === chosen && row.subjectId === subject.id) || null;
    return { id: subject.id, name: subject.name, teacher: post?.staffName || "" };
  });
  const openSubjects = rows.filter((row) => !row.teacher).length;
  const openLead = lead ? 0 : 1;

  function chooseClass(next: string) {
    setCode(next);
    setStream(groups.find((group) => group.code === next)?.stream ?? "");
  }

  return (
    <section className="stf-card stf-cover" aria-label="Fill gaps">
      <CardHead
        icon="fa-table-list"
        title="Fill gaps by stream"
        text={termLabel ? `Pick a class and stream, then assign anyone who is missing for ${termLabel}. One teacher per subject.` : "Set a current term to fill class teacher and subject posts."}
      />
      {!termLabel ? <p className="stf-quiet">Assignments start once a term is current.</p> : null}
      {termLabel && !groups.length ? <p className="stf-quiet">No class has pupils yet.</p> : null}
      {termLabel && groups.length ? (
        <>
          <div className="stf-cover-tools">
            <label className="stf-select">
              <span>Class</span>
              <select value={code} onChange={(event) => chooseClass(event.target.value)} aria-label="Class">
                {codes.map((entry) => <option key={entry} value={entry}>{className(entry)}</option>)}
              </select>
            </label>
            <label className="stf-select">
              <span>Stream</span>
              <select value={chosen} onChange={(event) => setStream(event.target.value)} aria-label="Stream">
                {streams.map((group) => <option key={group.stream || "-"} value={group.stream}>{streamName(group.stream)} · {group.pupils}</option>)}
              </select>
            </label>
            <p className={openSubjects + openLead ? "is-warn" : "is-ok"}>
              {openSubjects + openLead === 0 ? "Every post is filled." : `${openSubjects + openLead} ${openSubjects + openLead === 1 ? "post is" : "posts are"} still open.`}
            </p>
          </div>
          <table className="stf-board">
            <thead>
              <tr>
                <th scope="col">Post</th>
                <th scope="col">Teacher</th>
              </tr>
            </thead>
            <tbody>
              <tr className={lead ? "" : "is-open"}>
                <th scope="row">Class teacher</th>
                <td>
                  {lead?.staffName || (termId && teachers.length ? (
                    <ClaimPost assign={assign} teachers={teachers} posts={posts} leads={leads} termId={termId} classCode={code} stream={chosen} classTeacher onIssued={onIssued} />
                  ) : "Open")}
                </td>
              </tr>
              {rows.map((row) => (
                <tr key={row.id} className={row.teacher ? "" : "is-open"}>
                  <th scope="row">{row.name}</th>
                  <td>
                    {row.teacher || (termId && teachers.length ? (
                      <ClaimPost assign={assign} teachers={teachers} posts={posts} leads={leads} termId={termId} classCode={code} stream={chosen} subjectId={row.id} onIssued={onIssued} />
                    ) : "Open")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!fitting.length ? <p className="stf-quiet">No subjects apply to this class.</p> : null}
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
  const codes = classCodes(groups);
  const [code, setCode] = useState(codes[0] || "");
  const streams = groups.filter((group) => group.code === code);
  const [stream, setStream] = useState(streams[0]?.stream ?? "");
  const chosen = streams.some((group) => group.stream === stream) ? stream : (streams[0]?.stream ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [leadOn, setLeadOn] = useState(false);
  const [replace, setReplace] = useState(false);
  const fitting = subjects.filter((subject) => subjectFits(subject, code));
  const classHolder = leads.find((row) => row.classCode === code && row.stream === chosen) || null;
  const mine = posts.filter((row) => row.staffId === member.id).sort((a, b) => (CLASS_ORDER.get(a.classCode) ?? 99) - (CLASS_ORDER.get(b.classCode) ?? 99) || a.subject.localeCompare(b.subject));
  const mineLeads = leads.filter((row) => row.staffId === member.id).sort((a, b) => (CLASS_ORDER.get(a.classCode) ?? 99) - (CLASS_ORDER.get(b.classCode) ?? 99) || a.stream.localeCompare(b.stream));

  useEffect(() => {
    setPicked(posts.filter((row) => row.staffId === member.id && row.classCode === code && row.stream === chosen).map((row) => row.subjectId));
    setLeadOn(leads.some((row) => row.staffId === member.id && row.classCode === code && row.stream === chosen));
    setReplace(false);
  }, [member.id, code, chosen, posts, leads]);

  function chooseClass(next: string) {
    setCode(next);
    setStream(groups.find((group) => group.code === next)?.stream ?? "");
  }

  function holder(subjectId: string) {
    return posts.find((row) => row.classCode === code && row.stream === chosen && row.subjectId === subjectId) || null;
  }

  return (
    <section className="stf-card" aria-label="Assignments">
      <CardHead
        icon="fa-list-check"
        title="Assign work"
        text={termLabel ? `Choose a stream, tick the subjects this teacher should take, then save. One stream at a time.` : "Set a current term before assigning classes and subjects."}
      />
      {mineLeads.length || mine.length ? (
        <div className="stf-current">
          <p className="stf-current-label">Currently assigned</p>
          <ul className="stf-posts">
            {mineLeads.map((row) => (
              <li key={`class-${row.classCode}-${row.stream}`}>
                <span><strong>{groups.find((group) => group.code === row.classCode && group.stream === row.stream)?.label || row.classCode}</strong><small>Class teacher</small></span>
                {termId ? (
                  <DeskForm action={release} className="stf-drop">
                    <input type="hidden" name="staff_id" value={member.id} />
                    <input type="hidden" name="term_id" value={termId} />
                    <input type="hidden" name="class_code" value={row.classCode} />
                    <input type="hidden" name="stream" value={row.stream} />
                    <input type="hidden" name="kind" value="class" />
                    <button type="submit">Remove</button>
                  </DeskForm>
                ) : null}
              </li>
            ))}
            {mine.map((row) => (
              <li key={`${row.classCode}-${row.stream}-${row.subjectId}`}>
                <span><strong>{row.subject}</strong><small>{groups.find((group) => group.code === row.classCode && group.stream === row.stream)?.label || row.classCode}</small></span>
                {termId ? (
                  <DeskForm action={release} className="stf-drop">
                    <input type="hidden" name="staff_id" value={member.id} />
                    <input type="hidden" name="term_id" value={termId} />
                    <input type="hidden" name="class_code" value={row.classCode} />
                    <input type="hidden" name="stream" value={row.stream} />
                    <input type="hidden" name="subject_id" value={row.subjectId} />
                    <input type="hidden" name="kind" value="subject" />
                    <button type="submit">Remove</button>
                  </DeskForm>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="stf-quiet">Nothing assigned yet this term.</p>}
      {termId && groups.length ? (
        <DeskForm action={assign} className="stf-form stf-assign" onIssued={onIssued}>
          <input type="hidden" name="staff_id" value={member.id} />
          <input type="hidden" name="term_id" value={termId} />
          <input type="hidden" name="class_code" value={code} />
          <input type="hidden" name="stream" value={chosen} />
          {!member.profile_id ? (
            <p className="stf-quiet">
              {member.email
                ? "Saving will create a teacher desk sign-in for this email if they do not have one yet."
                : "Add an email on the record tab before assigning. They need it to open the teacher desk."}
            </p>
          ) : null}
          <p className="stf-step-label"><span>1</span> Choose the stream</p>
          <div className="stf-assign-row">
            <label className="ofc-field">
              <span>Class</span>
              <select value={code} onChange={(event) => chooseClass(event.target.value)} aria-label="Class to assign">
                {codes.map((entry) => <option key={entry} value={entry}>{className(entry)}</option>)}
              </select>
            </label>
            <label className="ofc-field">
              <span>Stream</span>
              <select value={chosen} onChange={(event) => setStream(event.target.value)} aria-label="Stream to assign">
                {streams.map((group) => <option key={group.stream || "-"} value={group.stream}>{streamName(group.stream)} · {group.pupils} {group.pupils === 1 ? "pupil" : "pupils"}</option>)}
              </select>
            </label>
          </div>
          <p className="stf-step-label"><span>2</span> Tick what they teach</p>
          <div className="stf-picks" role="group" aria-label="Subjects">
            {fitting.length ? fitting.map((subject) => {
              const current = holder(subject.id);
              const blocked = Boolean(current && current.staffId !== member.id && !replace);
              const checked = picked.includes(subject.id) && !blocked;
              return (
                <label key={subject.id} className={`${checked ? "is-on" : ""}${blocked ? " is-blocked" : ""}`.trim()}>
                  <input
                    type="checkbox"
                    name="subject_id"
                    value={subject.id}
                    checked={checked}
                    disabled={blocked}
                    onChange={(event) => setPicked((currentIds) => event.target.checked ? [...currentIds, subject.id] : currentIds.filter((id) => id !== subject.id))}
                  />
                  <span>{subject.name}</span>
                  <small>{current ? (current.staffId === member.id ? "This teacher" : current.staffName) : "Open"}</small>
                </label>
              );
            }) : <p className="stf-picks-empty">No subjects apply to this class.</p>}
          </div>
          <label className={`stf-check${classHolder && classHolder.staffId !== member.id && !replace ? " is-blocked" : ""}${leadOn ? " is-on" : ""}`}>
            <input
              type="checkbox"
              name="class_teacher"
              value="1"
              checked={leadOn && !(classHolder && classHolder.staffId !== member.id && !replace)}
              disabled={Boolean(classHolder && classHolder.staffId !== member.id && !replace)}
              onChange={(event) => setLeadOn(event.target.checked)}
            />
            <span>
              Class teacher of this stream
              <small>{classHolder ? (classHolder.staffId === member.id ? "This teacher" : classHolder.staffName) : "Open"}</small>
            </span>
          </label>
          <label className="stf-check is-soft">
            <input type="checkbox" name="replace" value="1" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
            <span>Replace whoever holds a post already</span>
          </label>
          <button className="stf-commit" type="submit">Save assignments</button>
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
  subjectId,
  classTeacher = false,
  onIssued,
}: {
  assign: PostAction;
  teachers: { id: string; name: string }[];
  posts: StaffPost[];
  leads: StaffLead[];
  termId: string;
  classCode: string;
  stream: string;
  subjectId?: string;
  classTeacher?: boolean;
  onIssued?: (issued: { email: string; password: string; temporary?: boolean }) => void;
}) {
  const [staffId, setStaffId] = useState(teachers[0]?.id || "");
  const held = posts.filter((row) => row.staffId === staffId && row.classCode === classCode && row.stream === stream).map((row) => row.subjectId);
  const alreadyLead = leads.some((row) => row.staffId === staffId && row.classCode === classCode && row.stream === stream);
  const subjectIds = [...new Set(subjectId ? [...held, subjectId] : held)];

  return (
    <DeskForm action={assign} className="stf-claim" onIssued={onIssued}>
      <input type="hidden" name="staff_id" value={staffId} />
      <input type="hidden" name="term_id" value={termId} />
      <input type="hidden" name="class_code" value={classCode} />
      <input type="hidden" name="stream" value={stream} />
      {subjectIds.map((id) => <input key={id} type="hidden" name="subject_id" value={id} />)}
      {classTeacher || alreadyLead ? <input type="hidden" name="class_teacher" value="1" /> : null}
      <select value={staffId} onChange={(event) => setStaffId(event.target.value)} aria-label="Teacher">
        {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
      </select>
      <button type="submit">Assign</button>
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
