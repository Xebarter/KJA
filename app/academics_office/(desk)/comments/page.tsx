import { previewCommentEngine, saveCommentTemplate } from "@/app/academics_office/(desk)/actions";
import { CommentsDesk } from "@/app/academics_office/(desk)/comments/CommentsDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { friendlyCheck, templateReadout, toRuleCard, type DeskRule, type DeskTemplate, type DeskType } from "@/components/academics/comment-model";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { openAcademics } from "@/lib/academics";
import { loadActiveCommentConfig, validateConfiguration } from "@/lib/comment-engine";
import { buildSamplePreview } from "@/lib/comment-engine/preview";
import "./comments.css";

export const metadata = { title: "Comments" };

function asType(value: string): DeskType | null {
  if (value === "subject_teacher" || value === "cocurricular" || value === "class_teacher" || value === "headteacher") return value;
  return null;
}

export default async function CommentsSetupPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Comments" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Comments" />;

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

  return (
    <div className="app-page ofc-page cmt-page">
      <PageHeader
        kicker="Setup"
        icon="fa-comments"
        title="Comments"
        description={<>Lines used when staff generate draft report comments. <strong>{config.name}</strong> · v{config.version}</>}
      />
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
        sample={sample}
        sampleError={sampleError}
        saveAction={saveCommentTemplate}
        previewAction={previewCommentEngine}
      />
    </div>
  );
}
