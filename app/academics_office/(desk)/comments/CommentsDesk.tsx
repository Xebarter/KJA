"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { CommentTemplateEditor } from "@/components/academics/CommentTemplateEditor";
import type { CommentPreview } from "@/lib/comment-engine/preview";
import {
  COMMENT_TABS,
  NURSERY_COMMENT_TABS,
  groupTemplates,
  isNurseryTemplate,
  phrase,
  type DeskRule,
  type DeskTemplate,
  type DeskType,
} from "@/components/academics/comment-model";

type SectionMode = "primary" | "nursery";
type PrimaryTabId = (typeof COMMENT_TABS)[number]["id"];
type NurseryTabId = (typeof NURSERY_COMMENT_TABS)[number]["id"];
type TabId = PrimaryTabId | NurseryTabId;

export function CommentsDesk({
  templates,
  rules,
  nurseryRules,
  sample,
  nurserySample,
  sampleError,
  nurserySampleError,
  saveAction,
  previewAction,
}: {
  templates: DeskTemplate[];
  rules: DeskRule[];
  nurseryRules: DeskRule[];
  sample: CommentPreview | null;
  nurserySample: CommentPreview | null;
  sampleError: string | null;
  nurserySampleError: string | null;
  saveAction: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
  previewAction: (formData?: FormData) => Promise<{ error?: string; sample?: CommentPreview }>;
}) {
  const [mode, setMode] = useState<SectionMode>("primary");
  const [tab, setTab] = useState<TabId>("subject_teacher");
  const [query, setQuery] = useState("");
  const [liveSample, setLiveSample] = useState(sample);
  const [liveNurserySample, setLiveNurserySample] = useState(nurserySample);
  const [previewError, setPreviewError] = useState(sampleError);
  const [nurseryPreviewError, setNurseryPreviewError] = useState(nurserySampleError);
  const [previewing, startPreview] = useTransition();
  const previewSeq = useRef(0);
  const tabListRef = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLowerCase();

  const tabs = mode === "nursery" ? NURSERY_COMMENT_TABS : COMMENT_TABS;
  const activeSample = mode === "nursery" ? liveNurserySample : liveSample;
  const activeError = mode === "nursery" ? nurseryPreviewError : previewError;

  useEffect(() => {
    setLiveSample(sample);
  }, [sample]);

  useEffect(() => {
    setLiveNurserySample(nurserySample);
  }, [nurserySample]);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "nursery" || hash.startsWith("nursery-")) {
      setMode("nursery");
      const nurseryTab = hash === "nursery" ? "class_teacher" : hash.replace(/^nursery-/, "");
      if (NURSERY_COMMENT_TABS.some((item) => item.id === nurseryTab)) setTab(nurseryTab as NurseryTabId);
      return;
    }
    if (COMMENT_TABS.some((item) => item.id === hash)) setTab(hash as PrimaryTabId);
  }, []);

  function selectMode(next: SectionMode) {
    setMode(next);
    setQuery("");
    const nextTab = next === "nursery" ? "class_teacher" : "subject_teacher";
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.hash = next === "nursery" ? "nursery" : nextTab;
    window.history.replaceState(null, "", url);
  }

  function selectTab(next: TabId) {
    setTab(next);
    const url = new URL(window.location.href);
    url.hash = mode === "nursery" ? (next === "class_teacher" ? "nursery" : `nursery-${next}`) : next;
    window.history.replaceState(null, "", url);
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const ids = tabs.map((item) => item.id);
    const index = ids.indexOf(tab as never);
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
    const target = mode;
    startPreview(async () => {
      const data = new FormData();
      data.set("mode", target);
      const outcome: { error?: string; sample?: CommentPreview } = await previewAction(data).catch(() => ({
        error: "The sample could not be refreshed.",
      }));
      if (seq !== previewSeq.current) return;
      if (outcome.error) {
        if (target === "nursery") setNurseryPreviewError(outcome.error);
        else setPreviewError(outcome.error);
        return;
      }
      if (outcome.sample) {
        if (target === "nursery") {
          setLiveNurserySample(outcome.sample);
          setNurseryPreviewError(null);
        } else {
          setLiveSample(outcome.sample);
          setPreviewError(null);
        }
      }
    });
  }

  const active = tabs.find((item) => item.id === tab) || tabs[0];

  const primaryTemplates = useMemo(
    () => templates.filter((template) => !isNurseryTemplate(template)),
    [templates],
  );
  const nurseryTemplates = useMemo(
    () => templates.filter((template) => isNurseryTemplate(template)),
    [templates],
  );

  const panels = useMemo(() => {
    if (mode === "nursery") {
      const rows = nurseryTemplates.filter((template) => {
        if (!needle) return true;
        const hay = [template.text, phrase(template.group), phrase(template.band), phrase(template.role)].join(" ").toLowerCase();
        return hay.includes(needle);
      });
      return [{ type: "class_teacher" as DeskType, groups: groupTemplates("class_teacher", rows) }];
    }
    const types: DeskType[] = ["subject_teacher", "cocurricular", "class_teacher", "headteacher"];
    return types.map((type) => {
      const rows = primaryTemplates.filter((template) => {
        if (template.commentType !== type) return false;
        if (!needle) return true;
        const hay = [template.text, phrase(template.group), phrase(template.band), phrase(template.role)].join(" ").toLowerCase();
        return hay.includes(needle);
      });
      return { type, groups: groupTemplates(type, rows) };
    });
  }, [mode, needle, nurseryTemplates, primaryTemplates]);

  const ruleGroups = useMemo(() => {
    if (mode === "nursery") {
      const filtered = nurseryRules.filter((rule) => {
        if (!needle) return true;
        return `${rule.title} ${rule.detail}`.toLowerCase().includes(needle);
      });
      return filtered.length
        ? [{ type: "class_teacher" as DeskType, label: "Nursery class teacher", rules: filtered }]
        : [];
    }
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
  }, [mode, needle, nurseryRules, rules]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    if (mode === "nursery") {
      map.set("class_teacher", nurseryTemplates.length);
      map.set("rules", nurseryRules.length);
      return map;
    }
    for (const item of COMMENT_TABS) {
      if (item.id === "rules") map.set(item.id, rules.length);
      else map.set(item.id, primaryTemplates.filter((template) => template.commentType === item.id).length);
    }
    return map;
  }, [mode, nurseryRules.length, nurseryTemplates, primaryTemplates, rules.length]);

  return (
    <div className="cmt-desk">
      <div className="cmt-section-switch" role="group" aria-label="Comment bank section">
        <button type="button" className={mode === "primary" ? "is-on" : ""} aria-pressed={mode === "primary"} onClick={() => selectMode("primary")}>
          <i className="fa-solid fa-book-open" aria-hidden="true" /> Primary
        </button>
        <button type="button" className={mode === "nursery" ? "is-on" : ""} aria-pressed={mode === "nursery"} onClick={() => selectMode("nursery")}>
          <i className="fa-solid fa-seedling" aria-hidden="true" /> Nursery
        </button>
      </div>

      <SampleSheet
        sample={activeSample}
        error={activeError}
        pending={previewing}
        nursery={mode === "nursery"}
        onRefresh={refreshSample}
      />

      <div className="cmt-tabs" role="tablist" aria-label={mode === "nursery" ? "Nursery comment bank" : "Comment bank"} ref={tabListRef} onKeyDown={onTabKey}>
        {tabs.map((item) => {
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
          const meta = tabs.find((item) => item.id === panel.type);
          const shown = tab === panel.type;
          return (
            <div key={panel.type} className="cmt-panel" role="tabpanel" id={shown ? "cmt-panel" : undefined} aria-labelledby={`cmt-tab-${panel.type}`} hidden={!shown}>
              {meta && "tokens" in meta && meta.tokens?.length ? (
                <p className="cmt-tokens">
                  <span>Placeholders</span>
                  {meta.tokens.map((token) => (
                    <code key={token}>{token}</code>
                  ))}
                </p>
              ) : null}
              {panel.groups.length ? (
                <div className="cmt-groups">
                  {panel.groups.map(([key, rows]) => (
                    <section key={key} className="cmt-group">
                      <h3>
                        {phrase(key)} <span>{rows.length}</span>
                      </h3>
                      <div className="cmt-lines">
                        {rows.map((template) => (
                          <CommentTemplateEditor key={template.id} template={template} action={saveAction} onSaved={refreshSample} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="cmt-empty">
                  {needle
                    ? `No lines match “${query.trim()}”.`
                    : mode === "nursery"
                      ? "No nursery lines yet. Run supabase/0083_nursery_comment_templates.sql, then refresh."
                      : "No lines in this bank."}
                </p>
              )}
            </div>
          );
        })}

        <div className="cmt-panel" role="tabpanel" id={tab === "rules" ? "cmt-panel" : undefined} aria-labelledby="cmt-tab-rules" hidden={tab !== "rules"}>
          {ruleGroups.length ? (
            <div className="cmt-groups">
              {ruleGroups.map((group) => (
                <section key={group.type} className="cmt-group">
                  <h3>
                    {group.label} <span>{group.rules.length}</span>
                  </h3>
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
  nursery,
  onRefresh,
}: {
  sample: CommentPreview | null;
  error: string | null;
  pending: boolean;
  nursery: boolean;
  onRefresh: () => void;
}) {
  const signature = sample ? sample.sections.map((section) => section.lines.map((line) => line.text).join("|")).join("||") : "";
  return (
    <section className={`cmt-card cmt-sheet${pending ? " is-pending" : ""}`} aria-label="Sample report card" aria-busy={pending}>
      <header className="cmt-card-head cmt-sheet-toolbar">
        <div className="cmt-card-title">
          <span className="cmt-card-icon" aria-hidden="true">
            <i className={`fa-solid ${nursery ? "fa-seedling" : "fa-file-lines"}`} />
          </span>
          <div>
            <p>Live preview</p>
            <h2>{nursery ? "Sample nursery report" : "Sample report card"}</h2>
          </div>
        </div>
        <button className="cmt-btn is-ghost" type="button" onClick={onRefresh} disabled={pending}>
          <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-rotate"}`} aria-hidden="true" />
          {pending ? "Updating…" : "Refresh"}
        </button>
      </header>
      {error ? (
        <p className="cmt-error is-block" role="alert">
          {error}
        </p>
      ) : null}
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
                <p>{nursery ? "Nursery progress-code preview · not a published card" : "Comment bank preview · not a published card"}</p>
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
                <span>{nursery ? "Developmental tone" : "Academic"}</span>
                <strong>{sample.academic}</strong>
              </div>
              <div className="cmt-report-band">
                <span>{nursery ? "Skill codes" : "Co-curricular"}</span>
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
              <p className="cmt-report-section-label">{nursery ? "Sample progress codes" : "Sample marks"}</p>
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
              <span>{nursery ? "Generated from nursery progress codes" : "Generated from the active comment bank"}</span>
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
