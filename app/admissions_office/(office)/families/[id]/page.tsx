import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { ContactEditor, FamilyDetailsForm, GuardianEditor } from "@/components/office/FamilyEditors";
import { MigrationHint, OfficeNotice, StudentStatus } from "@/components/office/ui";
import { formatDate } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { OFFICE, className, studentAge, type Family, type FamilyContact, type Guardian } from "@/lib/students";

export const metadata = { title: "Family" };

type Child = {
  id: string;
  full_name: string;
  student_number: string;
  sex: string | null;
  date_of_birth: string | null;
  class_code: string | null;
  stream: string | null;
  status: string;
  enrolled_on: string | null;
  left_on: string | null;
};

export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Family" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase } = auth;

  const { data, error } = await supabase.from("families").select("*").eq("id", id).maybeSingle();
  if (error) return <OfficeNotice title="Family" heading="This family could not be loaded"><MigrationHint message={error.message} /></OfficeNotice>;
  if (!data) notFound();
  const family = data as Family;

  const [{ data: guardianData }, { data: contactData }, { data: childData }] = await Promise.all([
    supabase.from("guardians").select("*").eq("family_id", id).order("relationship"),
    supabase.from("family_contacts").select("*").eq("family_id", id).order("position").order("created_at"),
    supabase.from("students").select("id, full_name, student_number, sex, date_of_birth, class_code, stream, status, enrolled_on, left_on").eq("family_id", id).order("date_of_birth"),
  ]);
  const guardians = (guardianData || []) as Guardian[];
  const contacts = (contactData || []) as FamilyContact[];
  const children = (childData || []) as Child[];
  const current = children.filter((child) => child.status === "active");
  const checks = contacts.filter((contact) => contact.needs_check).length;
  const title = family.mailing_name || guardians.map((guardian) => guardian.full_name).join(" & ") || family.family_code;

  return (
    <div className="app-page ofc-page">
      <Link href={`${OFFICE}/families`} className="app-back"><i className="fa-solid fa-arrow-left" /> Families</Link>
      <PageHeader
        kicker={`Family ${family.family_code}`}
        icon="fa-people-roof"
        title={title}
        description={
          <>
            {current.length ? `${current.length} child${current.length === 1 ? "" : "ren"} at KJA now` : "No children at KJA now"}
            {children.length > current.length ? `, ${children.length - current.length} former pupil${children.length - current.length === 1 ? "" : "s"}` : ""}
            {family.home_area ? ` · ${family.home_area}` : ""}
            {checks ? <> · <strong>{checks} contact{checks === 1 ? "" : "s"} to check</strong></> : null}
          </>
        }
        actions={
          <Link className="admin-hero-btn is-primary" href={`${OFFICE}/students/new?family=${family.id}`}>
            <i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol a sibling
          </Link>
        }
      />

      <div className="app-detail-grid">
        <div className="app-detail-main">
          <section className="admin-card">
            <h2 className="app-card-title">Children <span className="app-count">{children.length}</span></h2>
            {children.length ? (
              <ul className="ofc-children">
                {children.map((child) => {
                  const age = studentAge(child.date_of_birth);
                  return (
                    <li key={child.id} className={child.status === "active" ? "" : "is-gone"}>
                      <span className={`ofc-avatar is-sm is-${child.sex === "M" ? "boy" : child.sex === "F" ? "girl" : "none"}`}>
                        {child.full_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <div>
                        <Link href={`${OFFICE}/students/${child.id}`}><strong>{child.full_name}</strong></Link>
                        <small>
                          <span className="ofc-num">{child.student_number}</span>
                          {child.status === "active"
                            ? ` · ${className(child.class_code)}${child.stream ? ` ${child.stream}` : ""}`
                            : child.left_on ? ` · Left ${formatDate(child.left_on)}` : ""}
                          {age !== null ? ` · ${age} years` : ""}
                        </small>
                      </div>
                      <StudentStatus status={child.status} />
                    </li>
                  );
                })}
              </ul>
            ) : <p className="app-muted">No children linked to this family yet.</p>}
          </section>

          <section className="admin-card">
            <h2 className="app-card-title">Parents and guardians</h2>
            <GuardianEditor familyId={family.id} guardians={guardians} />
          </section>
        </div>

        <aside className="app-detail-side">
          <section className="admin-card" id="contacts">
            <h2 className="app-card-title">Contact list <span className="app-count">{contacts.length}</span></h2>
            <p className="app-muted ofc-tiny">In the order the school should call. The first phone number is used for emergencies.</p>
            <ContactEditor familyId={family.id} contacts={contacts} />
          </section>
          <section className="admin-card">
            <h2 className="app-card-title">Home</h2>
            <FamilyDetailsForm family={family} />
          </section>
        </aside>
      </div>
    </div>
  );
}
