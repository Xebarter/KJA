"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { prepareAdmissionsNurseryReports } from "@/app/admissions_office/(office)/report-cards/actions";
import {
  cancelTeacherReportPreparation,
  generateTeacherClassComments,
  prepareTeacherReports,
  reopenTeacherReports,
} from "@/app/teacher/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { StreamReportBar } from "@/components/academics/StreamReportBar";
import { Empty } from "@/components/academics/ui";
import { StudentFace } from "@/components/StudentFace";
import { ACADEMICS_BASE, classLabel, streamQuery, type ClassGroup } from "@/lib/academics";
import { reportSittingKey, type ReportSitting } from "@/lib/academics-reports";
import type { RollPupil } from "@/lib/academics-roll";
import { OFFICE_BASE } from "@/lib/office-nav";
import { TEACHER_BASE } from "@/lib/teacher";

export type ReportCardRow = {
  id: string;
  student_id: string;
  status: string;
  class_code: string | null;
  stream: string | null;
  overall_score: number | null;
  report_title?: string | null;
};

type Selection = { code: string; stream: string };
type DeskMode = "office" | "class" | "admissions";

const nf = (value: number) => value.toLocaleString("en-GB");

function nurseryBandLabel(score: number) {
  if (score >= 75) return "Exceeding";
  if (score >= 50) return "Secure";
  if (score >= 25) return "Developing";
  return "Beginning";
}

function scoreLabel(value: number | null | undefined, nursery: boolean) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (nursery) return nurseryBandLabel(number);
  return number.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function statusLabel(status: string | null) {
  if (status === "published") return "Published";
  if (status === "approved") return "Approved";
  if (status === "draft") return "Draft";
  return "Not prepared";
}

function sexLabel(sex: string | null) {
  if (sex === "M") return "Boy";
  if (sex === "F") return "Girl";
  return "";
}

function classHref(basePath: string, code: string, stream: string) {
  return `${basePath}?class=${encodeURIComponent(code)}&stream=${encodeURIComponent(streamQuery(stream))}`;
}

function selectionFromUrl(groups: ClassGroup<RollPupil>[]): Selection | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("class");
  if (!code) return null;
  const raw = params.get("stream");
  const stream = raw === null ? null : raw === "-" || raw === "" ? "" : raw.slice(0, 20);
  const match = groups.find((group) => group.code === code && (stream === null || group.stream === stream));
  return match ? { code: match.code, stream: match.stream } : null;
}

function sameSelection(a: Selection | null, b: Selection | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.code === b.code && a.stream === b.stream;
}

/** Report cards desk: class picks update the roll instantly without a server round trip. */
export function ReportsDesk({
  termLabel,
  termId,
  groups,
  cards,
  sittingsByClass,
  basePath = `${ACADEMICS_BASE}/reports`,
  mode = "office",
}: {
  termLabel: string | null;
  termId: string | null;
  groups: ClassGroup<RollPupil>[];
  cards: ReportCardRow[];
  sittingsByClass: Record<string, ReportSitting[]>;
  basePath?: string;
  mode?: DeskMode;
}) {
  const classMode = mode === "class";
  const admissionsMode = mode === "admissions";
  const [selection, setSelection] = useState<Selection | null>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  useLayoutEffect(() => {
    setSelection(selectionFromUrl(groupsRef.current));
  }, []);

  const selectClass = useCallback(
    (next: Selection | null, historyMode: "push" | "replace" = "push") => {
      setSelection(next);
      const url = next ? classHref(basePath, next.code, next.stream) : basePath;
      if (`${window.location.pathname}${window.location.search}` === url) return;
      if (historyMode === "replace") window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [basePath],
  );

  useEffect(() => {
    const onPop = () => {
      const next = selectionFromUrl(groupsRef.current);
      setSelection((current) => (sameSelection(current, next) ? current : next));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const byPupil = useMemo(() => new Map(cards.map((card) => [card.student_id, card])), [cards]);
  const selected = selection ? groups.find((group) => group.code === selection.code && group.stream === selection.stream) || null : null;
  const selectedCards = selected ? selected.pupils.map((pupil) => byPupil.get(pupil.id)).filter((card): card is ReportCardRow => Boolean(card)) : [];
  const drafts = selectedCards.filter((card) => card.status === "draft").length;
  const approved = selectedCards.filter((card) => card.status === "approved").length;
  const published = selectedCards.filter((card) => card.status === "published").length;
  const sittings = selected
    ? sittingsByClass[reportSittingKey(selected.code, selected.stream, selected.campus)] ||
      sittingsByClass[reportSittingKey(selected.code, selected.stream)] ||
      []
    : [];
  const onRoll = useMemo(() => new Set(groups.flatMap((group) => group.pupils.map((pupil) => pupil.id))), [groups]);
  const waiting = useMemo(
    () =>
      groups
        .map((group) => ({
          group,
          drafts: group.pupils.filter((pupil) => byPupil.get(pupil.id)?.status === "draft").length,
        }))
        .filter((row) => row.drafts > 0),
    [groups, byPupil],
  );
  const draftTotal = cards.filter((card) => card.status === "draft").length;
  const unmatchedDrafts = cards.filter((card) => card.status === "draft" && !onRoll.has(card.student_id)).length;
  const sections = useMemo(
    () =>
      (["nursery", "primary"] as const)
        .map((section) => ({ section, label: section === "nursery" ? "Nursery" : "Primary", rows: groups.filter((group) => group.section === section) }))
        .filter((section) => section.rows.length),
    [groups],
  );

  if (!termId || !termLabel) {
    return (
      <div className="app-page ofc-page rpt-page">
        <PageHeader
          kicker={admissionsMode ? "Nursery" : classMode ? "My class" : "Assessment"}
          icon={admissionsMode ? "fa-seedling" : "fa-file-lines"}
          title={admissionsMode ? "Nursery report cards" : "Report cards"}
          description="Report cards need a current term."
        />
        <Empty title="No current term" />
      </div>
    );
  }

  return (
    <div className="app-page ofc-page rpt-page">
      <PageHeader
        kicker={admissionsMode ? "Nursery" : classMode ? "My class" : "Assessment"}
        icon={admissionsMode ? "fa-seedling" : "fa-file-lines"}
        title={selected ? classLabel(selected.code, selected.stream) : admissionsMode ? "Nursery report cards" : "Report cards"}
        description={
          selected
            ? admissionsMode
              ? <>{termLabel} · developmental report cards · <strong>{nf(selected.pupils.length)}</strong> on roll.</>
              : <>{termLabel} · <strong>{nf(selected.pupils.length)}</strong> on this report.</>
            : draftTotal
              ? <>{termLabel}. <strong>{nf(draftTotal)}</strong> {draftTotal === 1 ? "report card is" : "report cards are"} still in draft.</>
              : admissionsMode
                ? <>{termLabel}. Generate nursery developmental cards and download PDFs. Academics posts them for parents.</>
                : classMode
                ? <>{termLabel}. Open a stream to review cards and add your remark.</>
                : <>{termLabel}. Generate a class, preview every card, then post it for parents.</>
        }
        actions={
          selected ? (
            <a
              className="admin-hero-btn"
              href={basePath}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                selectClass(null);
              }}
            >
              <i className="fa-solid fa-table-cells" aria-hidden="true" /> All classes
            </a>
          ) : null
        }
      />
      {!selected && draftTotal ? (
        <section className="rpt-alert" aria-label="Draft report cards">
          <div className="rpt-alert-head">
            <span aria-hidden="true"><i className="fa-solid fa-file-lines" /></span>
            <div>
              <strong>{nf(draftTotal)} {draftTotal === 1 ? "draft" : "drafts"}</strong>
              <p>{classMode ? "Open a class to review cards and add your remark." : "Open a class to preview and post its report cards."}</p>
            </div>
          </div>
          {waiting.length ? (
            <ul className="rpt-alert-list">
              {waiting.map(({ group, drafts: count }) => (
                <li key={`${group.code}-${group.stream}`}>
                  <a
                    href={classHref(basePath, group.code, group.stream)}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                      event.preventDefault();
                      selectClass({ code: group.code, stream: group.stream });
                    }}
                  >
                    {classLabel(group.code, group.stream)}
                    <em>{nf(count)}</em>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {unmatchedDrafts ? <p className="rpt-alert-note">{nf(unmatchedDrafts)} {unmatchedDrafts === 1 ? "draft is" : "drafts are"} for learners no longer on the roll.</p> : null}
        </section>
      ) : null}
      {selected ? (
        <section className="rpt-strip" aria-label={classLabel(selected.code, selected.stream)}>
          <div>
            <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-group" /></span>
            <span className="rpt-stat-copy"><span>On the roll</span><strong>{nf(selected.pupils.length)}</strong><small>{classLabel(selected.code, selected.stream)}</small></span>
          </div>
          <div className={drafts ? "is-warn" : ""}>
            <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-pen" /></span>
            <span className="rpt-stat-copy"><span>Draft</span><strong>{nf(drafts)}</strong><small>{classMode ? "Open for remarks" : "Still with the office"}</small></span>
          </div>
          <div className={approved ? "is-warn" : ""}>
            <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-stamp" /></span>
            <span className="rpt-stat-copy"><span>Approved</span><strong>{nf(approved)}</strong><small>{classMode ? "Still editable" : "Ready to post"}</small></span>
          </div>
          <div className={selected.pupils.length && published === selected.pupils.length ? "is-ok" : ""}>
            <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-circle-check" /></span>
            <span className="rpt-stat-copy"><span>Published</span><strong>{nf(published)}</strong><small>Visible to parents</small></span>
          </div>
        </section>
      ) : null}
      <div className="rpt-layout">
        <section className="rpt-card rpt-classes" aria-label="Classes">
          <header className="rpt-card-head">
            <div className="rpt-card-title">
              <span className="rpt-card-icon" aria-hidden="true"><i className="fa-solid fa-table-cells" /></span>
              <div>
                <h2>Classes</h2>
                <p>{classMode ? "Your streams this term." : "Open one stream at a time."}</p>
              </div>
            </div>
          </header>
          <ul className="rpt-directory">
            {sections.map((section) => (
              <li key={section.section}>
                <h2 className="rpt-section"><span>{section.label}</span><em>{nf(section.rows.length)}</em></h2>
                <ul>
                  {section.rows.map((group) => {
                    const mine = group.pupils.map((pupil) => byPupil.get(pupil.id)).filter((card): card is ReportCardRow => Boolean(card));
                    const live = mine.filter((card) => card.status === "published").length;
                    const open = mine.filter((card) => card.status === "draft").length;
                    const on = selected?.code === group.code && selected.stream === group.stream;
                    return (
                      <li key={`${group.code}-${group.stream}`}>
                        <a
                          className={`${on ? "is-on" : ""}${open ? " is-draft" : ""}`}
                          href={classHref(basePath, group.code, group.stream)}
                          aria-current={on ? "page" : undefined}
                          onClick={(event) => {
                            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                            event.preventDefault();
                            selectClass({ code: group.code, stream: group.stream }, on ? "replace" : "push");
                          }}
                        >
                          <span className="rpt-mark" aria-hidden="true">{group.code}</span>
                          <span>
                            <strong>{classLabel(group.code, group.stream)}</strong>
                            <small>{open ? `${nf(open)} draft${open === 1 ? "" : "s"}` : `${nf(group.pupils.length)} pupils`}</small>
                          </span>
                          {open ? <span className="rpt-drafts" aria-label={`${open} drafts`}>{nf(open)}</span> : <span className="rpt-mini">{nf(live)}/{nf(group.pupils.length)}</span>}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section className="rpt-card" aria-label={selected ? classLabel(selected.code, selected.stream) : "Choose a class"}>
          <header className="rpt-card-head">
            <div className="rpt-card-title">
              <span className="rpt-card-icon" aria-hidden="true"><i className="fa-solid fa-file-lines" /></span>
              <div>
                <h2>{selected ? classLabel(selected.code, selected.stream) : "Choose a class"}</h2>
                <p>
                  {selected
                    ? admissionsMode
                      ? "Pick a locked developmental sitting, generate the cards, then download the PDF."
                      : selected.section === "nursery"
                      ? classMode
                        ? "Pick a locked developmental sitting, generate the cards, then add leadership remarks."
                        : "Pick a locked developmental sitting, generate the cards, then post for parents."
                      : classMode
                        ? "Generate the cards, review them, then add your remarks."
                        : "Generate the cards, preview them, then post."
                    : "Pick a stream from the list."}
                </p>
              </div>
            </div>
          </header>
          {selected ? (
            <>
              <StreamReportBar
                termId={termId}
                classCode={selected.code}
                stream={selected.stream}
                drafts={drafts}
                cards={selectedCards.length}
                sittings={sittings}
                reportTitle={selectedCards.find((card) => card.report_title)?.report_title}
                {...(admissionsMode
                  ? {
                      showPost: false,
                      showRemarkTools: false,
                      prepareAction: prepareAdmissionsNurseryReports,
                      pdfHref: `${OFFICE_BASE}/report-cards/pdf?class=${encodeURIComponent(selected.code)}&stream=${encodeURIComponent(streamQuery(selected.stream))}`,
                    }
                  : classMode
                    ? {
                        showPost: false,
                        prepareAction: prepareTeacherReports,
                        regenerateAction: generateTeacherClassComments,
                        cancelAction: cancelTeacherReportPreparation,
                        reopenAction: reopenTeacherReports,
                        pdfHref: `${TEACHER_BASE}/reports/pdf?class=${encodeURIComponent(selected.code)}&stream=${encodeURIComponent(streamQuery(selected.stream))}`,
                      }
                    : {})}
              />
              {selected.pupils.length ? (
                <ul className="rpt-roll">
                  {selected.pupils.map((pupil, index) => {
                    const card = byPupil.get(pupil.id);
                    const nursery = selected.section === "nursery";
                    const score = scoreLabel(card?.overall_score, nursery);
                    return (
                      <li key={pupil.id} className={card ? `is-${card.status}` : ""}>
                        <StudentFace id={pupil.id} name={pupil.full_name} photoPath={pupil.photo_path} className="rpt-face" />
                        <span className="rpt-who">
                          {card && !admissionsMode ? (
                            <Link href={`${basePath}/${card.id}`}>{pupil.full_name}</Link>
                          ) : (
                            <strong>{pupil.full_name}</strong>
                          )}
                          <small>{[String(index + 1).padStart(2, "0"), pupil.student_number, sexLabel(pupil.sex)].filter(Boolean).join(" · ")}</small>
                        </span>
                        <strong className={score ? "rpt-score" : "rpt-score is-empty"}>{score ?? "-"}</strong>
                        <em className={`rpt-pill${card ? ` is-${card.status}` : ""}`}>{statusLabel(card?.status ?? null)}</em>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="rpt-quiet">No active pupils in this stream.</p>}
            </>
          ) : (
            <p className="rpt-quiet">{classMode ? "Pick a class to review its report cards." : "Pick a class to generate its report cards."}</p>
          )}
        </section>
      </div>
    </div>
  );
}
