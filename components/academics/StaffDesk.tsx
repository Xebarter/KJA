"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DeskForm } from "@/components/academics/Form";
import { CAMPUS_OPTIONS } from "@/lib/applications";
import type { SubjectRow } from "@/lib/academics";
import { subjectFits } from "@/lib/subject-bands";
import type { StaffGap, StaffGroup, StaffLead, StaffMember, StaffPost } from "@/lib/academics-staff";
import { className, displayPhone, SCHOOL_CLASSES, telHref } from "@/lib/students";

type SaveStaff = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;
type PostAction = SaveStaff;
type Duty = "all" | "class" | "subject" | "open" | "hidden";

const DUTIES: { id: Duty; label: string }[] = [
  { id: "all", label: "All" },
  { id: "class", label: "Class teachers" },
  { id: "subject", label: "Subject teachers" },
  { id: "open", label: "Unassigned" },
  { id: "hidden", label: "Hidden" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
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
  save,
  assign,
  release,
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
  save: SaveStaff;
  assign: PostAction;
  release: PostAction;
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
    <>
    <Coverage groups={groups} subjects={subjects} posts={posts} leads={leads} termLabel={termLabel} />
    <div className="stf-layout">
      <section className="stf-card stf-directory" aria-label="Teachers">
        <header className="stf-card-head">
          <div className="stf-card-title">
            <span className="stf-card-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span>
            <div>
              <h2>Teachers</h2>
              <p>{termLabel ? `Assignments for ${termLabel}.` : "Add a current term to see who teaches what."}</p>
            </div>
          </div>
          <button className="stf-add" type="button" onClick={() => choose("new")}>Add a teacher</button>
        </header>
        <div className="stf-tools">
          <label className="stf-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, class, or subject" aria-label="Search teachers" />
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
                <option value="name">Name</option>
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
            <p><strong>{gaps.length}</strong> {gaps.length === 1 ? "class has" : "classes have"} no class teacher this term.</p>
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
                  <span className="stf-face" aria-hidden="true">{initials(member.full_name)}</span>
                  <span>
                    <strong>{member.full_name}</strong>
                    <small>{[member.title, member.campus].filter(Boolean).join(" · ") || "Teacher"}</small>
                  </span>
                  <em>{member.classes.length ? member.classes.map((row) => row.label).join(", ") : member.subjects.length === 1 ? "1 subject" : member.subjects.length ? `${member.subjects.length} subjects` : "No load"}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="stf-quiet">No teacher matches this view.</p>}
      </section>

      {adding ? (
        <TeacherForm save={save} campuses={campuses} />
      ) : selected ? (
        <TeacherFile key={selected.id} member={selected} save={save} campuses={campuses} termLabel={termLabel} groups={groups} subjects={subjects} posts={posts} leads={leads} termId={termId} assign={assign} release={release} />
      ) : null}
    </div>
    </>
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
}) {
  const papers = member.subjects.reduce((sum, row) => sum + row.papers, 0);
  const submitted = member.subjects.reduce((sum, row) => sum + row.submitted, 0);
  const days = DAYS.map((day, index) => ({ day, rows: member.periods.filter((row) => row.weekday === index + 1) })).filter((day) => day.rows.length);
  const campusChoices = member.campus && !campuses.includes(member.campus) ? [member.campus, ...campuses] : campuses;

  return (
    <div className="stf-file">
      <section className="stf-card" aria-label={member.full_name}>
        <header className="stf-file-head">
          <span className="stf-face is-lg" aria-hidden="true">{initials(member.full_name)}</span>
          <div>
            <h2>{member.full_name}</h2>
            <p>{[member.title, member.campus, termLabel].filter(Boolean).join(" · ") || "Teacher"}</p>
            <div className="stf-pills">
              {member.classes.length ? <span className="stf-pill is-class">Class teacher</span> : null}
              {member.profile_id ? <span className="stf-pill is-linked">Can sign in</span> : <span className="stf-pill">No sign-in</span>}
              {!member.active ? <span className="stf-pill is-hidden">Hidden</span> : null}
              {member.lessonsOverdue ? <span className="stf-pill is-late">{member.lessonsOverdue} overdue</span> : null}
            </div>
          </div>
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
      </section>

      <Assignments member={member} groups={groups} subjects={subjects} posts={posts} leads={leads} termId={termId} termLabel={termLabel} assign={assign} release={release} />

      <section className="stf-card" aria-label="Classes">
        <CardHead icon="fa-users" title="Classes led" text="Class teacher for this term." />
        {member.classes.length ? (
          <ul className="stf-rows">
            {member.classes.map((row) => (
              <li key={row.href}><Link href={row.href}><strong>{row.label}</strong><small>Class teacher</small><em>Open</em></Link></li>
            ))}
          </ul>
        ) : <p className="stf-quiet">Not a class teacher this term.</p>}
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
        ) : <p className="stf-quiet">No subject assigned this term.</p>}
      </section>

      <section className="stf-card" aria-label="Timetable">
        <CardHead icon="fa-calendar-week" title="Week" text="Periods on the timetable." />
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

      <section className="stf-card" aria-label="Record">
        <CardHead icon="fa-pen" title="Record" text="Name, campus, contact, and sign-in." />
        <DeskForm action={save} className="stf-form">
          <input type="hidden" name="id" value={member.id} />
          <input type="hidden" name="profile_id" value={member.profile_id || ""} />
          <input type="hidden" name="active" value={member.active ? "1" : "0"} />
          <label className="ofc-field"><span>Name</span><input name="full_name" defaultValue={member.full_name} required /></label>
          <label className="ofc-field"><span>Title</span><input name="title" defaultValue={member.title || ""} placeholder="Class teacher" /></label>
          <label className="ofc-field"><span>Campus</span>
            <select name="campus" defaultValue={member.campus || ""}>
              <option value="">Not set</option>
              {campusChoices.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="ofc-field"><span>Email</span><input name="email" type="email" defaultValue={member.email || ""} /></label>
          <label className="ofc-field"><span>Phone</span><input name="phone" defaultValue={member.phone || ""} /></label>
          {member.profile_id ? <label className="stf-check"><input type="checkbox" name="clear_link" value="1" /> Remove the sign-in link</label> : null}
          <button className="stf-commit" type="submit">Save record</button>
        </DeskForm>
        <DeskForm action={save} className="stf-hide">
          <input type="hidden" name="id" value={member.id} />
          <input type="hidden" name="full_name" value={member.full_name} />
          <input type="hidden" name="title" value={member.title || ""} />
          <input type="hidden" name="campus" value={member.campus || ""} />
          <input type="hidden" name="email" value={member.email || ""} />
          <input type="hidden" name="phone" value={member.phone || ""} />
          <input type="hidden" name="profile_id" value={member.profile_id || ""} />
          <input type="hidden" name="active" value={member.active ? "0" : "1"} />
          <button type="submit">{member.active ? "Hide from assignments" : "Show on assignments"}</button>
        </DeskForm>
      </section>
    </div>
  );
}

function TeacherForm({ save, campuses }: { save: SaveStaff; campuses: string[] }) {
  return (
    <section className="stf-card stf-file" aria-label="Add a teacher">
      <CardHead icon="fa-user-plus" title="Add a teacher" text="This list is for class and subject assignments. It stays separate from the public profiles on the website." />
      <DeskForm action={save} className="stf-form">
        <label className="ofc-field"><span>Name</span><input name="full_name" required /></label>
        <label className="ofc-field"><span>Title</span><input name="title" placeholder="Class teacher" /></label>
        <label className="ofc-field"><span>Campus</span>
          <select name="campus" defaultValue="">
            <option value="">Not set</option>
            {campuses.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="ofc-field"><span>Email</span><input name="email" type="email" /></label>
        <label className="ofc-field"><span>Phone</span><input name="phone" /></label>
        <label className="stf-check"><input type="checkbox" name="link_me" value="1" /> Link this teacher to my sign-in</label>
        <button className="stf-commit" type="submit">Add teacher</button>
      </DeskForm>
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
  termLabel,
}: {
  groups: StaffGroup[];
  subjects: SubjectRow[];
  posts: StaffPost[];
  leads: StaffLead[];
  termLabel: string | null;
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
    <section className="stf-card stf-cover" aria-label="Stream coverage">
      <CardHead icon="fa-table-list" title="Stream coverage" text={termLabel ? `Who teaches each subject in ${termLabel}. One teacher per subject.` : "Set a current term to see who teaches each subject."} />
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
            <p>{openSubjects + openLead === 0 ? "Every post is filled." : `${openSubjects + openLead} ${openSubjects + openLead === 1 ? "post is" : "posts are"} open.`}</p>
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
                <td>{lead?.staffName || "Open"}</td>
              </tr>
              {rows.map((row) => (
                <tr key={row.id} className={row.teacher ? "" : "is-open"}>
                  <th scope="row">{row.name}</th>
                  <td>{row.teacher || "Open"}</td>
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
      <CardHead icon="fa-list-check" title="Assignments" text={termLabel ? `Subjects and class teacher for ${termLabel}. Save one stream at a time.` : "Set a current term before assigning classes and subjects."} />
      {mineLeads.length || mine.length ? (
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
      ) : <p className="stf-quiet">No class or subject this term.</p>}
      {termId && groups.length ? (
        <DeskForm action={assign} className="stf-form stf-assign">
          <input type="hidden" name="staff_id" value={member.id} />
          <input type="hidden" name="term_id" value={termId} />
          <input type="hidden" name="class_code" value={code} />
          <input type="hidden" name="stream" value={chosen} />
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
          <div className="stf-picks" role="group" aria-label="Subjects">
            <p>Subjects</p>
            {fitting.length ? fitting.map((subject) => {
              const current = holder(subject.id);
              const blocked = Boolean(current && current.staffId !== member.id && !replace);
              const checked = picked.includes(subject.id) && !blocked;
              return (
                <label key={subject.id} className={blocked ? "is-blocked" : ""}>
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
          <label className={`stf-check${classHolder && classHolder.staffId !== member.id && !replace ? " is-blocked" : ""}`}>
            <input
              type="checkbox"
              name="class_teacher"
              value="1"
              checked={leadOn && !(classHolder && classHolder.staffId !== member.id && !replace)}
              disabled={Boolean(classHolder && classHolder.staffId !== member.id && !replace)}
              onChange={(event) => setLeadOn(event.target.checked)}
            />
            Class teacher of this stream
            <small>{classHolder ? (classHolder.staffId === member.id ? "This teacher" : classHolder.staffName) : "Open"}</small>
          </label>
          <label className="stf-check">
            <input type="checkbox" name="replace" value="1" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
            Replace the current teacher
          </label>
          <button className="stf-commit" type="submit">Save assignments</button>
        </DeskForm>
      ) : null}
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
