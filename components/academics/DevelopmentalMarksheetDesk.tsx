"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveDevelopmentalAssessment,
  reopenDevelopmentalAssessment,
  saveSkillRatings,
} from "@/app/academics_office/(desk)/actions";
import { askConfirm } from "@/components/AppConfirm";
import { DeskForm } from "@/components/academics/Form";
import { StudentFace } from "@/components/StudentFace";
import { filenameFromDisposition, saveClientDownload } from "@/lib/client-download";
import type { ProgressCodeRow, SkillValueKind } from "@/lib/nursery-dsba";

export type DsbaMshSkill = { id: string; description: string; sort: number; value_kind?: SkillValueKind };
export type DsbaMshDomain = { id: string; name: string; sort: number; skills: DsbaMshSkill[] };
export type DsbaMshPupil = {
  id: string;
  name: string;
  number: string;
  photoPath: string | null;
  roll: number;
};
export type DsbaMshHeading = {
  classLabel: string;
  sittingName: string;
  kindLabel: string;
  heldLabel: string;
  termLabel: string;
};

type SortKey = "roll" | "name-asc" | "name-desc" | "gaps" | "complete";
type ExportFormat = "pdf" | "xlsx";

const nf = (value: number) => value.toLocaleString("en-GB");
const SHORT_CODE = /^[A-Za-z0-9+/±\-]{1,8}$/;

function cellKey(pupilId: string, skillId: string) {
  return `${pupilId}|${skillId}`;
}

function shortSkill(text: string, max = 28) {
  const value = text.trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

const SORT_CHOICES: { id: SortKey; label: string; icon: string }[] = [
  { id: "roll", label: "Roll order", icon: "fa-list-ol" },
  { id: "name-asc", label: "Name A–Z", icon: "fa-arrow-down-a-z" },
  { id: "name-desc", label: "Name Z–A", icon: "fa-arrow-down-z-a" },
  { id: "gaps", label: "Most gaps", icon: "fa-circle-exclamation" },
  { id: "complete", label: "Most complete", icon: "fa-circle-check" },
];

export function DevelopmentalMarksheetDesk({
  assessmentId,
  domains,
  progressCodes,
  pupils,
  ratings,
  phase,
  office,
  heading,
  closeHref,
  exportHref,
  allowExport = true,
}: {
  assessmentId: string;
  domains: DsbaMshDomain[];
  progressCodes: ProgressCodeRow[];
  pupils: DsbaMshPupil[];
  ratings: Record<string, string>;
  phase: "open" | "submitted" | "approved";
  office: boolean;
  heading: DsbaMshHeading;
  closeHref: string;
  exportHref?: string;
  allowExport?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pupilSheetRef = useRef<HTMLDivElement>(null);
  const exportRootRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const arrangeRootRef = useRef<HTMLDivElement>(null);
  const exportListId = useId();
  const arrangeListId = useId();

  const incomingKey = JSON.stringify(ratings);
  const seenKey = useRef(incomingKey);
  const [entries, setEntries] = useState(ratings);
  const [saved, setSaved] = useState(incomingKey);
  const [search, setSearch] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("roll");
  const [exportOpen, setExportOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [activePupilId, setActivePupilId] = useState<string | null>(null);

  // Office lock only — submitted sheets stay editable on the pupil sheet.
  const locked = phase === "approved";
  const codeById = useMemo(() => new Map(progressCodes.map((row) => [row.id, row])), [progressCodes]);
  const codeByCode = useMemo(() => {
    const map = new Map<string, ProgressCodeRow>();
    for (const row of progressCodes) map.set(row.code.toUpperCase(), row);
    return map;
  }, [progressCodes]);
  const flatSkills = useMemo(
    () =>
      domains.flatMap((domain) =>
        domain.skills.map((skill) => ({
          ...skill,
          domainId: domain.id,
          domainName: domain.name,
        })),
      ),
    [domains],
  );

  useEffect(() => {
    if (incomingKey === seenKey.current) return;
    seenKey.current = incomingKey;
    setEntries(ratings);
    setSaved(incomingKey);
  }, [ratings, incomingKey]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (!exportOpen && !arrangeOpen) return;
    function onPointer(event: MouseEvent) {
      if (exportOpen && !exportRootRef.current?.contains(event.target as Node)) setExportOpen(false);
      if (arrangeOpen && !arrangeRootRef.current?.contains(event.target as Node)) setArrangeOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setExportOpen(false);
        setArrangeOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen, arrangeOpen]);

  useEffect(() => {
    if (!activePupilId) return;
    pupilSheetRef.current?.scrollTo({ top: 0 });
  }, [activePupilId]);

  const dirty = JSON.stringify(entries) !== saved;

  const modeled = useMemo(
    () =>
      pupils.map((pupil) => {
        let filled = 0;
        let gaps = 0;
        for (const skill of flatSkills) {
          if (entries[cellKey(pupil.id, skill.id)]) filled += 1;
          else gaps += 1;
        }
        return { pupil, filled, gaps };
      }),
    [pupils, flatSkills, entries],
  );

  const sequenced = useMemo(() => {
    const rows = [...modeled];
    rows.sort((a, b) => {
      if (sort === "name-asc") return a.pupil.name.localeCompare(b.pupil.name) || a.pupil.roll - b.pupil.roll;
      if (sort === "name-desc") return b.pupil.name.localeCompare(a.pupil.name) || a.pupil.roll - b.pupil.roll;
      if (sort === "gaps") return b.gaps - a.gaps || a.pupil.roll - b.pupil.roll;
      if (sort === "complete") return b.filled - a.filled || a.pupil.roll - b.pupil.roll;
      return a.pupil.roll - b.pupil.roll || a.pupil.name.localeCompare(b.pupil.name);
    });
    return rows;
  }, [modeled, sort]);

  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const lines = sequenced.map((row, index) => {
    const hay = `${row.pupil.name} ${row.pupil.number}`.toLowerCase();
    const matchSearch = !words.length || words.every((word) => hay.includes(word));
    const matchGaps = !gapsOnly || row.gaps > 0;
    return { ...row, no: index + 1, show: matchSearch && matchGaps };
  });
  const visibleLines = lines.filter((row) => row.show);
  const entered = modeled.reduce((sum, row) => sum + row.filled, 0);
  const places = pupils.length * flatSkills.length;
  const gapCount = places - entered;
  const sortLabel = SORT_CHOICES.find((row) => row.id === sort)?.label || "Arrange";
  const missingScale = progressCodes.length === 0 && flatSkills.some((skill) => skill.value_kind !== "number");

  const activeIndex = activePupilId ? sequenced.findIndex((row) => row.pupil.id === activePupilId) : -1;
  const activeRow = activeIndex >= 0 ? sequenced[activeIndex] : null;
  const visibleActiveIndex = activePupilId ? visibleLines.findIndex((row) => row.pupil.id === activePupilId) : -1;

  function setCell(pupilId: string, skillId: string, value: string) {
    setEntries((current) => ({ ...current, [cellKey(pupilId, skillId)]: value }));
  }

  function resolveCodeId(raw: string): string {
    if (!raw) return "";
    if (codeById.has(raw)) return raw;
    const byCode = codeByCode.get(raw.toUpperCase());
    if (byCode) return byCode.id;
    return raw;
  }

  function displayValue(skill: { id: string; value_kind?: SkillValueKind }, raw: string) {
    if (!raw) return "—";
    if (skill.value_kind === "number") return raw;
    const hit = codeById.get(raw);
    if (hit) return hit.code;
    const byCode = codeByCode.get(raw.toUpperCase());
    if (byCode) return byCode.code;
    // Orphan short tokens (not UUIDs) can still print as the typed code.
    if (SHORT_CODE.test(raw) && !/^[0-9a-f]{8}-/i.test(raw)) return raw.toUpperCase();
    return "—";
  }

  function toggleCode(pupilId: string, skillId: string, codeId: string) {
    if (locked || exporting) return;
    const key = cellKey(pupilId, skillId);
    const current = resolveCodeId(entries[key] || "");
    setCell(pupilId, skillId, current === codeId ? "" : codeId);
  }

  async function close() {
    if (
      dirty &&
      !(await askConfirm({
        title: "Unsaved changes",
        message: "Leave without saving these codes?",
        tone: "warn",
        confirmLabel: "Leave",
        cancelLabel: "Keep editing",
      }))
    ) {
      return;
    }
    router.push(closeHref);
  }

  function backToClass() {
    setActivePupilId(null);
  }

  function openPupil(id: string) {
    setActivePupilId(id);
    setExportOpen(false);
    setArrangeOpen(false);
  }

  function stepPupil(delta: number) {
    if (!visibleLines.length) return;
    const from = visibleActiveIndex >= 0 ? visibleActiveIndex : 0;
    const next = Math.min(visibleLines.length - 1, Math.max(0, from + delta));
    setActivePupilId(visibleLines[next].pupil.id);
  }

  async function persistRatings(formData: FormData) {
    // Normalise any short-code leftovers to UUIDs before upsert.
    for (const [key, value] of [...formData.entries()]) {
      if (!key.startsWith("rating:")) continue;
      const raw = String(value || "").trim();
      if (!raw) continue;
      const resolved = resolveCodeId(raw);
      if (resolved !== raw) formData.set(key, resolved);
    }
    const outcome = await saveSkillRatings(formData);
    if (outcome.ok) {
      setSaved(JSON.stringify(entries));
      setExportError("");
      router.refresh();
    }
    return outcome;
  }

  async function persistIfDirty() {
    if (!dirty || locked) return true;
    const data = new FormData();
    data.set("assessment_id", assessmentId);
    for (const pupil of pupils) {
      for (const skill of flatSkills) {
        data.set(`rating:${pupil.id}|${skill.id}`, resolveCodeId(entries[cellKey(pupil.id, skill.id)] || "") || "");
      }
    }
    const outcome = await persistRatings(data);
    if (outcome.error) {
      setExportError(outcome.error);
      return false;
    }
    return true;
  }

  async function download(format: ExportFormat) {
    if (!exportHref) return;
    setExportOpen(false);
    setExportError("");
    setExporting(true);
    const fail = format === "pdf" ? "The PDF could not be prepared." : "The Excel file could not be prepared.";
    try {
      const ok = await persistIfDirty();
      if (!ok) return;
      const url = new URL(exportHref, window.location.origin);
      url.searchParams.set("format", format);
      url.searchParams.set("sort", sort);
      const response = await fetch(url.toString());
      if (!response.ok) {
        setExportError((await response.text()) || fail);
        return;
      }
      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
        `${heading.sittingName}.${format === "pdf" ? "pdf" : "xlsx"}`,
      );
      const outcome = await saveClientDownload(blob, filename);
      if (outcome === "canceled") return;
    } catch {
      setExportError(fail);
    } finally {
      setExporting(false);
    }
  }

  const activeFilled = activeRow?.filled ?? 0;
  const activeGaps = activeRow?.gaps ?? 0;
  const activeTotal = flatSkills.length || 1;
  const activePct = Math.round((activeFilled / activeTotal) * 100);

  return (
    <dialog
      ref={dialogRef}
      className={`msh-screen msh-dsba${activePupilId ? " is-pupil" : ""}`}
      aria-labelledby="msh-dsba-title"
      onCancel={(event) => {
        event.preventDefault();
        if (activePupilId) {
          backToClass();
          return;
        }
        close();
      }}
    >
      <header className="msh-bar">
        <div className="msh-bar-copy">
          <p>Developmental assessment</p>
          <h1 id="msh-dsba-title">{heading.classLabel}</h1>
          <p>
            {heading.sittingName} · {heading.kindLabel} · {heading.heldLabel} · {heading.termLabel}
          </p>
        </div>
        <dl className="msh-bar-stats">
          <div>
            <dt>On roll</dt>
            <dd>{nf(pupils.length)}</dd>
          </div>
          <div>
            <dt>Entered</dt>
            <dd>
              {nf(entered)}
              <small> / {nf(places)}</small>
            </dd>
          </div>
          <div>
            <dt>Gaps</dt>
            <dd>{nf(gapCount)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{phase === "approved" ? "Locked" : phase === "submitted" ? "Submitted" : "Open"}</dd>
          </div>
        </dl>
        <button type="button" className="msh-close" onClick={close}>
          <i className="fa-solid fa-xmark" aria-hidden="true" /> Close
        </button>
      </header>

      {!activePupilId ? (
        <div className="msh-tools">
          <label className="asm-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="msh-sr">Search this class</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this class"
              aria-label="Search this class"
            />
          </label>
          <div className="asm-statuses" role="group" aria-label="Show pupils">
            <button type="button" className={gapsOnly ? "is-on" : ""} aria-pressed={gapsOnly} onClick={() => setGapsOnly((value) => !value)}>
              Gaps only<em>{nf(gapCount)}</em>
            </button>
          </div>
          <div className={`msh-export${arrangeOpen ? " is-open" : ""}`} ref={arrangeRootRef}>
            <button
              type="button"
              className="msh-export-trigger"
              aria-haspopup="listbox"
              aria-expanded={arrangeOpen}
              aria-controls={arrangeListId}
              onClick={() => setArrangeOpen((open) => !open)}
            >
              <span className="msh-export-ico" aria-hidden="true">
                <i className="fa-solid fa-arrow-down-short-wide" />
              </span>
              <strong>{sortLabel}</strong>
              <i className={`fa-solid fa-chevron-${arrangeOpen ? "up" : "down"}`} aria-hidden="true" />
            </button>
            {arrangeOpen ? (
              <div className="msh-export-menu msh-dsba-filter-menu" id={arrangeListId} aria-label="Arrange pupils">
                <div role="listbox" aria-label="Arrange pupils">
                  {SORT_CHOICES.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      role="option"
                      aria-selected={sort === choice.id}
                      onClick={() => {
                        setSort(choice.id);
                        setArrangeOpen(false);
                      }}
                    >
                      <span className="msh-export-choice-ico" aria-hidden="true">
                        <i className={`fa-solid ${choice.icon}`} />
                      </span>
                      <span>{choice.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {allowExport && exportHref ? (
            <div className={`msh-export${exportOpen ? " is-open" : ""}`} ref={exportRootRef}>
              <button
                ref={exportButtonRef}
                type="button"
                className="msh-export-trigger"
                aria-haspopup="listbox"
                aria-expanded={exportOpen}
                aria-controls={exportListId}
                aria-label="Export"
                disabled={exporting}
                onClick={() => setExportOpen((open) => !open)}
              >
                <span className="msh-export-ico" aria-hidden="true">
                  <i className={`fa-solid ${exporting ? "fa-spinner fa-spin" : "fa-file-export"}`} />
                </span>
                <strong>{exporting ? "Preparing…" : "Export"}</strong>
                <i className={`fa-solid fa-chevron-${exportOpen ? "up" : "down"}`} aria-hidden="true" />
              </button>
              {exportOpen && !exporting ? (
                <div className="msh-export-menu" role="listbox" id={exportListId} aria-label="Export marksheet">
                  <button type="button" role="option" onClick={() => void download("pdf")}>
                    <span className="msh-export-choice-ico" aria-hidden="true">
                      <i className="fa-solid fa-file-pdf" />
                    </span>
                    <span>PDF</span>
                  </button>
                  <button type="button" role="option" onClick={() => void download("xlsx")}>
                    <span className="msh-export-choice-ico" aria-hidden="true">
                      <i className="fa-solid fa-file-excel" />
                    </span>
                    <span>Excel</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <button type="button" className="msh-print" onClick={() => window.print()}>
            <i className="fa-solid fa-print" aria-hidden="true" /> Print
          </button>
        </div>
      ) : null}

      {exportError ? (
        <p className="msh-export-error" role="alert">
          {exportError}
        </p>
      ) : null}
      {missingScale ? (
        <p className="msh-export-error" role="alert">
          No progress codes loaded for this nursery scale. Ask the academics office to check the Progress codes catalogue.
        </p>
      ) : null}

      <DeskForm action={persistRatings} className="msh-form" refresh={false}>
        <input type="hidden" name="assessment_id" value={assessmentId} />
        {pupils.map((pupil) =>
          flatSkills.map((skill) => (
            <input
              key={cellKey(pupil.id, skill.id)}
              type="hidden"
              name={`rating:${pupil.id}|${skill.id}`}
              value={resolveCodeId(entries[cellKey(pupil.id, skill.id)] || "") || ""}
            />
          )),
        )}

        {!activePupilId ? (
          <div className="msh-scroll msh-dsba-roll">
            <ul className="msh-dsba-pupils" aria-label="Class roll">
              {visibleLines.map(({ pupil, no, filled, gaps }) => {
                const pct = flatSkills.length ? Math.round((filled / flatSkills.length) * 100) : 0;
                return (
                  <li key={pupil.id}>
                    <button type="button" className="msh-dsba-pupil" onClick={() => openPupil(pupil.id)}>
                      <StudentFace id={pupil.id} name={pupil.name} photoPath={pupil.photoPath} className="msh-face" />
                      <span className="msh-dsba-pupil-copy">
                        <strong>{pupil.name}</strong>
                        <small>
                          {String(no).padStart(2, "0")}
                          {pupil.number ? ` · ${pupil.number}` : ""}
                          {gaps ? ` · ${nf(gaps)} gaps` : " · complete"}
                        </small>
                      </span>
                      <span className="msh-dsba-pupil-meter" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </span>
                      <span className="msh-dsba-pupil-stat">
                        {nf(filled)}/{nf(flatSkills.length)}
                      </span>
                      <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {!visibleLines.length ? (
              <p className="msh-empty">
                {search.trim() ? "No pupil matches that search." : "Every pupil in this view has values entered."}
              </p>
            ) : null}
            <p className="msh-dsba-hint">Tap a pupil to enter progress codes by domain.</p>
          </div>
        ) : activeRow ? (
          <div className="msh-dsba-sheet" ref={pupilSheetRef}>
            <div className="msh-dsba-sheet-sticky">
              <div className="msh-dsba-sheet-bar">
                <button type="button" className="msh-dsba-back" onClick={backToClass}>
                  <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Class list
                </button>
                <div className="msh-dsba-sheet-who">
                  <StudentFace
                    id={activeRow.pupil.id}
                    name={activeRow.pupil.name}
                    photoPath={activeRow.pupil.photoPath}
                    className="msh-face"
                  />
                  <div>
                    <strong>{activeRow.pupil.name}</strong>
                    <small>
                      {activeRow.pupil.number ? `${activeRow.pupil.number} · ` : ""}
                      {nf(activeFilled)} of {nf(flatSkills.length)} entered
                      {activeGaps ? ` · ${nf(activeGaps)} gaps` : ""}
                    </small>
                  </div>
                </div>
                <div className="msh-dsba-sheet-nav" role="group" aria-label="Move between pupils">
                  <button type="button" className="msh-ghost" disabled={visibleActiveIndex <= 0} onClick={() => stepPupil(-1)}>
                    <i className="fa-solid fa-chevron-left" aria-hidden="true" /> Prev
                  </button>
                  <button
                    type="button"
                    className="msh-ghost"
                    disabled={visibleActiveIndex < 0 || visibleActiveIndex >= visibleLines.length - 1}
                    onClick={() => stepPupil(1)}
                  >
                    Next <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="msh-dsba-progress" aria-hidden="true">
                <span style={{ width: `${activePct}%` }} />
              </div>
              {progressCodes.length ? (
                <div className="msh-dsba-legend" aria-label="Progress code legend">
                  {progressCodes.map((row) => (
                    <span key={row.id} className="msh-dsba-legend-item" data-code={row.code} title={row.label}>
                      <em>{row.code}</em>
                      <span>{row.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="msh-dsba-sheet-body">
              {domains.map((domain, domainIndex) => {
                const domainSkills = domain.skills;
                if (!domainSkills.length) return null;
                let domainFilled = 0;
                for (const skill of domainSkills) {
                  if (entries[cellKey(activeRow.pupil.id, skill.id)]) domainFilled += 1;
                }
                return (
                  <section key={domain.id} className={`msh-dsba-domain is-g${domainIndex % 5}`}>
                    <header>
                      <h2>{domain.name}</h2>
                      <p>
                        {nf(domainFilled)}/{nf(domainSkills.length)}
                      </p>
                    </header>
                    <ul>
                      {domainSkills.map((skill) => {
                        const key = cellKey(activeRow.pupil.id, skill.id);
                        const raw = entries[key] || "";
                        const selected = resolveCodeId(raw);
                        const numeric = skill.value_kind === "number";
                        const shown = displayValue(skill, raw);
                        return (
                          <li key={skill.id} className={selected || (numeric && raw) ? "is-set" : "is-gap"}>
                            <div className="msh-dsba-skill-head">
                              <p>{skill.description}</p>
                              {!numeric && shown !== "—" ? (
                                <span className="msh-dsba-skill-code" data-code={shown} title={codeById.get(selected)?.label || shown}>
                                  {shown}
                                </span>
                              ) : null}
                            </div>
                            {numeric ? (
                              locked ? (
                                <span className="msh-dsba-locked">{raw || "—"}</span>
                              ) : (
                                <input
                                  className="msh-dsba-number"
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  step={1}
                                  disabled={exporting}
                                  value={raw}
                                  aria-label={`${activeRow.pupil.name} · ${skill.description}`}
                                  onChange={(event) => setCell(activeRow.pupil.id, skill.id, event.target.value.replace(/[^\d]/g, ""))}
                                />
                              )
                            ) : locked ? (
                              <span className="msh-dsba-locked">{shown}</span>
                            ) : (
                              <div className="msh-dsba-chips" role="group" aria-label={`${skill.description} progress code`}>
                                {progressCodes.map((row) => {
                                  const on = selected === row.id;
                                  return (
                                    <button
                                      key={row.id}
                                      type="button"
                                      className={`msh-dsba-chip${on ? " is-on" : ""}`}
                                      data-code={row.code}
                                      aria-pressed={on}
                                      title={row.label}
                                      disabled={exporting || missingScale}
                                      onClick={() => toggleCode(activeRow.pupil.id, skill.id, row.id)}
                                    >
                                      {row.code}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Print-only class summary */}
        <div className="msh-dsba-print-sheet" aria-hidden="true">
          <table className="msh-table">
            <caption>{heading.sittingName}</caption>
            <thead>
              <tr>
                <th scope="col">Pupil</th>
                {flatSkills.map((skill) => (
                  <th key={skill.id} scope="col" title={skill.description}>
                    {shortSkill(skill.description, 18)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sequenced.map(({ pupil }) => (
                <tr key={pupil.id}>
                  <th scope="row">{pupil.name}</th>
                  {flatSkills.map((skill) => (
                    <td key={skill.id}>{displayValue(skill, entries[cellKey(pupil.id, skill.id)] || "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="msh-foot">
          <p>
            {locked
              ? "Locked by the office. Values cannot be edited."
              : dirty
                ? "Unsaved changes on this sheet."
                : phase === "submitted"
                  ? activePupilId
                    ? "Submitted — you can still change codes until the office locks this sitting."
                    : "Submitted · open a pupil to review or change codes."
                  : activePupilId
                    ? "Tap a code for each skill. Tap again to clear."
                    : "Open a pupil to enter progress codes by domain."}
          </p>
          <div className="msh-foot-actions">
            {!locked ? (
              <>
                <button className="msh-go" type="submit">
                  Save
                </button>
                <button className="msh-go" type="submit" name="intent" value="submit">
                  Save &amp; submit
                </button>
              </>
            ) : null}
            {office && phase === "submitted" ? (
              <button
                className="msh-go"
                type="button"
                onClick={async () => {
                  const data = new FormData();
                  data.set("assessment_id", assessmentId);
                  const outcome = await approveDevelopmentalAssessment(data);
                  if (outcome.error) setExportError(outcome.error);
                  else router.refresh();
                }}
              >
                Lock assessment
              </button>
            ) : null}
            {office && phase === "approved" ? (
              <button
                className="msh-ghost"
                type="button"
                onClick={async () => {
                  const data = new FormData();
                  data.set("assessment_id", assessmentId);
                  const outcome = await reopenDevelopmentalAssessment(data);
                  if (outcome.error) setExportError(outcome.error);
                  else router.refresh();
                }}
              >
                Reopen
              </button>
            ) : null}
          </div>
        </footer>
      </DeskForm>
    </dialog>
  );
}
