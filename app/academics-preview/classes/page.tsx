import { ClassesDesk, type ClassRow, type ClassesTotals } from "@/components/academics/ClassesDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import "../../admin/admin.css";
import "../../admin/(panel)/applications/applications.css";
import "../../admissions_office/office.css";
import "../../academics_office/academics.css";
import "../../academics_office/(desk)/overview.css";
import "../../academics_office/(desk)/classes/classes.css";

function row(partial: ClassRow): ClassRow {
  return partial;
}

const rows: ClassRow[] = [
  row({ code: "RC", name: "Reception Class", stream: "A", section: "nursery", pupils: 22, boys: 10, girls: 12, teacher: "Grace Namukasa", href: "/academics_office/classes/RC?stream=A" }),
  row({ code: "RC", name: "Reception Class", stream: "B", section: "nursery", pupils: 20, boys: 11, girls: 9, teacher: "Mary Atim", href: "/academics_office/classes/RC?stream=B" }),
  row({ code: "C2", name: "Baby Class", stream: "A", section: "nursery", pupils: 24, boys: 13, girls: 11, teacher: "Peter Okello", href: "/academics_office/classes/C2?stream=A" }),
  row({ code: "C3", name: "Middle Class", stream: "A", section: "nursery", pupils: 18, boys: 8, girls: 10, teacher: null, href: "/academics_office/classes/C3?stream=A" }),
  row({ code: "C4", name: "Top Class", stream: "A", section: "nursery", pupils: 21, boys: 9, girls: 12, teacher: "Sarah Nakato", href: "/academics_office/classes/C4?stream=A" }),
  row({ code: "P1", name: "Primary One", stream: "JR", section: "primary", pupils: 32, boys: 17, girls: 15, teacher: "Daniel Ssewanyana", href: "/academics_office/classes/P1?stream=JR" }),
  row({ code: "P2", name: "Primary Two", stream: "LP", section: "primary", pupils: 28, boys: 14, girls: 14, teacher: "Joan Mbabazi", href: "/academics_office/classes/P2?stream=LP" }),
  row({ code: "P3", name: "Primary Three", stream: "PM", section: "primary", pupils: 30, boys: 16, girls: 14, teacher: "James Kato", href: "/academics_office/classes/P3?stream=PM" }),
  row({ code: "P4", name: "Primary Four", stream: "TG", section: "primary", pupils: 26, boys: 12, girls: 14, teacher: null, href: "/academics_office/classes/P4?stream=TG" }),
  row({ code: "P5", name: "Primary Five", stream: "A", section: "primary", pupils: 29, boys: 15, girls: 14, teacher: "Amina Nalwoga", href: "/academics_office/classes/P5?stream=A" }),
  row({ code: "P6", name: "Primary Six", stream: "A", section: "primary", pupils: 27, boys: 13, girls: 14, teacher: "Brian Mugisha", href: "/academics_office/classes/P6?stream=A" }),
  row({ code: "P7", name: "Primary Seven", stream: "A", section: "primary", pupils: 25, boys: 12, girls: 13, teacher: "Esther Akello", href: "/academics_office/classes/P7?stream=A" }),
];

const totals: ClassesTotals = {
  pupils: rows.reduce((sum, item) => sum + item.pupils, 0),
  boys: rows.reduce((sum, item) => sum + item.boys, 0),
  girls: rows.reduce((sum, item) => sum + item.girls, 0),
  classes: rows.length,
  nurseryPupils: rows.filter((item) => item.section === "nursery").reduce((sum, item) => sum + item.pupils, 0),
  nurseryClasses: rows.filter((item) => item.section === "nursery").length,
  primaryPupils: rows.filter((item) => item.section === "primary").reduce((sum, item) => sum + item.pupils, 0),
  primaryClasses: rows.filter((item) => item.section === "primary").length,
  taught: rows.filter((item) => item.teacher).length,
  untaught: rows.filter((item) => !item.teacher).length,
};

export default function ClassesPreview() {
  return (
    <div className="kja-admin kja-office acd-page" style={{ minHeight: "100vh", background: "#efe8dc" }}>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
        <div className="app-page ofc-page acl-page">
          <PageHeader
            kicker="Teaching"
            icon="fa-chalkboard"
            title="Classes"
            description={<>Class teachers and enrolment for <strong>Term 3 2026</strong>. Pupil moves stay in the admissions office.</>}
            actions={
              <>
                <a className="admin-hero-btn is-primary" href="/academics_office/attendance"><i className="fa-solid fa-clipboard-user" aria-hidden="true" /> Today&apos;s registers</a>
                <a className="admin-hero-btn" href="/academics_office/staff"><i className="fa-solid fa-chalkboard-user" aria-hidden="true" /> Staff</a>
              </>
            }
          />
          <ClassesDesk rows={rows} totals={totals} term="Term 3 2026" section="" need="" />
        </div>
      </main>
    </div>
  );
}
