import { saveDevelopmentalDomain, saveDevelopmentalSkill, saveSubject } from "@/app/academics_office/(desk)/actions";
import { SubjectsDomainsPage } from "@/components/academics/SubjectsDomainsPage";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { mapSubject } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import {
  isNurseryDivisionId,
  mapDomain,
  mapSkill,
  type NurseryDivisionId,
} from "@/lib/nursery-dsba";
import { SCHOOL_CLASSES } from "@/lib/students";

export const metadata = { title: "Subjects / Domains" };

export default async function SubjectsPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Subjects / Domains" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Subjects / Domains" />;

  const [{ data, error }, domainsQuery, skillsQuery, domainLinksQuery, skillLinksQuery] = await Promise.all([
    opened.auth.supabase.from("subjects").select("*").order("sort_order"),
    opened.auth.supabase.from("developmental_domains").select("*").order("sort_order"),
    opened.auth.supabase.from("developmental_skills").select("*").order("sort_order"),
    opened.auth.supabase.from("domain_division_links").select("domain_id, division_id"),
    opened.auth.supabase.from("skill_division_links").select("skill_id, division_id"),
  ]);

  if (error) return <AcademicsGate title="Subjects / Domains" state={{ notice: "schema", message: error.message }} />;
  const subjects = ((data || []) as Record<string, unknown>[]).map(mapSubject);

  const domainsError =
    domainsQuery.error?.message ||
    skillsQuery.error?.message ||
    domainLinksQuery.error?.message ||
    skillLinksQuery.error?.message ||
    null;

  const domainDivisions = new Map<string, NurseryDivisionId[]>();
  for (const row of domainLinksQuery.data || []) {
    const domainId = String(row.domain_id);
    const divisionId = String(row.division_id);
    if (!isNurseryDivisionId(divisionId)) continue;
    const list = domainDivisions.get(domainId) || [];
    list.push(divisionId);
    domainDivisions.set(domainId, list);
  }
  const skillDivisions = new Map<string, NurseryDivisionId[]>();
  for (const row of skillLinksQuery.data || []) {
    const skillId = String(row.skill_id);
    const divisionId = String(row.division_id);
    if (!isNurseryDivisionId(divisionId)) continue;
    const list = skillDivisions.get(skillId) || [];
    list.push(divisionId);
    skillDivisions.set(skillId, list);
  }

  const domains = ((domainsQuery.data || []) as Record<string, unknown>[]).map((row) =>
    mapDomain(row, domainDivisions.get(String(row.id)) || []),
  );
  const skills = ((skillsQuery.data || []) as Record<string, unknown>[]).map((row) =>
    mapSkill(row, skillDivisions.get(String(row.id)) || []),
  );

  return (
    <div className="app-page ofc-page asb-page">
      <SubjectsDomainsPage
        subjects={subjects}
        classes={SCHOOL_CLASSES.map((entry) => ({
          code: entry.code,
          name: entry.name,
          order: entry.order,
          section: entry.section,
        }))}
        domains={domains}
        skills={skills}
        saveSubject={saveSubject}
        saveDomain={saveDevelopmentalDomain}
        saveSkill={saveDevelopmentalSkill}
        domainsError={domainsError}
      />
    </div>
  );
}
