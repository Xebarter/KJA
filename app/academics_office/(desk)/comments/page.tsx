import { previewCommentEngine, saveCommentTemplate } from "@/app/academics_office/(desk)/actions";
import { CommentsDesk } from "@/app/academics_office/(desk)/comments/CommentsDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { CommentsWorkspaceSwitch } from "@/components/academics/CommentsWorkspaceSwitch";
import { friendlyCheck, templateReadout, toRuleCard, type DeskRule, type DeskTemplate, type DeskType } from "@/components/academics/comment-model";
import { NurseryCommentsDesk, type NurseryCommentCard } from "@/components/academics/NurseryCommentsDesk";
import {
  PrimaryCommentsDesk,
  type PrimaryActivityCommentCard,
  type PrimaryClassCommentCard,
  type PrimaryCommentSubject,
  type PrimarySubjectCommentCard,
  type PrimarySubjectMark,
} from "@/components/academics/PrimaryCommentsDesk";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import {
  groupPupils,
  loadCurrentTerm,
  mapSubject,
  subjectFits,
} from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { loadActiveCommentConfig, validateConfiguration } from "@/lib/comment-engine";
import { NURSERY_COMMENT_RULES } from "@/lib/comment-engine/nursery-defaults";
import { buildNurserySamplePreview, buildSamplePreview } from "@/lib/comment-engine/preview";
import { resolveNurseryClassTeacherComment } from "@/lib/nursery-class-comments";
import { resolvePrimaryComment } from "@/lib/primary-report-comments";
import "../assessments/assessments.css";
import "./comments.css";

export const metadata = { title: "Comments" };

function asType(value: string): DeskType | null {
  if (value === "subject_teacher" || value === "cocurricular" || value === "class_teacher" || value === "headteacher") return value;
  return null;
}

type SearchParams = Promise<{ view?: string; class?: string; stream?: string }>;

export default async function CommentsSetupPage({ searchParams }: { searchParams: SearchParams }) {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Comments" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Comments" />;

  const params = await searchParams;
  const primaryView = params.view === "primary-comments";
  const nurseryView = params.view === "nursery-comments";

  if (primaryView) {
    const termPack = await loadCurrentTerm(opened.auth.supabase);
    if (termPack.error) {
      return <AcademicsGate title="Primary Comments" state={{ notice: "schema", message: termPack.error }} />;
    }
    const term = termPack.term;
    const [pupils, cardsQuery, classStoreQuery, subjectStoreQuery, activityStoreQuery, subjectsQuery] = await Promise.all([
      loadRoll(opened.auth.supabase, opened.auth.user.id, undefined, opened.auth.campuses),
      term
        ? opened.auth.supabase
            .from("report_cards")
            .select("id, student_id, status, class_code, stream, class_teacher_comment")
            .eq("term_id", term.id)
        : Promise.resolve({ data: [], error: null }),
      term
        ? opened.auth.supabase
            .from("primary_class_comments")
            .select("student_id, comment, class_code, stream, campus")
            .eq("term_id", term.id)
        : Promise.resolve({ data: [], error: null }),
      term
        ? opened.auth.supabase
            .from("primary_subject_comments")
            .select("student_id, subject_id, comment, class_code, stream")
            .eq("term_id", term.id)
        : Promise.resolve({ data: [], error: null }),
      term
        ? opened.auth.supabase
            .from("primary_activity_comments")
            .select("student_id, slot, subject_id, activity_name, comment, class_code, stream")
            .eq("term_id", term.id)
        : Promise.resolve({ data: [], error: null }),
      opened.auth.supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    ]);

    for (const query of [cardsQuery, classStoreQuery, subjectStoreQuery, activityStoreQuery, subjectsQuery]) {
      if (query.error) {
        return <AcademicsGate title="Primary Comments" state={{ notice: "schema", message: query.error.message }} />;
      }
    }

    const primaryGroups = groupPupils(pupils).filter((group) => group.section === "primary");
    const primaryCodes = new Set(primaryGroups.map((group) => group.code));

    const subjects: PrimaryCommentSubject[] = ((subjectsQuery.data || []) as Record<string, unknown>[])
      .map(mapSubject)
      .filter((subject) => [...primaryCodes].some((code) => subjectFits(subject, code)))
      .map((subject) => ({
        id: subject.id,
        name: subject.name,
        kind: subject.kind,
        section: subject.section,
        applies_from: subject.applies_from,
        applies_to: subject.applies_to,
        sort_order: subject.sort_order,
        active: subject.active,
      }));

    const cardByStudent = new Map(
      ((cardsQuery.data || []) as {
        id: string;
        student_id: string;
        status: string;
        class_code: string | null;
        stream: string | null;
        class_teacher_comment: string | null;
      }[])
        .filter((card) => card.class_code && primaryCodes.has(card.class_code))
        .map((card) => [card.student_id, card]),
    );
    const classStoreByStudent = new Map(
      ((classStoreQuery.data || []) as {
        student_id: string;
        comment: string | null;
        class_code: string | null;
        stream: string | null;
        campus: string | null;
      }[]).map((row) => [row.student_id, row]),
    );

    const classCards: PrimaryClassCommentCard[] = [];
    const seenClass = new Set<string>();
    for (const group of primaryGroups) {
      for (const pupil of group.pupils) {
        if (seenClass.has(pupil.id)) continue;
        seenClass.add(pupil.id);
        const store = classStoreByStudent.get(pupil.id);
        const card = cardByStudent.get(pupil.id);
        classCards.push({
          student_id: pupil.id,
          comment: resolvePrimaryComment(store?.comment, card?.class_teacher_comment),
          class_code: pupil.class_code || store?.class_code || group.code,
          stream: pupil.stream ?? store?.stream ?? group.stream,
          campus: pupil.campus || store?.campus || null,
          report_card_id: card?.id ?? null,
          status: card?.status ?? "",
        });
      }
    }
    for (const [studentId, store] of classStoreByStudent) {
      if (seenClass.has(studentId)) continue;
      if (!store.class_code || !primaryCodes.has(store.class_code)) continue;
      const card = cardByStudent.get(studentId);
      seenClass.add(studentId);
      classCards.push({
        student_id: studentId,
        comment: resolvePrimaryComment(store.comment, card?.class_teacher_comment),
        class_code: store.class_code,
        stream: store.stream || "",
        campus: store.campus,
        report_card_id: card?.id ?? null,
        status: card?.status ?? "",
      });
    }

    const subjectCards: PrimarySubjectCommentCard[] = ((subjectStoreQuery.data || []) as {
      student_id: string;
      subject_id: string;
      comment: string | null;
    }[]).map((row) => ({
      student_id: row.student_id,
      subject_id: row.subject_id,
      comment: resolvePrimaryComment(row.comment, null),
    }));

    // Prefer live report_lines when store is blank for the same pupil/subject.
    const cardIds = [...cardByStudent.values()].map((card) => card.id);
    const cardIdToStudent = new Map([...cardByStudent.entries()].map(([studentId, card]) => [card.id, studentId]));
    const subjectSeen = new Set(subjectCards.map((card) => `${card.student_id}|${card.subject_id}`));
    const subjectMarks: PrimarySubjectMark[] = [];
    const markSeen = new Set<string>();
    for (let index = 0; index < cardIds.length; index += 80) {
      const slice = cardIds.slice(index, index + 80);
      const lines = await opened.auth.supabase
        .from("report_lines")
        .select("report_card_id, subject_id, teacher_comment, score, grade, points, position")
        .in("report_card_id", slice);
      if (lines.error) {
        return <AcademicsGate title="Primary Comments" state={{ notice: "schema", message: lines.error.message }} />;
      }
      for (const line of (lines.data || []) as {
        report_card_id: string;
        subject_id: string;
        teacher_comment: string | null;
        score: number | null;
        grade: string | null;
        points: number | null;
        position: number | null;
      }[]) {
        const studentId = cardIdToStudent.get(line.report_card_id);
        if (!studentId) continue;
        const key = `${studentId}|${line.subject_id}`;
        if (!markSeen.has(key)) {
          markSeen.add(key);
          subjectMarks.push({
            student_id: studentId,
            subject_id: line.subject_id,
            score: line.score == null ? null : Number(line.score),
            grade: line.grade,
            points: line.points == null ? null : Number(line.points),
            position: line.position == null ? null : Number(line.position),
          });
        }
        const existing = subjectCards.find((card) => card.student_id === studentId && card.subject_id === line.subject_id);
        if (existing) {
          existing.comment = resolvePrimaryComment(existing.comment, line.teacher_comment);
          continue;
        }
        if (!resolvePrimaryComment(null, line.teacher_comment)) continue;
        if (subjectSeen.has(key)) continue;
        subjectSeen.add(key);
        subjectCards.push({
          student_id: studentId,
          subject_id: line.subject_id,
          comment: resolvePrimaryComment(null, line.teacher_comment),
        });
      }
    }

    const activityCards: PrimaryActivityCommentCard[] = ((activityStoreQuery.data || []) as {
      student_id: string;
      slot: number;
      subject_id: string | null;
      activity_name: string | null;
      comment: string | null;
    }[]).map((row) => ({
      student_id: row.student_id,
      slot: row.slot,
      subject_id: row.subject_id,
      activity_name: row.activity_name,
      comment: resolvePrimaryComment(row.comment, null),
    }));
    const activitySeen = new Set(activityCards.map((card) => `${card.student_id}|${card.slot}`));
    for (let index = 0; index < cardIds.length; index += 80) {
      const slice = cardIds.slice(index, index + 80);
      const activities = await opened.auth.supabase
        .from("report_card_activities")
        .select("report_card_id, slot, subject_id, activity_name, comment")
        .in("report_card_id", slice);
      if (activities.error) {
        return <AcademicsGate title="Primary Comments" state={{ notice: "schema", message: activities.error.message }} />;
      }
      for (const row of (activities.data || []) as {
        report_card_id: string;
        slot: number;
        subject_id: string | null;
        activity_name: string | null;
        comment: string | null;
      }[]) {
        const studentId = cardIdToStudent.get(row.report_card_id);
        if (!studentId) continue;
        const key = `${studentId}|${row.slot}`;
        const existing = activityCards.find((card) => card.student_id === studentId && card.slot === row.slot);
        if (existing) {
          existing.comment = resolvePrimaryComment(existing.comment, row.comment);
          if (!existing.subject_id && row.subject_id) existing.subject_id = row.subject_id;
          if (!existing.activity_name && row.activity_name) existing.activity_name = row.activity_name;
          continue;
        }
        if (!resolvePrimaryComment(null, row.comment)) continue;
        if (activitySeen.has(key)) continue;
        activitySeen.add(key);
        activityCards.push({
          student_id: studentId,
          slot: row.slot,
          subject_id: row.subject_id,
          activity_name: row.activity_name,
          comment: resolvePrimaryComment(null, row.comment),
        });
      }
    }

    return (
      <div className="app-page ofc-page cmt-page ncm-page">
        <PageHeader
          kicker="Setup · Comments"
          icon="fa-chalkboard-user"
          title="Primary Comments"
          description={
            term ? (
              <>
                Class teacher, subject, and other-subject remarks · <strong>{term.label}</strong>
              </>
            ) : (
              "Class teacher, subject, and other-subject remarks — saved before report cards are prepared."
            )
          }
        />
        <CommentsWorkspaceSwitch
          active="primary-comments"
          classCode={params.class || null}
          stream={params.stream === "-" ? "" : params.stream || null}
        />
        <PrimaryCommentsDesk
          termLabel={term?.label ?? null}
          termId={term?.id ?? null}
          groups={primaryGroups}
          classCards={classCards}
          subjectCards={subjectCards}
          activityCards={activityCards}
          subjectMarks={subjectMarks}
          subjects={subjects}
        />
      </div>
    );
  }

  if (nurseryView) {
    const termPack = await loadCurrentTerm(opened.auth.supabase);
    if (termPack.error) {
      return <AcademicsGate title="Nursery Comments" state={{ notice: "schema", message: termPack.error }} />;
    }
    const term = termPack.term;
    const [pupils, cardsQuery, storeQuery] = await Promise.all([
      loadRoll(opened.auth.supabase, opened.auth.user.id, undefined, opened.auth.campuses),
      term
        ? opened.auth.supabase
            .from("report_cards")
            .select("id, student_id, status, class_code, stream, class_teacher_comment")
            .eq("term_id", term.id)
        : Promise.resolve({ data: [], error: null }),
      term
        ? opened.auth.supabase
            .from("nursery_class_comments")
            .select("student_id, comment, class_code, stream, campus")
            .eq("term_id", term.id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (cardsQuery.error) {
      return <AcademicsGate title="Nursery Comments" state={{ notice: "schema", message: cardsQuery.error.message }} />;
    }
    if (storeQuery.error) {
      return <AcademicsGate title="Nursery Comments" state={{ notice: "schema", message: storeQuery.error.message }} />;
    }

    const nurseryGroups = groupPupils(pupils).filter((group) => group.section === "nursery");
    const nurseryCodes = new Set(nurseryGroups.map((group) => group.code));
    const cardByStudent = new Map(
      ((cardsQuery.data || []) as {
        id: string;
        student_id: string;
        status: string;
        class_code: string | null;
        stream: string | null;
        class_teacher_comment: string | null;
      }[])
        .filter((card) => card.class_code && nurseryCodes.has(card.class_code))
        .map((card) => [card.student_id, card]),
    );
    const storeByStudent = new Map(
      ((storeQuery.data || []) as {
        student_id: string;
        comment: string | null;
        class_code: string | null;
        stream: string | null;
        campus: string | null;
      }[]).map((row) => [row.student_id, row]),
    );

    const cards: NurseryCommentCard[] = [];
    const seen = new Set<string>();
    for (const group of nurseryGroups) {
      for (const pupil of group.pupils) {
        if (seen.has(pupil.id)) continue;
        seen.add(pupil.id);
        const store = storeByStudent.get(pupil.id);
        const card = cardByStudent.get(pupil.id);
        cards.push({
          student_id: pupil.id,
          comment: resolveNurseryClassTeacherComment(store?.comment, card?.class_teacher_comment),
          class_code: pupil.class_code || store?.class_code || group.code,
          stream: pupil.stream ?? store?.stream ?? group.stream,
          campus: pupil.campus || store?.campus || null,
          report_card_id: card?.id ?? null,
          status: card?.status ?? "",
        });
      }
    }
    // Keep store / card rows for pupils who left the roll but still have a remark.
    for (const [studentId, store] of storeByStudent) {
      if (seen.has(studentId)) continue;
      if (!store.class_code || !nurseryCodes.has(store.class_code)) continue;
      const card = cardByStudent.get(studentId);
      seen.add(studentId);
      cards.push({
        student_id: studentId,
        comment: resolveNurseryClassTeacherComment(store.comment, card?.class_teacher_comment),
        class_code: store.class_code,
        stream: store.stream || "",
        campus: store.campus,
        report_card_id: card?.id ?? null,
        status: card?.status ?? "",
      });
    }
    for (const [studentId, card] of cardByStudent) {
      if (seen.has(studentId)) continue;
      if (!card.class_code || !nurseryCodes.has(card.class_code)) continue;
      if (!resolveNurseryClassTeacherComment(null, card.class_teacher_comment)) continue;
      cards.push({
        student_id: studentId,
        comment: resolveNurseryClassTeacherComment(null, card.class_teacher_comment),
        class_code: card.class_code,
        stream: card.stream || "",
        campus: null,
        report_card_id: card.id,
        status: card.status ?? "",
      });
    }

    return (
      <div className="app-page ofc-page cmt-page ncm-page">
        <PageHeader
          kicker="Setup · Comments"
          icon="fa-seedling"
          title="Nursery Comments"
          description={
            term ? (
              <>
                Class teacher remarks for nursery learners · <strong>{term.label}</strong>
              </>
            ) : (
              "Class teacher remarks for nursery learners — saved before report cards are prepared."
            )
          }
        />
        <CommentsWorkspaceSwitch
          active="nursery-comments"
          classCode={params.class || null}
          stream={params.stream === "-" ? "" : params.stream || null}
        />
        <NurseryCommentsDesk
          termLabel={term?.label ?? null}
          termId={term?.id ?? null}
          groups={nurseryGroups}
          cards={cards}
        />
      </div>
    );
  }

  let config;
  try {
    config = await loadActiveCommentConfig(opened.auth.supabase);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Comment engine tables are missing.";
    return <AcademicsGate title="Comments" state={{ notice: "schema", message }} />;
  }
  if (!config) {
    return (
      <div className="app-page ofc-page cmt-page">
        <PageHeader kicker="Setup" icon="fa-comments" title="Comments" description="The comment bank is not installed on this database yet." />
        <section className="cmt-card">
          <div className="cmt-install">
            <p>Apply <code>supabase/0025_comment_engine.sql</code>, then reload this page. Draft report comments are generated from the active bank.</p>
          </div>
        </section>
      </div>
    );
  }

  const errors = validateConfiguration(config);
  const templates: DeskTemplate[] = [];
  for (const row of config.templates) {
    const commentType = asType(row.comment_type);
    if (!commentType) continue;
    templates.push({
      id: row.id,
      commentType,
      group: row.template_group,
      band: row.band_code,
      role: row.sentence_role,
      text: row.template_text,
      exactWords: row.exact_words,
      minWords: row.min_words,
      maxWords: row.max_words,
      exactSentences: row.exact_sentences,
      sortOrder: row.sort_order,
    });
  }
  const rules = [...config.rules]
    .sort((a, b) => a.priority - b.priority || a.rule_code.localeCompare(b.rule_code))
    .map((rule) => toRuleCard(rule))
    .filter((rule): rule is DeskRule => rule !== null);
  const off = templates.filter((template) => !templateReadout({
    text: template.text,
    exactWords: template.exactWords,
    minWords: template.minWords,
    maxWords: template.maxWords,
    exactSentences: template.exactSentences,
    requireFirstName: template.commentType === "cocurricular",
  }).ok).length;

  let sample = null;
  let sampleError: string | null = null;
  try {
    sample = buildSamplePreview(config);
  } catch (error) {
    sampleError = error instanceof Error ? error.message : "The sample report could not be built.";
  }

  let nurserySample = null;
  let nurserySampleError: string | null = null;
  try {
    nurserySample = buildNurserySamplePreview(config);
  } catch (error) {
    nurserySampleError = error instanceof Error ? error.message : "The nursery sample report could not be built.";
  }

  const nurseryRules: DeskRule[] = NURSERY_COMMENT_RULES.map((rule) => ({
    id: rule.id,
    commentType: "class_teacher",
    title: rule.title,
    detail: rule.detail,
    review: rule.review,
  }));

  return (
    <div className="app-page ofc-page cmt-page">
      <PageHeader
        kicker="Setup"
        icon="fa-comments"
        title="Comments"
        description={<>Primary mark banks and nursery progress-code remarks. <strong>{config.name}</strong> · v{config.version}</>}
      />
      <CommentsWorkspaceSwitch active="bank" />
      <section className="cmt-strip" aria-label="Comment bank">
        <div className={errors.length ? "is-warn" : "is-ok"}>
          <span className="cmt-stat-icon" aria-hidden="true"><i className="fa-solid fa-shield-halved" /></span>
          <span className="cmt-stat-copy">
            <span>Bank</span>
            <strong>{errors.length ? "Review" : "Active"}</strong>
            <small>{errors.length ? `${errors.length} ${errors.length === 1 ? "check" : "checks"} open` : `${config.name} v${config.version}`}</small>
          </span>
        </div>
        <div>
          <span className="cmt-stat-icon" aria-hidden="true"><i className="fa-solid fa-quote-left" /></span>
          <span className="cmt-stat-copy">
            <span>Lines</span>
            <strong>{templates.length}</strong>
            <small>In the active bank</small>
          </span>
        </div>
        <div>
          <span className="cmt-stat-icon" aria-hidden="true"><i className="fa-solid fa-list-check" /></span>
          <span className="cmt-stat-copy">
            <span>Rules</span>
            <strong>{rules.length}</strong>
            <small>First match wins</small>
          </span>
        </div>
        <div className={off ? "is-warn" : "is-ok"}>
          <span className="cmt-stat-icon" aria-hidden="true"><i className="fa-solid fa-spell-check" /></span>
          <span className="cmt-stat-copy">
            <span>Limits</span>
            <strong>{off ? off : "Clear"}</strong>
            <small>{off ? "Outside the word limits" : "Every line fits"}</small>
          </span>
        </div>
      </section>

      {errors.length ? (
        <section className="cmt-card cmt-alerts" aria-label="Configuration checks">
          <header className="cmt-card-head">
            <div className="cmt-card-title">
              <span className="cmt-card-icon" aria-hidden="true"><i className="fa-solid fa-triangle-exclamation" /></span>
              <div>
                <p>Before generating</p>
                <h2>Checks to review</h2>
              </div>
            </div>
          </header>
          <ul>{errors.map((error) => <li key={error}>{friendlyCheck(error)}</li>)}</ul>
        </section>
      ) : null}

      <CommentsDesk
        templates={templates}
        rules={rules}
        nurseryRules={nurseryRules}
        sample={sample}
        nurserySample={nurserySample}
        sampleError={sampleError}
        nurserySampleError={nurserySampleError}
        saveAction={saveCommentTemplate}
        previewAction={previewCommentEngine}
      />
    </div>
  );
}
