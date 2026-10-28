"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { CommentTemplateEditor } from "@/components/academics/CommentTemplateEditor";
import type { CommentPreview } from "@/lib/comment-engine/preview";
import {
  COMMENT_TABS,
  groupTemplates,
  phrase,
  type DeskRule,
  type DeskTemplate,
  type DeskType,
} from "@/components/academics/comment-model";

type TabId = (typeof COMMENT_TABS)[number]["id"];

export function CommentsDesk({
  templates,
  rules,
  sample,
  sampleError,
  saveAction,
  previewAction,
}: {
  templates: DeskTemplate[];
  rules: DeskRule[];
  sample: CommentPreview | null;
  sampleError: string | null;
  saveAction: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
  previewAction: () => Promise<{ error?: string; sample?: CommentPreview }>;
}) {
  const [tab, setTab] = useState<TabId>("subject_teacher");
  const [query, setQuery] = useState("");
  const [liveSample, setLiveSample] = useState(sample);
  const [previewError, setPreviewError] = useState(sampleError);
  const [previewing, startPreview] = useTransition();
  const previewSeq = useRef(0);
  const tabListRef = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLowerCase();

  useEffect(() => {
    setLiveSample(sample);
  }, [sample]);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (COMMENT_TABS.some((item) => item.id === hash)) setTab(hash as TabId);
  }, []);

  function selectTab(next: TabId) {
    setTab(next);
    const url = new URL(window.location.href);
    url.hash = next;
    window.history.replaceState(null, "", url);
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const ids = COMMENT_TABS.map((item) => item.id);
    const index = ids.indexOf(tab);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % ids.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + ids.length) % ids.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    else return;
    event.preventDefault();
    const id = ids[next];
    selectTab(id);
    const button = tabListRef.current?.querySelector<HTMLButtonElement>(`#cmt-tab-${id}`);
    button?.focus();
  }

  function refreshSample() {
    const seq = ++previewSeq.current;
    startPreview(async () => {
      const outcome: { error?: string; sample?: CommentPreview } = await previewAction().catch(() => ({ error: "The sample could not be refreshed." }));
      if (seq !== previewSeq.current) return;
      if (outcome.error) {
        setPreviewError(outcome.error);
        return;
      }
      if (outcome.sample) {
        setLiveSample(outcome.sample);
        setPreviewError(null);
      }
    });
  }

  const active = COMMENT_TABS.find((item) => item.id === tab) || COMMENT_TABS[0];
  const panels = useMemo(() => {
    const types: DeskType[] = ["subject_teacher", "cocurricular", "class_teacher", "headteacher"];
    return types.map((type) => {
      const rows = templates.filter((template) => {
        if (template.commentType !== type) return false;
        if (!needle) return true;
        const hay = [template.text, phrase(template.group), phrase(template.band), phrase(template.role)].join(" ").toLowerCase();
        return hay.includes(needle);
      });
      return { type, groups: groupTemplates(type, rows) };
    });
  }, [needle, templates]);
  const ruleGroups = useMemo(() => {
    const types: DeskType[] = ["subject_teacher", "cocurricular", "class_teacher", "headteacher"];
    return types
      .map((type) => ({
        type,
        label: COMMENT_TABS.find((item) => item.id === type)?.label || type,
        rules: rules.filter((rule) => {
          if (rule.commentType !== type) return false;
          if (!needle) return true;
          return `${rule.title} ${rule.detail}`.toLowerCase().includes(needle);
        }),
      }))
      .filter((group) => group.rules.length);
  }, [needle, rules]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of COMMENT_TABS) {
      if (item.id === "rules") map.set(item.id, rules.length);
      else map.set(item.id, templates.filter((template) => template.commentType === item.id).length);
    }
    return map;
  }, [rules.length, templates]);

  return (
    <div className="cmt-desk">
      <SampleSheet
        sample={liveSample}
        error={previewError}
        pending={previewing}
        onRefresh={refreshSample}
      />

      <div className="cmt-tabs" role="tablist" aria-label="Comment bank" ref={tabListRef} onKeyDown={onTabKey}>
        {COMMENT_TABS.map((item) => {
          const selected = item.id === tab;
          return (
            <button
              key={item.id}
              id={`cmt-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="cmt-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(item.id)}
            >
              <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
              {item.label}
              <em>{counts.get(item.id) ?? 0}</em>
            </button>
          );
        })}
      </div>

      <section className="cmt-card cmt-bank">
        <header className="cmt-bank-head">
          <p>{active.hint}</p>
          <label className="cmt-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={tab === "rules" ? "Search rules" : "Search lines"}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>
        </header>

        {panels.map((panel) => {
          const meta = COMMENT_TABS.find((item) => item.id === panel.type);
          const shown = tab === panel.type;
          return (
            <div key={panel.type} className="cmt-panel" role="tabpanel" id={shown ? "cmt-panel" : undefined} aria-labelledby={`cmt-tab-${panel.type}`} hidden={!shown}>
              {meta?.tokens?.length ? (
                <p className="cmt-tokens">
                  <span>Placeholders</span>
                  {meta.tokens.map((token) => <code key={token}>{token}</code>)}
                </p>
              ) : null}
              {panel.groups.length ? (
                <div className="cmt-groups">
                  {panel.groups.map(([key, rows]) => (
                    <section key={key} className="cmt-group">
                      <h3>{phrase(key)} <span>{rows.length}</span></h3>
                      <div className="cmt-lines">
                        {rows.map((template) => (
                          <CommentTemplateEditor key={template.id} template={template} action={saveAction} onSaved={refreshSample} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="cmt-empty">{needle ? `No lines match “${query.trim()}”.` : "No lines in this bank."}</p>
              )}
            </div>
          );
        })}

        <div className="cmt-panel" role="tabpanel" id={tab === "rules" ? "cmt-panel" : undefined} aria-labelledby="cmt-tab-rules" hidden={tab !== "rules"}>
          {ruleGroups.length ? (
            <div className="cmt-groups">
              {ruleGroups.map((group) => (
                <section key={group.type} className="cmt-group">
                  <h3>{group.label} <span>{group.rules.length}</span></h3>
                  <ol className="cmt-rules">
                    {group.rules.map((rule, index) => (
                      <li key={rule.id}>
                        <span className="cmt-rule-n">{index + 1}</span>
                        <span className="cmt-rule-copy">
                          <strong>{rule.title}</strong>
                          {rule.detail ? <span>{rule.detail}</span> : null}
                        </span>
                        {rule.review ? <em>Review</em> : null}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <p className="cmt-empty">{needle ? `No rules match “${query.trim()}”.` : "No rules in this bank."}</p>
          )}
        </div>
      </section>
    </div>
  );
}

function SampleSheet({
  sample,
  error,
  pending,
  onRefresh,
}: {
  sample: CommentPreview | null;
  error: string | null;
  pending: boolean;
  onRefresh: () => void;
}) {
  const signature = sample ? sample.sections.map((section) => section.lines.map((line) => line.text).join("|")).join("||") : "";
  return (
    <section className={`cmt-card cmt-sheet${pending ? " is-pending" : ""}`} aria-label="Sample report card" aria-busy={pending}>
      <header className="cmt-card-head cmt-sheet-toolbar">
        <div className="cmt-card-title">
          <span className="cmt-card-icon" aria-hidden="true"><i className="fa-solid fa-file-lines" /></span>
          <div>
            <p>Live preview</p>
            <h2>Sample report card</h2>
          </div>
        </div>
        <button className="cmt-btn is-ghost" type="button" onClick={onRefresh} disabled={pending}>
          <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-rotate"}`} aria-hidden="true" />
          {pending ? "Updating…" : "Refresh"}
        </button>
      </header>
      {error ? <p className="cmt-error is-block" role="alert">{error}</p> : null}
      {sample ? (
        <div className="cmt-sheet-body" key={signature}>
          <article className="cmt-report">
            <header className="cmt-report-brand">
              <span className="cmt-report-seal" aria-hidden="true">
                <img src="/images/icon.png" alt="" />
              </span>
              <div className="cmt-report-brand-copy">
                <p className="cmt-report-kicker">Kampala Junior Academy</p>
                <h3>End of term report</h3>
                <p>Comment bank preview · not a published card</p>
              </div>
            </header>

            <div className="cmt-report-learner">
              <div>
                <span>Learner</span>
                <strong>{sample.learner}</strong>
              </div>
              <div>
                <span>Class</span>
                <strong>{sample.klass}</strong>
              </div>
            </div>

            <div className="cmt-report-bands" aria-label="Overall bands">
              <div className="cmt-report-band">
                <span>Academic</span>
                <strong>{sample.academic}</strong>
              </div>
              <div className="cmt-report-band">
                <span>Co-curricular</span>
                <strong>{sample.cocurricular}</strong>
              </div>
              {sample.warnings ? (
                <div className="cmt-report-band is-warn">
                  <span>Bank checks</span>
                  <strong>{sample.warnings} open</strong>
                </div>
              ) : null}
            </div>

            <div className="cmt-report-marks">
              <p className="cmt-report-section-label">Sample marks</p>
              <p>{sample.marks}</p>
            </div>

            {sample.sections.map((section) => (
              <section className="cmt-report-section" key={section.id}>
                <h4>{section.title}</h4>
                {section.lines.some((line) => line.label) ? (
                  <dl>
                    {section.lines.map((line, index) => (
                      <div key={`${section.id}-${index}`} className={line.tone === "ok" ? undefined : `is-${line.tone}`}>
                        <dt>{line.label}</dt>
                        <dd>{line.text}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  section.lines.map((line, index) => (
                    <p key={`${section.id}-${index}`} className={line.tone === "ok" ? undefined : `is-${line.tone}`}>
                      {line.tone === "watch" ? <em>Review</em> : null}
                      {line.text}
                    </p>
                  ))
                )}
              </section>
            ))}

            <footer className="cmt-report-foot">
              <span>Generated from the active comment bank</span>
            </footer>
          </article>
        </div>
      ) : !error ? (
        <div className="cmt-sheet-empty">
          <i className="fa-regular fa-file-lines" aria-hidden="true" />
          <p>No sample available yet. Refresh after the bank is ready.</p>
        </div>
      ) : null}
    </section>
  );
}
