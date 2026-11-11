import Link from "next/link";
import { notFound } from "next/navigation";
import { saveClassTeacher, saveSubjectTeacher } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { ClassRoster } from "@/components/academics/ClassRoster";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  ACADEMICS_BASE,
  campusFromQuery,
  campusQuery,
  classLabel,
  classSection,
  kampalaToday,
  mapStaff,
  mapSubject,
  loadCurrentTerm,
  streamFromQuery,
  streamQuery,
  subjectFits,
} from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { CAMPUS_OPTIONS, operationalCampus } from "@/lib/campuses";
import { isClassCode } from "@/lib/students";

export const metadata = { title: "Class" };

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function campusPick(raw: string | null, options: string[]) {
  const fromQuery = campusFromQuery(raw ?? undefined);
  if (fromQuery && CAMPUS_OPTIONS.includes(fromQuery as (typeof CAMPUS_OPTIONS)[number])) return fromQuery;
  if (options.length === 1) return options[0];
  return operationalCampus(null);
}

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ stream?: string; campus?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  if (!isClassCode(code)) notFound();
  const stream = streamFromQuery(query.stream);
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title={code} state={opened} />;
  const { supabase, office, user, campuses } = opened.auth;

  const [roll, termPack, staffQuery, subjectQuery] = await Promise.all([
    loadRoll(supabase, user.id, undefined, office ? campuses : undefined),
    loadCurrentTerm(supabase),
    supabase.from("teaching_staff").select("*").eq("active", true).order("full_name"),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
  ]);
  const pupils = roll.filter((pupil) => pupil.class_code === code);
  const campusOptions = [...new Set(pupils.map((pupil) => operationalCampus(pupil.campus)))].sort((a, b) => a.localeCompare(b));
  const campus = campusPick(query.campus ?? null, campusOptions);
  const atCampus = pupils.filter((pupil) => operationalCampus(pupil.campus) === campus);
  const streams = [...new Set(atCampus.map((pupil) => pupil.stream || ""))].sort();
  const chosen = stream === null && streams.length === 1 ? streams[0] : stream;
  if (termPack.error) return <AcademicsGate title={code} state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const staff = ((staffQuery.data || []) as Record<string, unknown>[]).map(mapStaff);
  const subjects = ((subjectQuery.data || []) as Record<string, unknown>[]).map(mapSubject).filter((subject) => subjectFits(subject, code));
  const section = classSection(code);

  let classTeacher = "";
  let assistantTeacher = "";
  const subjectTeachers = new Map<string, string>();
  if (term && chosen !== null) {
    const [classRows, subjectRows] = await Promise.all([
      supabase.from("class_teachers").select("staff_id, role").eq("term_id", term.id).eq("campus", campus).eq("class_code", code).eq("stream", chosen),
      supabase.from("subject_teachers").select("subject_id, staff_id").eq("term_id", term.id).eq("campus", campus).eq("class_code", code).eq("stream", chosen),
    ]);
    for (const row of classRows.data || []) {
      if ((row.role || "lead") === "assistant") assistantTeacher = String(row.staff_id || "");
      else classTeacher = String(row.staff_id || "");
    }
    for (const row of subjectRows.data || []) subjectTeachers.set(row.subject_id as string, row.staff_id as string);
  }
  const visible = chosen === null ? [] : atCampus.filter((pupil) => (pupil.stream || "") === chosen);
  const boys = visible.filter((pupil) => pupil.sex === "M").length;
  const girls = visible.filter((pupil) => pupil.sex === "F").length;
  const teacher = staff.find((member) => member.id === classTeacher) ?? null;
  const assistant = staff.find((member) => member.id === assistantTeacher) ?? null;
  const assigned = subjects.filter((subject) => subjectTeachers.has(subject.id)).length;
  const label = chosen === null ? classLabel(code, null, campus) : classLabel(code, chosen, campus);
  const campusQs = `campus=${campusQuery(campus)}`;

  return (
    <div className="app-page ofc-page acr-page">
      <PageHeader
        kicker="Teaching"
        icon="fa-chalkboard"
        title={label}
        description={`${section === "nursery" ? "Nursery" : "Primary"}${chosen !== null ? ` · ${visible.length} ${visible.length === 1 ? "pupil" : "pupils"}` : ""}${term ? ` · ${term.label}` : ""}`}
        actions={
          chosen !== null ? (
            <>
              <Link className="admin-hero-btn is-primary" href={`${ACADEMICS_BASE}/attendance?date=${kampalaToday()}&class=${code}&stream=${streamQuery(chosen)}&${campusQs}`}><i className="fa-solid fa-clipboard-user" aria-hidden="true" /> Today&apos;s register</Link>
              {office ? <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/reports?class=${code}&stream=${streamQuery(chosen)}&${campusQs}`}><i className="fa-solid fa-file-lines" aria-hidden="true" /> Report cards</Link> : null}
            </>
          ) : (
            <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/classes`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> All classes</Link>
          )
        }
      />

      {campusOptions.length > 1 ? (
        <nav className="acr-streams" aria-label="Campuses">
          {campusOptions.map((entry) => (
            <Link
              key={entry}
              className={entry === campus ? "is-on" : ""}
              href={`${ACADEMICS_BASE}/classes/${code}?campus=${campusQuery(entry)}${chosen !== null ? `&stream=${streamQuery(chosen)}` : ""}`}
            >
              {entry}
              <span>{pupils.filter((pupil) => operationalCampus(pupil.campus) === entry).length}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {chosen === null ? (
        <section className="acr-pick" aria-label="Streams">
          <header>
            <h2>Choose a stream</h2>
            <p>This class is split. Open one stream to see the roster and assign teachers.</p>
          </header>
          {streams.length ? (
            <ul>
              {streams.map((entry) => {
                const group = atCampus.filter((pupil) => (pupil.stream || "") === entry);
                const groupBoys = group.filter((pupil) => pupil.sex === "M").length;
                const groupGirls = group.filter((pupil) => pupil.sex === "F").length;
                return (
                  <li key={entry || "-"}>
                    <Link href={`${ACADEMICS_BASE}/classes/${code}?stream=${streamQuery(entry)}&${campusQs}`}>
                      <span className="acr-pick-code">{entry || "-"}</span>
                      <span>
                        <strong>{entry ? `Stream ${entry}` : "No stream"}</strong>
                        <small>{group.length} {group.length === 1 ? "pupil" : "pupils"}</small>
                      </span>
                      <span className="acr-mix" aria-hidden="true">
                        {groupBoys ? <i className="is-boy" style={{ flexGrow: groupBoys }} /> : null}
                        {groupGirls ? <i className="is-girl" style={{ flexGrow: groupGirls }} /> : null}
                      </span>
                      <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <Empty title="No pupils in this class at this campus" />}
        </section>
      ) : (
        <>
          {streams.length > 1 ? (
            <nav className="acr-streams" aria-label="Streams">
              {streams.map((entry) => (
                <Link key={entry || "-"} className={entry === chosen ? "is-on" : ""} href={`${ACADEMICS_BASE}/classes/${code}?stream=${streamQuery(entry)}&${campusQs}`}>
                  {entry || "No stream"}
                  <span>{atCampus.filter((pupil) => (pupil.stream || "") === entry).length}</span>
                </Link>
              ))}
            </nav>
          ) : null}

          <section className="acr-strip" aria-label="Class at a glance">
            <div>
              <span>On roll</span>
              <strong>{visible.length}</strong>
              <small>{section === "nursery" ? "Nursery" : "Primary"}</small>
            </div>
            <div>
              <span>Boys and girls</span>
              <strong>{boys}<em>/</em>{girls}</strong>
              <span className="acr-mix" role="img" aria-label={`${boys} boys, ${girls} girls`}>
                {boys ? <i className="is-boy" style={{ flexGrow: boys }} /> : null}
                {girls ? <i className="is-girl" style={{ flexGrow: girls }} /> : null}
                {!boys && !girls ? <i className="is-none" style={{ flexGrow: 1 }} /> : null}
              </span>
            </div>
            <div>
              <span>Class teacher</span>
              <strong className="is-name">{teacher?.full_name || "Unassigned"}</strong>
              <small>{term?.label || "No current term"}</small>
            </div>
            <div>
              <span>Subjects</span>
              <strong>{assigned}<em>/{subjects.length}</em></strong>
              <small>{assigned === subjects.length && subjects.length ? "Fully staffed" : "Teachers assigned"}</small>
            </div>
          </section>

          <div className="acr-layout">
            <section className="acr-panel">
              <header className="acr-panel-head">
                <div>
                  <h2>Roster</h2>
                  <p>Class changes stay in the admissions office.</p>
                </div>
                <Link href={`${ACADEMICS_BASE}/classes`}>All classes</Link>
              </header>
              {visible.length ? (
                <ClassRoster pupils={visible.map((pupil) => ({ id: pupil.id, full_name: pupil.full_name, student_number: pupil.student_number, sex: pupil.sex, photoPath: pupil.photo_path }))} />
              ) : <Empty title="No pupils in this stream" />}
            </section>

            <div className="acr-side">
              <section className="acr-panel">
                <header className="acr-panel-head">
                  <div>
                    <h2>Teachers</h2>
                    <p>{term ? `${term.label} · choose a teacher to assign or replace` : "Set a current term before assigning."}</p>
                  </div>
                </header>
                {term && office ? (
                  <div className="acr-teachers">
                    <DeskForm action={saveClassTeacher} className="acr-lead-row" quiet status="Saving">
                      <input type="hidden" name="term_id" value={term.id} />
                      <input type="hidden" name="class_code" value={code} />
                      <input type="hidden" name="stream" value={chosen} />
                      <input type="hidden" name="campus" value={campus} />
                      <input type="hidden" name="role" value="lead" />
                      <div className={`acr-lead-who is-compact${teacher ? " is-set" : " is-open"}`}>
                        <em aria-hidden="true">{teacher ? initials(teacher.full_name) : <i className="fa-solid fa-user" />}</em>
                        <span>
                          <strong>Class teacher</strong>
                          <small>{teacher?.full_name || "Needed"}</small>
                        </span>
                      </div>
                      <select name="staff_id" defaultValue={classTeacher} aria-label="Class teacher">
                        <option value="">{teacher ? "Clear class teacher" : "Choose class teacher"}</option>
                        {staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.id === classTeacher ? `${member.full_name} · current` : teacher && member.id !== classTeacher ? `Replace with ${member.full_name}` : member.full_name}
                          </option>
                        ))}
                      </select>
                      <button className="acr-save" type="submit">Save</button>
                    </DeskForm>
                    <DeskForm action={saveClassTeacher} className="acr-lead-row" quiet status="Saving">
                      <input type="hidden" name="term_id" value={term.id} />
                      <input type="hidden" name="class_code" value={code} />
                      <input type="hidden" name="stream" value={chosen} />
                      <input type="hidden" name="campus" value={campus} />
                      <input type="hidden" name="role" value="assistant" />
                      <div className={`acr-lead-who is-compact${assistant ? " is-set" : " is-open"}`}>
                        <em aria-hidden="true">{assistant ? initials(assistant.full_name) : <i className="fa-solid fa-user-plus" />}</em>
                        <span>
                          <strong>Assistant</strong>
                          <small>{assistant?.full_name || "Optional"}</small>
                        </span>
                      </div>
                      <select name="staff_id" defaultValue={assistantTeacher} aria-label="Assistant class teacher">
                        <option value="">{assistant ? "Clear assistant" : "Choose assistant"}</option>
                        {staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.id === assistantTeacher ? `${member.full_name} · current` : assistant && member.id !== assistantTeacher ? `Replace with ${member.full_name}` : member.full_name}
                          </option>
                        ))}
                      </select>
                      <button className="acr-save" type="submit">Save</button>
                    </DeskForm>
                  </div>
                ) : (
                  <div className="acr-teachers is-readonly">
                    <div className={`acr-lead-who is-compact${teacher ? " is-set" : " is-open"}`}>
                      <em aria-hidden="true">{teacher ? initials(teacher.full_name) : <i className="fa-solid fa-user" />}</em>
                      <span>
                        <strong>Class teacher</strong>
                        <small>{teacher?.full_name || (term ? "Not assigned" : "Needs a current term")}</small>
                      </span>
                    </div>
                    <div className={`acr-lead-who is-compact${assistant ? " is-set" : " is-open"}`}>
                      <em aria-hidden="true">{assistant ? initials(assistant.full_name) : <i className="fa-solid fa-user-plus" />}</em>
                      <span>
                        <strong>Assistant</strong>
                        <small>{assistant?.full_name || "None"}</small>
                      </span>
                    </div>
                  </div>
                )}

                <div className="acr-subjects-head">
                  <strong>Subjects</strong>
                  <span>{subjects.length ? `${assigned}/${subjects.length}` : "None"}</span>
                </div>
                {term && subjects.length ? (
                  <ul className="acr-subjects">
                    {subjects.map((subject) => {
                      const staffId = subjectTeachers.get(subject.id) || "";
                      const holder = staff.find((member) => member.id === staffId);
                      if (!office) {
                        return (
                          <li key={subject.id} className={holder ? "is-set" : "is-open"}>
                            <span className="acr-subject">
                              <strong>{subject.name}</strong>
                              <small>{holder?.full_name || "Open"}</small>
                            </span>
                          </li>
                        );
                      }
                      return (
                        <li key={subject.id} className={holder ? "is-set" : "is-open"}>
                          <DeskForm action={saveSubjectTeacher} className="acr-assign" quiet status="Saving">
                            <input type="hidden" name="term_id" value={term.id} />
                            <input type="hidden" name="class_code" value={code} />
                            <input type="hidden" name="stream" value={chosen} />
                            <input type="hidden" name="campus" value={campus} />
                            <input type="hidden" name="subject_id" value={subject.id} />
                            <span className="acr-subject">
                              <strong>{subject.name}</strong>
                              <small>{holder?.full_name || "Open"}</small>
                            </span>
                            <select name="staff_id" defaultValue={staffId} aria-label={`${subject.name} teacher`}>
                              <option value="">{holder ? "Clear teacher" : "Choose teacher"}</option>
                              {staff.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.id === staffId ? `${member.full_name} · current` : holder && member.id !== staffId ? `Replace with ${member.full_name}` : member.full_name}
                                </option>
                              ))}
                            </select>
                            <button className="acr-save" type="submit">Save</button>
                          </DeskForm>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="acr-note">{term ? "No subjects apply to this class." : "Subject teachers need a current term."}</p>}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
