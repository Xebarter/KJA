"use client";

import { useMemo, useState } from "react";
import { generateReportComments, saveReport } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import type { SheetActivity, SheetLine } from "@/components/academics/ReportSheet";
import { CONDUCT } from "@/lib/academics";

type Tab = "leaders" | "activities" | "subjects";
type SubjectFilter = "open" | "done" | "all";
type RemarkAction = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

function formatScore(score: number | null, nursery: boolean) {
  if (score === null || Number.isNaN(score)) return "-";
  if (nursery) return score >= 75 ? "Exceeding" : score >= 50 ? "Secure" : score >= 25 ? "Developing" : "Beginning";
  return `${Math.round(score * 10) / 10}%`;
}

function ordinal(value: number) {
  const mod = value % 100;
  const suffix = mod >= 11 && mod <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

function remarkMeta(line: SheetLine, nursery: boolean) {
  return [
    nursery ? line.grade : line.score === null ? null : formatScore(line.score, false),
    !nursery && line.grade ? line.grade : null,
    line.position ? ordinal(line.position) : null,
  ].filter(Boolean).join(" · ");
}

function filled(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export function ReportRemarksEditor({
  id,
  status,
  classTeacherName,
  conduct: initialConduct,
  classTeacherComment,
  headComment,
  cocurricularComment,
  activities,
  lines,
  nursery,
  saveAction = saveReport,
  generateAction = generateReportComments,
}: {
  id: string;
  status: string;
  classTeacherName: string | null;
  conduct: string | null;
  classTeacherComment: string | null;
  headComment: string | null;
  cocurricularComment: string | null;
  activities: SheetActivity[];
  lines: SheetLine[];
  nursery: boolean;
  saveAction?: RemarkAction;
  generateAction?: RemarkAction;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    if (nursery && !lines.length) return "leaders";
    const openSubjects = lines.some((line) => !filled(line.teacher_comment));
    return openSubjects && lines.length ? "subjects" : "leaders";
  });
  const [conduct, setConduct] = useState(initialConduct || "");
  const [teacherNote, setTeacherNote] = useState(classTeacherComment || "");
  const [headNote, setHeadNote] = useState(headComment || "");
  const [subjectNotes, setSubjectNotes] = useState(() =>
    Object.fromEntries(lines.map((line) => [line.subject_id, line.teacher_comment || ""])),
  );
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>(() =>
    lines.some((line) => !filled(line.teacher_comment)) ? "open" : "all",
  );
  const [activeSubjectId, setActiveSubjectId] = useState(() => {
    const open = lines.find((line) => !filled(line.teacher_comment));
    return open?.subject_id || lines[0]?.subject_id || "";
  });
  const [activityDrafts, setActivityDrafts] = useState(() =>
    Object.fromEntries(
      activities.map((row) => [
        row.slot,
        {
          name: row.activity_name || "",
          score: row.score == null ? "" : String(row.score),
          max: row.max_score == null ? "100" : String(row.max_score),
          level: row.level || "",
          skills: (row.skills || []).map((skill) => skill.label).join(", "),
          acquired: (row.skills || []).filter((skill) => skill.acquired).map((skill) => skill.label).join(", "),
          comment: row.comment || "",
        },
      ]),
    ) as Record<number, { name: string; score: string; max: string; level: string; skills: string; acquired: string; comment: string }>,
  );
  const [activeSlot, setActiveSlot] = useState(() => {
    const named = activities.find((row) => filled(row.activity_name));
    return named?.slot || activities[0]?.slot || 1;
  });
  const [showActivityExtras, setShowActivityExtras] = useState(() => {
    const named = activities.find((row) => filled(row.activity_name)) || activities[0];
    if (!named) return false;
    return Boolean(
      named.score != null
      || filled(named.level)
      || (named.skills || []).length,
    );
  });

  const subjectFilled = useMemo(
    () => lines.filter((line) => filled(subjectNotes[line.subject_id])).length,
    [lines, subjectNotes],
  );
  const openSubjects = useMemo(
    () => lines.filter((line) => !filled(subjectNotes[line.subject_id])),
    [lines, subjectNotes],
  );
  const visibleSubjects = useMemo(() => {
    if (subjectFilter === "open") return lines.filter((line) => !filled(subjectNotes[line.subject_id]));
    if (subjectFilter === "done") return lines.filter((line) => filled(subjectNotes[line.subject_id]));
    return lines;
  }, [lines, subjectFilter, subjectNotes]);
  const activeSubject = lines.find((line) => line.subject_id === activeSubjectId) || visibleSubjects[0] || lines[0] || null;
  const activeNote = activeSubject ? subjectNotes[activeSubject.subject_id] || "" : "";
  const nextOpenSubject = openSubjects.find((line) => line.subject_id !== activeSubject?.subject_id) || openSubjects[0] || null;
  const leadersFilled = Number(filled(conduct)) + Number(filled(teacherNote)) + Number(filled(headNote));
  const activityNamed = activities.filter((row) => filled(activityDrafts[row.slot]?.name)).length;

  function chooseSubject(id: string) {
    setActiveSubjectId(id);
  }

  function setSubjectNote(id: string, value: string) {
    setSubjectNotes((current) => ({ ...current, [id]: value }));
  }

  function activityHasExtras(slot: number) {
    const draft = activityDrafts[slot];
    return filled(draft?.score) || filled(draft?.level) || filled(draft?.skills) || filled(draft?.acquired);
  }

  function patchActivity(slot: number, patch: Partial<(typeof activityDrafts)[number]>) {
    setActivityDrafts((current) => ({
      ...current,
      [slot]: { ...current[slot], ...patch },
    }));
  }

  function clearActivity(slot: number) {
    patchActivity(slot, {
      name: "",
      score: "",
      max: "100",
      level: "",
      skills: "",
      acquired: "",
      comment: "",
    });
    setShowActivityExtras(false);
  }

  function chooseSlot(slot: number) {
    setActiveSlot(slot);
    setShowActivityExtras(activityHasExtras(slot));
  }
  const showSubjects = lines.length > 0;
  const totalChecks = 3 + (showSubjects ? lines.length : 0);
  const doneChecks = leadersFilled + (showSubjects ? subjectFilled : 0);
  const pct = totalChecks ? Math.round((doneChecks / totalChecks) * 100) : 0;

  const tabs: { id: Tab; label: string; hint: string; tone?: "warn" | "ok" }[] = [
    {
      id: "leaders",
      label: "Leaders",
      hint: `${leadersFilled}/3`,
      tone: leadersFilled === 3 ? "ok" : "warn",
    },
    {
      id: "activities",
      label: "Activities",
      hint: activityNamed ? `${activityNamed} set` : "Optional",
    },
    ...(showSubjects
      ? [
          {
            id: "subjects" as const,
            label: "Subjects",
            hint: `${subjectFilled}/${lines.length}`,
            tone: (subjectFilled === lines.length ? "ok" : "warn") as "ok" | "warn",
          },
        ]
      : []),
  ];

  return (
    <section className="rpt-card rpt-editor acd-noprint" aria-label="Remarks">
      <header className="rpt-editor-hero">
        <div className="rpt-editor-hero-copy">
          <h2>Remarks</h2>
          <p>{status === "approved" ? "Approved · ready to publish" : `${doneChecks}/${totalChecks} filled`}</p>
        </div>
        <div className={`rpt-editor-meter${pct === 100 ? " is-ok" : " is-warn"}`} aria-label={`${doneChecks} of ${totalChecks} remarks filled`}>
          <div className="rpt-editor-ring" style={{ ["--rpt-editor-pct" as string]: pct }}>
            <strong>{pct}%</strong>
          </div>
        </div>
        {status === "draft" ? (
          <DeskForm className="rpt-editor-generate" action={generateAction} quiet status="Rewriting comments">
            <input type="hidden" name="id" value={id} />
            <button className="rpt-btn is-ghost" type="submit" title="Rewrite remarks from the active comment bank">
              <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
              Regenerate
            </button>
          </DeskForm>
        ) : null}
      </header>

      <div className="rpt-editor-tabs" role="tablist" aria-label="Remark sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`${tab === item.id ? "is-on" : ""}${item.tone ? ` is-${item.tone}` : ""}`}
            onClick={() => setTab(item.id)}
          >
            <strong>{item.label}</strong>
            <em>{item.hint}</em>
          </button>
        ))}
      </div>

      <DeskForm className="rpt-editor-form" action={saveAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="conduct" value={conduct} />

        <div className="rpt-editor-scroll">
          <div className="rpt-editor-panel" hidden={tab !== "leaders"}>
            <section className="rpt-editor-block">
              <header className="rpt-editor-block-head">
                <div>
                  <h3>Conduct</h3>
                  <p>Shown on the printed card and in the summary strip.</p>
                </div>
                <span className={`rpt-editor-badge${conduct ? " is-ok" : " is-warn"}`}>
                  {conduct || "Not set"}
                </span>
              </header>
              <div className="rpt-conduct" role="group" aria-label="Conduct">
                {CONDUCT.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={conduct === item ? "is-on" : ""}
                    aria-pressed={conduct === item}
                    onClick={() => setConduct(item)}
                  >
                    {item}
                  </button>
                ))}
                {conduct ? (
                  <button type="button" className="is-clear" onClick={() => setConduct("")}>
                    Clear
                  </button>
                ) : null}
              </div>
            </section>

            <section className="rpt-editor-block">
              <header className="rpt-editor-block-head">
                <div>
                  <h3>Class teacher</h3>
                  <p>
                    {nursery
                      ? classTeacherName
                        ? `Signed as ${classTeacherName}. Summarise this pupil’s developmental progress.`
                        : "Summarise this pupil’s developmental progress for the nursery report."
                      : classTeacherName
                        ? `Signed as ${classTeacherName}.`
                        : "How this pupil worked this term."}
                  </p>
                </div>
                <span className={`rpt-editor-badge${filled(teacherNote) ? " is-ok" : " is-warn"}`}>
                  {filled(teacherNote) ? "Written" : "Needed"}
                </span>
              </header>
              <label className="rpt-editor-field">
                <span className="rpt-sr">Class teacher remark</span>
                <textarea
                  name="class_teacher_comment"
                  rows={4}
                  value={teacherNote}
                  onChange={(event) => setTeacherNote(event.target.value)}
                  placeholder="One or two sentences that name the child and their effort this term"
                />
              </label>
            </section>

            <section className="rpt-editor-block">
              <header className="rpt-editor-block-head">
                <div>
                  <h3>Principal</h3>
                  <p>Short closing remark for the head of school.</p>
                </div>
                <span className={`rpt-editor-badge${filled(headNote) ? " is-ok" : " is-warn"}`}>
                  {filled(headNote) ? "Written" : "Needed"}
                </span>
              </header>
              <label className="rpt-editor-field">
                <span className="rpt-sr">Principal remark</span>
                <textarea
                  name="head_comment"
                  rows={3}
                  value={headNote}
                  onChange={(event) => setHeadNote(event.target.value)}
                  placeholder="Head teacher's remark"
                />
              </label>
            </section>
          </div>

          <div className="rpt-editor-panel" hidden={tab !== "activities"}>
            <section className="rpt-editor-block rpt-activity-desk">
              <header className="rpt-editor-block-head">
                <div>
                  <h3>Co-curricular</h3>
                  <p>Only named activities print. Comment sits beside the activity name on the card.</p>
                </div>
                <span className={`rpt-editor-badge${activityNamed ? " is-ok" : ""}`}>{activityNamed}/4 on card</span>
              </header>

              <div className="rpt-activity-slots" role="tablist" aria-label="Activity slots">
                {activities.map((row) => {
                  const draft = activityDrafts[row.slot];
                  const named = filled(draft?.name);
                  const on = row.slot === activeSlot;
                  return (
                    <button
                      key={row.slot}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className={`rpt-activity-slot${on ? " is-on" : ""}${named ? " is-filled" : ""}`}
                      onClick={() => chooseSlot(row.slot)}
                    >
                      <span className="rpt-activity-slot-num">{row.slot}</span>
                      <span className="rpt-activity-slot-copy">
                        <strong>{named ? draft.name : "Empty"}</strong>
                        <small>{named ? (filled(draft.comment) ? "Comment set" : "Needs comment") : "Tap to add"}</small>
                      </span>
                      <i className={`fa-solid ${named ? "fa-circle-check" : "fa-plus"}`} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>

              {activities.map((row) => {
                const draft = activityDrafts[row.slot];
                const on = row.slot === activeSlot;
                const named = filled(draft?.name);
                const extrasOpen = on && showActivityExtras;
                return (
                  <div key={row.slot} className="rpt-activity-stage" hidden={!on}>
                    <div className={`rpt-activity-preview${named ? " is-live" : ""}`} aria-label="Card preview">
                      <span className="rpt-activity-preview-kicker">On the printed card</span>
                      {named ? (
                        <div className="rpt-activity-preview-row">
                          <strong>{draft.name}</strong>
                          <p>{filled(draft.comment) ? draft.comment : "Add a short comment for this activity."}</p>
                        </div>
                      ) : (
                        <div className="rpt-activity-preview-empty">
                          <i className="fa-solid fa-music" aria-hidden="true" />
                          <div>
                            <strong>Slot {row.slot} is empty</strong>
                            <p>Name an activity to include it on the report card.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rpt-activity-essentials">
                      <p className="rpt-activity-step">1 · What prints</p>
                      <label className="rpt-editor-field">
                        <span>Activity</span>
                        <input
                          name={`activity_name_${row.slot}`}
                          value={draft?.name || ""}
                          onChange={(event) => patchActivity(row.slot, { name: event.target.value })}
                          placeholder="Music, Football, Drama…"
                          autoComplete="off"
                        />
                      </label>
                      <label className="rpt-editor-field">
                        <span>Comment</span>
                        <textarea
                          name={`activity_comment_${row.slot}`}
                          rows={3}
                          value={draft?.comment || ""}
                          onChange={(event) => patchActivity(row.slot, { comment: event.target.value })}
                          placeholder="One sentence parents will read beside this activity"
                        />
                      </label>
                      {named ? (
                        <button type="button" className="rpt-activity-clear" onClick={() => clearActivity(row.slot)}>
                          Clear this slot
                        </button>
                      ) : null}
                    </div>

                    <div className="rpt-activity-more">
                      <button
                        type="button"
                        className={`rpt-activity-more-toggle${extrasOpen ? " is-on" : ""}`}
                        aria-expanded={extrasOpen}
                        onClick={() => setShowActivityExtras((value) => !value)}
                      >
                        <span>
                          <strong>2 · Mark & skills</strong>
                          <small>Optional office detail · not required to print</small>
                        </span>
                        <i className={`fa-solid fa-chevron-${extrasOpen ? "up" : "down"}`} aria-hidden="true" />
                      </button>

                      <div className="rpt-activity-extras" hidden={!extrasOpen}>
                        <div className="rpt-activity-mark">
                          <label className="rpt-editor-field">
                            <span>Mark</span>
                            <input
                              name={`activity_score_${row.slot}`}
                              type="number"
                              min={0}
                              step="any"
                              value={draft?.score || ""}
                              onChange={(event) => patchActivity(row.slot, { score: event.target.value })}
                              placeholder="82"
                            />
                          </label>
                          <span className="rpt-activity-mark-sep" aria-hidden="true">out of</span>
                          <label className="rpt-editor-field">
                            <span className="rpt-sr">Out of</span>
                            <input
                              name={`activity_max_${row.slot}`}
                              type="number"
                              min={1}
                              step="any"
                              value={draft?.max || ""}
                              onChange={(event) => patchActivity(row.slot, { max: event.target.value })}
                              placeholder="100"
                            />
                          </label>
                        </div>

                        <div className="rpt-activity-level">
                          <span>Level</span>
                          <input type="hidden" name={`activity_level_${row.slot}`} value={draft?.level || ""} />
                          <div className="rpt-conduct" role="group" aria-label={`Level for slot ${row.slot}`}>
                            {CONDUCT.map((item) => (
                              <button
                                key={item}
                                type="button"
                                className={draft?.level === item ? "is-on" : ""}
                                aria-pressed={draft?.level === item}
                                onClick={() => patchActivity(row.slot, { level: item })}
                              >
                                {item}
                              </button>
                            ))}
                            {draft?.level ? (
                              <button type="button" className="is-clear" onClick={() => patchActivity(row.slot, { level: "" })}>
                                From mark
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="rpt-activity-skills">
                          <label className="rpt-editor-field">
                            <span>Skills taught</span>
                            <input
                              name={`activity_skills_${row.slot}`}
                              value={draft?.skills || ""}
                              onChange={(event) => patchActivity(row.slot, { skills: event.target.value })}
                              placeholder="rhythm, ensemble, notation"
                              autoComplete="off"
                            />
                          </label>
                          <label className="rpt-editor-field">
                            <span>Skills acquired</span>
                            <input
                              name={`activity_acquired_${row.slot}`}
                              value={draft?.acquired || ""}
                              onChange={(event) => patchActivity(row.slot, { acquired: event.target.value })}
                              placeholder="rhythm, ensemble"
                              autoComplete="off"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Keep optional fields in the form when the extras panel is closed. */}
                      {!extrasOpen ? (
                        <div className="rpt-editor-stash" aria-hidden="true">
                          <input name={`activity_score_${row.slot}`} value={draft?.score || ""} readOnly tabIndex={-1} />
                          <input name={`activity_max_${row.slot}`} value={draft?.max || ""} readOnly tabIndex={-1} />
                          <input name={`activity_level_${row.slot}`} value={draft?.level || ""} readOnly tabIndex={-1} />
                          <input name={`activity_skills_${row.slot}`} value={draft?.skills || ""} readOnly tabIndex={-1} />
                          <input name={`activity_acquired_${row.slot}`} value={draft?.acquired || ""} readOnly tabIndex={-1} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {/* Persist inactive slots so Save still posts every activity. */}
              {activities.map((row) => {
                if (row.slot === activeSlot) return null;
                const draft = activityDrafts[row.slot];
                return (
                  <div className="rpt-editor-stash" aria-hidden="true" key={`stash-${row.slot}`}>
                    <input name={`activity_name_${row.slot}`} value={draft?.name || ""} readOnly tabIndex={-1} />
                    <input name={`activity_score_${row.slot}`} value={draft?.score || ""} readOnly tabIndex={-1} />
                    <input name={`activity_max_${row.slot}`} value={draft?.max || ""} readOnly tabIndex={-1} />
                    <input name={`activity_level_${row.slot}`} value={draft?.level || ""} readOnly tabIndex={-1} />
                    <input name={`activity_skills_${row.slot}`} value={draft?.skills || ""} readOnly tabIndex={-1} />
                    <input name={`activity_acquired_${row.slot}`} value={draft?.acquired || ""} readOnly tabIndex={-1} />
                    <textarea name={`activity_comment_${row.slot}`} value={draft?.comment || ""} readOnly tabIndex={-1} />
                  </div>
                );
              })}

              <label className="rpt-editor-field rpt-activity-summary">
                <span>Office note <em>not printed</em></span>
                <textarea
                  name="cocurricular_comment"
                  rows={2}
                  defaultValue={cocurricularComment || ""}
                  placeholder="Optional internal note for this pupil"
                />
              </label>
            </section>
          </div>

          <div className="rpt-editor-panel" hidden={tab !== "subjects"}>
            <section className="rpt-editor-block rpt-subject-desk">
              <header className="rpt-editor-block-head">
                <div>
                  <h3>Subject remarks</h3>
                  <p>Write one remark at a time. Marks and positions stay locked.</p>
                </div>
                <span className={`rpt-editor-badge${subjectFilled === lines.length && lines.length ? " is-ok" : " is-warn"}`}>
                  {subjectFilled}/{lines.length}
                </span>
              </header>

              {lines.length ? (
                <>
                  <div className="rpt-subject-progress" aria-hidden="true">
                    <span style={{ width: `${lines.length ? Math.round((subjectFilled / lines.length) * 100) : 0}%` }} />
                  </div>

                  <div className="rpt-subject-filters" role="tablist" aria-label="Subject filter">
                    {(
                      [
                        { id: "open", label: "Needs remark", count: openSubjects.length },
                        { id: "done", label: "Done", count: subjectFilled },
                        { id: "all", label: "All", count: lines.length },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={subjectFilter === item.id}
                        className={subjectFilter === item.id ? "is-on" : ""}
                        onClick={() => {
                          setSubjectFilter(item.id);
                          const pool =
                            item.id === "open"
                              ? lines.filter((line) => !filled(subjectNotes[line.subject_id]))
                              : item.id === "done"
                                ? lines.filter((line) => filled(subjectNotes[line.subject_id]))
                                : lines;
                          if (pool.length && !pool.some((line) => line.subject_id === activeSubjectId)) {
                            setActiveSubjectId(pool[0].subject_id);
                          }
                        }}
                      >
                        {item.label}
                        <em>{item.count}</em>
                      </button>
                    ))}
                  </div>

                  <div className="rpt-subject-queue" role="listbox" aria-label="Subjects">
                    {visibleSubjects.length ? (
                      visibleSubjects.map((line) => {
                        const done = filled(subjectNotes[line.subject_id]);
                        const on = line.subject_id === activeSubject?.subject_id;
                        const meta = remarkMeta(line, nursery);
                        return (
                          <button
                            key={line.subject_id}
                            type="button"
                            role="option"
                            aria-selected={on}
                            className={`rpt-subject-chip${on ? " is-on" : ""}${done ? " is-done" : " is-open"}`}
                            onClick={() => chooseSubject(line.subject_id)}
                          >
                            <span className="rpt-subject-face" aria-hidden="true">
                              {(line.teacher_initials || line.subject_name.slice(0, 2)).toUpperCase()}
                            </span>
                            <span className="rpt-subject-chip-copy">
                              <strong>{line.subject_name}</strong>
                              <small>{meta || (done ? "Remark set" : "Needs remark")}</small>
                            </span>
                            <i className={`fa-solid ${done ? "fa-circle-check" : "fa-pen"}`} aria-hidden="true" />
                          </button>
                        );
                      })
                    ) : (
                      <div className="rpt-subject-empty-filter">
                        <strong>{subjectFilter === "open" ? "Every subject has a remark" : "Nothing in this filter"}</strong>
                        <button type="button" onClick={() => setSubjectFilter("all")}>Show all subjects</button>
                      </div>
                    )}
                  </div>

                  {activeSubject ? (
                    <div className="rpt-subject-stage">
                      <div className={`rpt-subject-preview${filled(activeNote) ? " is-live" : ""}`} aria-label="Card preview">
                        <span className="rpt-subject-preview-kicker">On the printed card</span>
                        <div className="rpt-subject-preview-meta">
                          <strong>{activeSubject.subject_name}</strong>
                          <small>{remarkMeta(activeSubject, nursery) || "No mark shown yet"}</small>
                        </div>
                        <p className={filled(activeNote) ? "has-copy" : "is-blank"}>
                          {filled(activeNote) ? activeNote : "The subject remark will appear here once you write it."}
                        </p>
                      </div>

                      <div className="rpt-subject-compose">
                        <div className="rpt-subject-compose-head">
                          <div>
                            <p className="rpt-activity-step">Write remark</p>
                            <h4>{activeSubject.subject_name}</h4>
                          </div>
                          <em className={filled(activeNote) ? "is-ok" : "is-warn"}>
                            {filled(activeNote) ? "Filled" : "Open"}
                          </em>
                        </div>
                        <label className="rpt-editor-field">
                          <span className="rpt-sr">Remark for {activeSubject.subject_name}</span>
                          <textarea
                            name={`comment:${activeSubject.subject_id}`}
                            rows={4}
                            value={activeNote}
                            onChange={(event) => setSubjectNote(activeSubject.subject_id, event.target.value)}
                            placeholder={`One short remark for ${activeSubject.subject_name}`}
                          />
                        </label>
                        <div className="rpt-subject-compose-actions">
                          {filled(activeNote) ? (
                            <button
                              type="button"
                              className="rpt-activity-clear"
                              onClick={() => setSubjectNote(activeSubject.subject_id, "")}
                            >
                              Clear remark
                            </button>
                          ) : <span />}
                          {nextOpenSubject && nextOpenSubject.subject_id !== activeSubject.subject_id ? (
                            <button
                              type="button"
                              className="rpt-subject-next"
                              onClick={() => {
                                setSubjectFilter("open");
                                chooseSubject(nextOpenSubject.subject_id);
                              }}
                            >
                              Next open
                              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                            </button>
                          ) : openSubjects.length === 0 ? (
                            <span className="rpt-subject-complete">All subjects filled</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Keep every subject remark in the form payload. */}
                  {lines.map((line) =>
                    line.subject_id === activeSubject?.subject_id ? null : (
                      <textarea
                        key={`stash-${line.subject_id}`}
                        className="rpt-editor-stash"
                        name={`comment:${line.subject_id}`}
                        value={subjectNotes[line.subject_id] || ""}
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                    ),
                  )}
                </>
              ) : (
                <p className="rpt-quiet is-inline">No subject lines on this card yet.</p>
              )}
            </section>
          </div>
        </div>

        <div className="rpt-editor-actions">
          <div className="rpt-editor-actions-copy">
            <strong>{tab === "leaders" ? "Leadership notes" : tab === "activities" ? "Co-curricular" : "Subject remarks"}</strong>
            <small>
              {tab === "subjects"
                ? `${subjectFilled} of ${lines.length} subjects filled`
                : tab === "leaders"
                  ? `${leadersFilled} of 3 leadership fields`
                  : `${activityNamed} activities named`}
            </small>
          </div>
          <button className="rpt-btn" type="submit" name="intent" value="save">Save remarks</button>
          {status === "approved" ? (
            <button className="rpt-btn is-gold" type="submit" name="intent" value="publish">Publish</button>
          ) : null}
        </div>
      </DeskForm>
    </section>
  );
}
