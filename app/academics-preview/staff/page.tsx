"use client";

import { PageHeader } from "@/components/admin/PageHeader";
import { StaffDesk } from "@/components/academics/StaffDesk";
import type { StaffMember } from "@/lib/academics-staff";
import "../../admin/admin.css";
import "../../admin/(panel)/applications/applications.css";
import "../../admissions_office/office.css";
import "../../academics_office/academics.css";
import "../../academics_office/(desk)/overview.css";
import "../../academics_office/(desk)/staff/staff.css";

const grace: StaffMember = {
  id: "grace",
  full_name: "Grace Namukasa",
  initials: "GN",
  title: "Class teacher",
  campus: "Kitante",
  email: "grace@kja.ug",
  phone: "+256700000001",
  profile_id: "linked",
  photo_path: null,
  active: true,
  classes: [{ label: "Reception A", href: "#", code: "RC", stream: "A" }],
  subjects: [{
    key: "math",
    subjectId: "math",
    classCode: "RC",
    stream: "A",
    subject: "Mathematics",
    label: "Reception A",
    href: "#",
    papers: 2,
    submitted: 1,
    scheme: { href: "#", title: "Mathematics", status: "submitted", planned: 12, taught: 8, overdue: 1 },
  }],
  periods: [
    { key: "mon", weekday: 1, day: "Monday", period: 1, subject: "Mathematics", label: "Reception A", room: "Room 2" },
    { key: "tue", weekday: 2, day: "Tuesday", period: 3, subject: "Mathematics", label: "Reception A", room: null },
  ],
  lessonsPlanned: 12,
  lessonsTaught: 8,
  lessonsOverdue: 1,
};

const peter: StaffMember = {
  id: "peter",
  full_name: "Peter Okello",
  initials: "PO",
  title: null,
  campus: "Najjanankumbi",
  email: null,
  phone: null,
  profile_id: null,
  photo_path: null,
  active: true,
  classes: [],
  subjects: [],
  periods: [],
  lessonsPlanned: 0,
  lessonsTaught: 0,
  lessonsOverdue: 0,
};

export default function StaffPreview() {
  return (
    <div className="app-page ofc-page acd-page stf-page" style={{ padding: 24, background: "#f6f3ee" }}>
      <PageHeader kicker="Teaching" icon="fa-chalkboard-user" title="Staff" description={<>Term 3 2026 · <strong>2</strong> teachers on the roll.</>} />
      <section className="stf-strip" aria-label="This term">
        <div><span className="stf-stat-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span><span className="stf-stat-copy"><span>On the roll</span><strong>2</strong><small>None hidden</small></span></div>
        <div className="is-ok"><span className="stf-stat-icon" aria-hidden="true"><i className="fa-solid fa-users" /></span><span className="stf-stat-copy"><span>Class teachers</span><strong>1</strong><small>Leading a class</small></span></div>
        <div><span className="stf-stat-icon" aria-hidden="true"><i className="fa-solid fa-book-open" /></span><span className="stf-stat-copy"><span>Subject posts</span><strong>1</strong><small>Class and subject pairs</small></span></div>
        <div className="is-warn"><span className="stf-stat-icon" aria-hidden="true"><i className="fa-solid fa-door-open" /></span><span className="stf-stat-copy"><span>Classes open</span><strong>1</strong><small>No class teacher yet</small></span></div>
      </section>
      <StaffDesk
        members={[grace, peter]}
        gaps={[{ label: "Baby Class A", href: "#" }]}
        groups={[{ code: "RC", stream: "A", label: "Reception A", pupils: 18 }]}
        subjects={[{
          id: "math",
          code: "MATH",
          name: "Mathematics",
          section: "nursery",
          kind: "core",
          sort_order: 1,
          applies_from: null,
          applies_to: null,
          active: true,
          default_skills: [],
        }]}
        posts={[{
          classCode: "RC",
          stream: "A",
          subjectId: "math",
          subject: "Mathematics",
          staffId: "grace",
          staffName: "Grace Namukasa",
        }]}
        leads={[{
          classCode: "RC",
          stream: "A",
          staffId: "grace",
          staffName: "Grace Namukasa",
        }]}
        termId="term-3"
        termLabel="Term 3 2026"
        initialId="grace"
        save={async () => ({ ok: "Saved" })}
        assign={async () => ({ ok: "Saved" })}
        release={async () => ({ ok: "Saved" })}
        remove={async () => ({ ok: "Removed", href: "/academics-preview/staff" })}
      />
    </div>
  );
}
