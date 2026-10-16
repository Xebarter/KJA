"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DeskForm } from "@/components/academics/Form";
import { CAMPUS_OPTIONS } from "@/lib/applications";
import type { StaffGap, StaffMember } from "@/lib/academics-staff";
import { displayPhone, telHref } from "@/lib/students";

type SaveStaff = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;
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
  termLabel,
  initialId,
  save,
}: {
  members: StaffMember[];
  gaps: StaffGap[];
  termLabel: string | null;
  initialId: string;
  save: SaveStaff;
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
        <TeacherFile key={selected.id} member={selected} save={save} campuses={campuses} termLabel={termLabel} />
      ) : null}
    </div>
  );
}

function TeacherFile({ member, save, campuses, termLabel }: { member: StaffMember; save: SaveStaff; campuses: string[]; termLabel: string | null }) {
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
