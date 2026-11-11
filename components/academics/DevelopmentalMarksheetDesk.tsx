"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveDevelopmentalAssessment,
  reopenDevelopmentalAssessment,
  saveSkillRatings,
} from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import { StudentFace } from "@/components/StudentFace";
import { filenameFromDisposition, saveClientDownload } from "@/lib/client-download";
import type { ProgressCodeRow } from "@/lib/nursery-dsba";

export type DsbaMshSkill = { id: string; description: string; sort: number };
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
  const gridRef = useRef<HTMLDivElement>(null);
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
  const [domainFilter, setDomainFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("roll");
  const [exportOpen, setExportOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const locked = phase !== "open";
  const codeById = useMemo(() => new Map(progressCodes.map((row) => [row.id, row])), [progressCodes]);
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
  const visibleSkills = useMemo(
    () => (domainFilter === "all" ? flatSkills : flatSkills.filter((skill) => skill.domainId === domainFilter)),
    [flatSkills, domainFilter],
  );
  const domainGroups = useMemo(() => {
    const groups: { id: string; name: string; count: number; palette: number }[] = [];
    for (const skill of visibleSkills) {
      const last = groups[groups.length - 1];
      if (last && last.id === skill.domainId) last.count += 1;
      else groups.push({ id: skill.domainId, name: skill.domainName, count: 1, palette: groups.length % 5 });
    }
    return groups;
  }, [visibleSkills]);
  const skillTone = useMemo(() => {
    const map = new Map<string, number>();
    let offset = 0;
    for (const group of domainGroups) {
      for (let i = 0; i < group.count; i += 1) {
        const skill = visibleSkills[offset + i];
        if (skill) map.set(skill.id, group.palette);
      }
      offset += group.count;
    }
    return map;
  }, [domainGroups, visibleSkills]);

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
  const visibleCount = lines.filter((row) => row.show).length;
  const entered = modeled.reduce((sum, row) => sum + row.filled, 0);
  const places = pupils.length * flatSkills.length;
  const gapCount = places - entered;
  const sortLabel = SORT_CHOICES.find((row) => row.id === sort)?.label || "Arrange";

  function setCode(pupilId: string, skillId: string, codeId: string) {
    setEntries((current) => ({ ...current, [cellKey(pupilId, skillId)]: codeId }));
  }

  function close() {
    if (dirty && !window.confirm("Leave without saving these codes?")) return;
    router.push(closeHref);
  }

  async function persistIfDirty() {
    if (!dirty || locked) return true;
    const data = new FormData();
    data.set("assessment_id", assessmentId);
    for (const pupil of pupils) {
      for (const skill of flatSkills) {
        data.set(`rating:${pupil.id}|${skill.id}`, entries[cellKey(pupil.id, skill.id)] || "");
      }
    }
    const outcome = await saveSkillRatings(data);
    if (outcome.error) {
      setExportError(outcome.error);
      return false;
    }
    setSaved(JSON.stringify(entries));
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
      if (domainFilter !== "all") url.searchParams.set("domain", domainFilter);
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
      if (dirty) router.refresh();
    } catch {
      setExportError(fail);
    } finally {
      setExporting(false);
    }
  }

  function onFieldKeyDown(event: React.KeyboardEvent<HTMLSelectElement>, row: number, col: number) {
    const root = gridRef.current;
    if (!root) return;
    let nextRow = row;
    let nextCol = col;
    if (event.key === "ArrowDown" || event.key === "Enter") nextRow += 1;
    else if (event.key === "ArrowUp") nextRow -= 1;
    else if (event.key === "ArrowRight") nextCol += 1;
    else if (event.key === "ArrowLeft") nextCol -= 1;
    else return;
    event.preventDefault();
    const target = root.querySelector<HTMLSelectElement>(`select.msh-field[data-row="${nextRow}"][data-col="${nextCol}"]`);
    target?.focus();
  }

  const columns = 1 + visibleSkills.length;

  return (
    <dialog
      ref={dialogRef}
      className="msh-screen msh-dsba"
      aria-labelledby="msh-dsba-title"
      onCancel={(event) => {
        event.preventDefault();
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
            <dt>Codes in</dt>
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
            <strong>
              {sortLabel}
              {domainFilter !== "all" ? ` · ${shortSkill(domains.find((row) => row.id === domainFilter)?.name || "Domain", 14)}` : ""}
            </strong>
            <i className={`fa-solid fa-chevron-${arrangeOpen ? "up" : "down"}`} aria-hidden="true" />
          </button>
          {arrangeOpen ? (
            <div className="msh-export-menu msh-dsba-filter-menu" id={arrangeListId} aria-label="Arrange and filter">
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
              <div className="msh-export-menu-sep" role="presentation" />
              <p className="msh-export-menu-label">Domains</p>
              <div role="listbox" aria-label="Domains">
                <button
                  type="button"
                  role="option"
                  aria-selected={domainFilter === "all"}
                  onClick={() => {
                    setDomainFilter("all");
                    setArrangeOpen(false);
                  }}
                >
                  <span className="msh-export-choice-ico" aria-hidden="true">
                    <i className="fa-solid fa-border-all" />
                  </span>
                  <span>All domains</span>
                </button>
                {domains.map((domain) => (
                  <button
                    key={domain.id}
                    type="button"
                    role="option"
                    aria-selected={domainFilter === domain.id}
                    title={domain.name}
                    onClick={() => {
                      setDomainFilter(domain.id);
                      setArrangeOpen(false);
                    }}
                  >
                    <span className="msh-export-choice-ico" aria-hidden="true">
                      <i className="fa-solid fa-layer-group" />
                    </span>
                    <span>{domain.name}</span>
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
      {exportError ? (
        <p className="msh-export-error" role="alert">
          {exportError}
        </p>
      ) : null}

      <DeskForm action={saveSkillRatings} className="msh-form" refresh={false}>
        <input type="hidden" name="assessment_id" value={assessmentId} />
        {pupils.map((pupil) =>
          flatSkills.map((skill) => (
            <input
              key={cellKey(pupil.id, skill.id)}
              type="hidden"
              name={`rating:${pupil.id}|${skill.id}`}
              value={entries[cellKey(pupil.id, skill.id)] || ""}
            />
          )),
        )}

        <div className="msh-scroll" ref={gridRef}>
          <table className="msh-table">
            <caption className="msh-sr">{heading.sittingName}</caption>
            <thead>
              {domainGroups.length > 1 || (domainGroups.length === 1 && domainFilter === "all") ? (
                <tr className="msh-group-row">
                  <th className="msh-pupil" scope="col" />
                  {domainGroups.map((group) => (
                    <th key={group.id} className={`msh-group is-g${group.palette}`} scope="colgroup" colSpan={group.count}>
                      {group.name}
                    </th>
                  ))}
                </tr>
              ) : null}
              <tr className="msh-subject-row">
                <th className="msh-pupil" scope="col">
                  Pupil
                </th>
                {visibleSkills.map((skill) => {
                  const tone = skillTone.get(skill.id);
                  return (
                    <th
                      key={skill.id}
                      className={`msh-col msh-dsba-skill${tone === undefined ? "" : ` is-g${tone}`}`}
                      scope="col"
                      title={skill.description}
                    >
                      <span>{shortSkill(skill.description, 22)}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lines.map(({ pupil, no, show, gaps }, lineSlot) => (
                <tr key={pupil.id} hidden={!show}>
                  <th className="msh-pupil" scope="row">
                    <span className="msh-who">
                      <StudentFace id={pupil.id} name={pupil.name} photoPath={pupil.photoPath} className="msh-face" />
                      <span>
                        <strong>{pupil.name}</strong>
                        <small>
                          {String(no).padStart(2, "0")}
                          {pupil.number ? ` · ${pupil.number}` : ""}
                          {gaps ? ` · ${nf(gaps)} gaps` : ""}
                        </small>
                      </span>
                    </span>
                  </th>
                  {visibleSkills.map((skill, col) => {
                    const key = cellKey(pupil.id, skill.id);
                    const value = entries[key] || "";
                    const code = value ? codeById.get(value) : null;
                    const tone = skillTone.get(skill.id);
                    const groupClass = tone === undefined ? "" : ` is-g${tone}`;
                    if (locked) {
                      return (
                        <td key={skill.id} className={`msh-mark${value ? "" : " is-blank"}${groupClass}`}>
                          <span className="msh-dsba-print">{code?.code || "—"}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={skill.id} className={`msh-mark${value ? "" : " is-blank"}${groupClass}`} data-print={code?.code || "—"}>
                        <select
                          className="msh-field"
                          data-row={lineSlot}
                          data-col={col}
                          disabled={exporting}
                          value={value}
                          aria-label={`${pupil.name} · ${skill.description}`}
                          onChange={(event) => setCode(pupil.id, skill.id, event.target.value)}
                          onKeyDown={(event) => onFieldKeyDown(event, lineSlot, col)}
                        >
                          <option value="">—</option>
                          {progressCodes.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.code}
                            </option>
                          ))}
                        </select>
                        <span className="msh-dsba-print" aria-hidden="true">
                          {code?.code || "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {visibleCount ? null : (
                <tr>
                  <td className="msh-empty" colSpan={columns}>
                    {search.trim() ? "No pupil matches that search." : "Every pupil in this view has codes entered."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="msh-foot">
          <p>
            {locked
              ? phase === "approved"
                ? "Locked by the office. Codes cannot be edited."
                : "Submitted · waiting for the office to lock."
              : dirty
                ? "Unsaved changes on this sheet."
                : "Progress codes save for every domain, including filters you are not viewing."}
            {" "}
            Legend: {progressCodes.map((row) => `${row.code} = ${row.label}`).join(" · ")}
          </p>
          <div className="msh-foot-actions">
            {!locked ? (
              <>
                <button className="msh-go" type="submit">
                  Save codes
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
            {office && locked ? (
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
