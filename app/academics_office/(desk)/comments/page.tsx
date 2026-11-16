import { previewCommentEngine, saveCommentTemplate } from "@/app/academics_office/(desk)/actions";
import { CommentsDesk } from "@/app/academics_office/(desk)/comments/CommentsDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { CommentsWorkspaceSwitch } from "@/components/academics/CommentsWorkspaceSwitch";
import { friendlyCheck, templateReadout, toRuleCard, type DeskRule, type DeskTemplate, type DeskType } from "@/components/academics/comment-model";
import { NurseryCommentsDesk, type NurseryCommentCard } from "@/components/academics/NurseryCommentsDesk";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { groupPupils, loadCurrentTerm } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { loadActiveCommentConfig, validateConfiguration } from "@/lib/comment-engine";
import { NURSERY_COMMENT_RULES } from "@/lib/comment-engine/nursery-defaults";
import { buildNurserySamplePreview, buildSamplePreview } from "@/lib/comment-engine/preview";
import { resolveNurseryClassTeacherComment } from "@/lib/nursery-class-comments";
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
  const nurseryView = params.view === "nursery-comments";

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
