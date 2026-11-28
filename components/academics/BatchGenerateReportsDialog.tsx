"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prepareBatchReport } from "@/app/academics_office/(desk)/actions";
import { classLabel, type ClassGroup } from "@/lib/academics";
import { reportSittingKey, type ReportSitting } from "@/lib/academics-reports";
import type { RollPupil } from "@/lib/academics-roll";
import { DEFAULT_REPORT_TITLE } from "@/lib/report-title";

const nf = (value: number) => value.toLocaleString("en-GB");

function roundShare(value: number) {
  return Math.round(value * 10) / 10;
}

type CatalogEntry = {
  sitting: ReportSitting;
  classCount: number;
};

type BatchOutcome = {
  key: string;
  label: string;
  status: "prepared" | "unchanged" | "skipped" | "failed";
  detail: string;
};

function groupKey(group: ClassGroup<RollPupil>) {
  return `${group.campus}|${group.code}|${group.stream}`;
}

function sittingsForGroup(
  group: ClassGroup<RollPupil>,
  sittingsByClass: Record<string, ReportSitting[]>,
): ReportSitting[] {
  return (
    sittingsByClass[reportSittingKey(group.code, group.stream, group.campus)] ||
    sittingsByClass[reportSittingKey(group.code, group.stream)] ||
    []
  );
}

function buildCatalog(
  groups: ClassGroup<RollPupil>[],
  sittingsByClass: Record<string, ReportSitting[]>,
  wantDsba: boolean,
): CatalogEntry[] {
  const map = new Map<string, CatalogEntry>();
  for (const group of groups) {
    const seen = new Set<string>();
    for (const sitting of sittingsForGroup(group, sittingsByClass)) {
      if (Boolean(sitting.dsba) !== wantDsba) continue;
      if (seen.has(sitting.key)) continue;
      seen.add(sitting.key);
      const existing = map.get(sitting.key);
      if (existing) existing.classCount += 1;
      else map.set(sitting.key, { sitting, classCount: 1 });
    }
  }
  return Array.from(map.values());
}

export function BatchGenerateReportsDialog({
  open,
  onClose,
  onComplete,
  termId,
  campus,
  groups,
  sittingsByClass,
  defaultTitle = DEFAULT_REPORT_TITLE,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  termId: string;
  campus: string;
  groups: ClassGroup<RollPupil>[];
  sittingsByClass: Record<string, ReportSitting[]>;
  defaultTitle?: string;
}) {
  const primaryGroups = useMemo(() => groups.filter((group) => group.section === "primary"), [groups]);
  const nurseryGroups = useMemo(() => groups.filter((group) => group.section === "nursery"), [groups]);

  const primaryCatalog = useMemo(
    () => buildCatalog(primaryGroups, sittingsByClass, false),
    [primaryGroups, sittingsByClass],
  );
  const nurseryCatalog = useMemo(
    () => buildCatalog(nurseryGroups, sittingsByClass, true),
    [nurseryGroups, sittingsByClass],
  );

  const [title, setTitle] = useState(defaultTitle || DEFAULT_REPORT_TITLE);
  const [primaryPicked, setPrimaryPicked] = useState<Set<string>>(new Set());
  const [primaryOrder, setPrimaryOrder] = useState<string[]>([]);
  const [primaryShares, setPrimaryShares] = useState<Record<string, string>>({});
  const [nurseryPicked, setNurseryPicked] = useState<string>("");

  const [phase, setPhase] = useState<"config" | "running" | "done">("config");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentLabel, setCurrentLabel] = useState("");
  const [results, setResults] = useState<BatchOutcome[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("config");
    setCurrentIndex(0);
    setCurrentLabel("");
    setResults([]);
    setTitle(defaultTitle || DEFAULT_REPORT_TITLE);
    setPrimaryPicked(new Set(primaryCatalog.map((entry) => entry.sitting.key)));
    setPrimaryOrder(primaryCatalog.map((entry) => entry.sitting.key));
    setPrimaryShares(
      Object.fromEntries(primaryCatalog.map((entry) => [entry.sitting.key, String(entry.sitting.share)])),
    );
    setNurseryPicked(nurseryCatalog[0]?.sitting.key ?? "");
  }, [open, defaultTitle, primaryCatalog, nurseryCatalog]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && phase !== "running") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, phase, onClose]);

  const orderedPrimary = useMemo(() => {
    const positions = new Map(primaryOrder.map((key, index) => [key, index]));
    return [...primaryCatalog].sort(
      (a, b) => (positions.get(a.sitting.key) ?? Infinity) - (positions.get(b.sitting.key) ?? Infinity),
    );
  }, [primaryCatalog, primaryOrder]);

  const chosenPrimary = useMemo(
    () => orderedPrimary.filter((entry) => primaryPicked.has(entry.sitting.key)),
    [orderedPrimary, primaryPicked],
  );

  const primaryShareValues = chosenPrimary.map((entry) => {
    const raw = primaryShares[entry.sitting.key] ?? "";
    return raw.trim() ? Number(raw) : Number.NaN;
  });
  const primaryTotal = roundShare(
    primaryShareValues.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0),
  );
  const primaryValidShares = primaryShareValues.every(
    (value) => Number.isFinite(value) && value >= 0 && value <= 100,
  );

  const needsPrimary = primaryGroups.length > 0 && primaryCatalog.length > 0;
  const needsNursery = nurseryGroups.length > 0 && nurseryCatalog.length > 0;
  const primaryReady = !needsPrimary || (chosenPrimary.length > 0 && primaryValidShares && Math.abs(primaryTotal - 100) <= 0.05);
  const nurseryReady = !needsNursery || Boolean(nurseryPicked);

  const readiness = useMemo(() => {
    let eligible = 0;
    let skipped = 0;
    for (const group of groups) {
      const available = new Set(sittingsForGroup(group, sittingsByClass).map((row) => row.key));
      if (group.section === "nursery") {
        if (nurseryPicked && available.has(nurseryPicked)) eligible += 1;
        else skipped += 1;
      } else {
        if (chosenPrimary.length > 0 && chosenPrimary.every((entry) => available.has(entry.sitting.key))) {
          eligible += 1;
        } else {
          skipped += 1;
        }
      }
    }
    return { eligible, skipped };
  }, [groups, sittingsByClass, nurseryPicked, chosenPrimary]);

  const canSubmit =
    Boolean(title.trim()) &&
    primaryReady &&
    nurseryReady &&
    readiness.eligible > 0;

  function togglePrimary(key: string, on: boolean) {
    setPrimaryPicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    setPrimaryOrder((current) =>
      on ? [...current.filter((item) => item !== key), key] : current.filter((item) => item !== key),
    );
  }

  function toggleAllPrimary(on: boolean) {
    setPrimaryPicked(on ? new Set(primaryCatalog.map((entry) => entry.sitting.key)) : new Set());
    setPrimaryOrder(on ? primaryCatalog.map((entry) => entry.sitting.key) : []);
  }

  function movePrimary(key: string, direction: -1 | 1) {
    setPrimaryOrder((current) => {
      const index = current.indexOf(key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function spreadPrimaryEven() {
    if (!chosenPrimary.length) return;
    const base = Math.floor(1000 / chosenPrimary.length) / 10;
    const next = { ...primaryShares };
    let used = 0;
    chosenPrimary.forEach((entry, index) => {
      const value = index === chosenPrimary.length - 1 ? roundShare(100 - used) : base;
      used = roundShare(used + value);
      next[entry.sitting.key] = String(value);
    });
    setPrimaryShares(next);
  }

  async function runBatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || phase === "running") return;

    setPhase("running");
    setResults([]);
    const cleanTitle = title.trim() || DEFAULT_REPORT_TITLE;
    const collected: BatchOutcome[] = [];

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      const label = classLabel(group.code, group.stream, group.campus);
      const key = groupKey(group);
      setCurrentIndex(index);
      setCurrentLabel(label);

      const availableRows = sittingsForGroup(group, sittingsByClass);
      const availableKeys = new Set(availableRows.map((row) => row.key));

      if (group.section === "nursery") {
        if (!nurseryPicked || !availableKeys.has(nurseryPicked)) {
          const outcome: BatchOutcome = {
            key,
            label,
            status: "skipped",
            detail: nurseryPicked
              ? "Missing the selected locked developmental assessment."
              : "No locked developmental assessment for this class.",
          };
          collected.push(outcome);
          setResults([...collected]);
          continue;
        }
      } else {
        const missing = chosenPrimary.filter((entry) => !availableKeys.has(entry.sitting.key));
        if (!chosenPrimary.length || missing.length) {
          const outcome: BatchOutcome = {
            key,
            label,
            status: "skipped",
            detail: missing.length
              ? `Missing ${missing.map((entry) => entry.sitting.label).join(", ")}.`
              : "No assessments set for this class.",
          };
          collected.push(outcome);
          setResults([...collected]);
          continue;
        }
      }

      const formData = new FormData();
      formData.set("term_id", termId);
      formData.set("class_code", group.code);
      formData.set("stream", group.stream);
      formData.set("campus", group.campus);
      formData.set("report_title", cleanTitle);

      if (group.section === "nursery") {
        formData.append("set", nurseryPicked);
        formData.set(`share:${nurseryPicked}`, "100");
      } else {
        for (const entry of chosenPrimary) {
          formData.append("set", entry.sitting.key);
          formData.set(`share:${entry.sitting.key}`, primaryShares[entry.sitting.key] ?? "0");
        }
      }

      try {
        const response = await prepareBatchReport(formData);
        if (response.error) {
          collected.push({ key, label, status: "failed", detail: response.error });
        } else if (!response.prepared && !response.commented) {
          collected.push({
            key,
            label,
            status: "unchanged",
            detail: "No draft cards updated. Approved and published cards stay as they are.",
          });
        } else {
          const parts = [
            response.prepared ? `${nf(response.prepared)} ${response.prepared === 1 ? "card" : "cards"} prepared` : null,
            response.commented ? `${nf(response.commented)} comments filled` : null,
            response.warning || null,
            response.note || null,
          ].filter(Boolean);
          collected.push({
            key,
            label,
            status: "prepared",
            detail: parts.join(" · "),
          });
        }
      } catch (error) {
        collected.push({
          key,
          label,
          status: "failed",
          detail: error instanceof Error ? error.message : "Reports could not be prepared.",
        });
      }
      setResults([...collected]);
    }

    setPhase("done");
    onComplete();
  }

  if (!open) return null;

  const preparedCount = results.filter((item) => item.status === "prepared" || item.status === "unchanged").length;
  const skippedCount = results.filter((item) => item.status === "skipped").length;
  const failedCount = results.filter((item) => item.status === "failed").length;
  const progressPct = groups.length ? Math.round(((phase === "done" ? groups.length : currentIndex) / groups.length) * 100) : 0;

  return (
    <div
      className="rpt-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && phase !== "running") onClose();
      }}
    >
      <div className="rpt-dialog rpt-batch-dialog" role="dialog" aria-modal="true" aria-labelledby="rpt-batch-title">
        <header>
          <p>{campus} · {nf(groups.length)} {groups.length === 1 ? "class" : "classes"} selected</p>
          <h2 id="rpt-batch-title">
            {phase === "config"
              ? "Generate multiple classes"
              : phase === "running"
                ? "Generating report cards…"
                : "Batch generation finished"}
          </h2>
          <span>
            {phase === "config"
              ? "Set the card title and pick the assessments to include. Classes missing a chosen assessment will be skipped and listed in the summary."
              : phase === "running"
                ? `Working on ${currentLabel} (${currentIndex + 1} of ${groups.length}). Keep this window open until it finishes.`
                : `${nf(preparedCount)} processed · ${nf(skippedCount)} skipped · ${nf(failedCount)} failed.`}
          </span>
        </header>

        {phase === "config" ? (
          <form className="rpt-generate-form" onSubmit={runBatch}>
            <div className="rpt-batch-chips" aria-label="Selected classes">
              {groups.map((group) => (
                <span key={groupKey(group)} className="rpt-batch-chip">
                  {classLabel(group.code, group.stream)}
                </span>
              ))}
            </div>

            <label className="rpt-generate-title">
              <span>Title on the card</span>
              <input
                name="report_title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                required
                placeholder={DEFAULT_REPORT_TITLE}
              />
              <small>Printed under the school heading on every generated card.</small>
            </label>

            {primaryGroups.length > 0 ? (
              <div className="rpt-batch-section">
                <div className="rpt-batch-section-head">
                  <strong>Primary assessments</strong>
                  <span>{nf(primaryGroups.length)} {primaryGroups.length === 1 ? "class" : "classes"}</span>
                </div>
                {primaryCatalog.length > 0 ? (
                  <>
                    <div className="rpt-generate-tools">
                      <label className="rpt-generate-all">
                        <input
                          type="checkbox"
                          checked={primaryPicked.size === primaryCatalog.length}
                          ref={(node) => {
                            if (node) {
                              node.indeterminate = primaryPicked.size > 0 && primaryPicked.size < primaryCatalog.length;
                            }
                          }}
                          onChange={(event) => toggleAllPrimary(event.target.checked)}
                        />
                        <span>All assessments</span>
                      </label>
                      <button
                        type="button"
                        className="rpt-generate-even"
                        onClick={spreadPrimaryEven}
                        disabled={!chosenPrimary.length}
                      >
                        Split evenly
                      </button>
                    </div>
                    <ul className="rpt-generate-list">
                      {orderedPrimary.map(({ sitting, classCount }) => {
                        const on = primaryPicked.has(sitting.key);
                        const chosenIndex = chosenPrimary.findIndex((item) => item.sitting.key === sitting.key);
                        return (
                          <li key={sitting.key} className={on ? "is-on" : ""}>
                            <label className="rpt-generate-pick">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => togglePrimary(sitting.key, !on)}
                              />
                              <span>
                                <strong>{sitting.label}</strong>
                                <small>
                                  {sitting.kindLabel} · in {nf(classCount)} of {nf(primaryGroups.length)}{" "}
                                  {primaryGroups.length === 1 ? "class" : "classes"}
                                </small>
                              </span>
                            </label>
                            <div className="rpt-generate-row-actions">
                              <label className="rpt-generate-share">
                                <span>Share</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.1}
                                  value={primaryShares[sitting.key] ?? ""}
                                  disabled={!on}
                                  onChange={(event) =>
                                    setPrimaryShares((current) => ({ ...current, [sitting.key]: event.target.value }))
                                  }
                                  aria-label={`Share of the total for ${sitting.label}`}
                                />
                                <em>%</em>
                              </label>
                              {on ? (
                                <div className="rpt-generate-order" role="group" aria-label={`Order ${sitting.label}`}>
                                  <button
                                    type="button"
                                    aria-label={`Move ${sitting.label} earlier`}
                                    title={`Move ${sitting.label} earlier`}
                                    disabled={chosenIndex === 0}
                                    onClick={() => movePrimary(sitting.key, -1)}
                                  >
                                    <i className="fa-solid fa-arrow-up" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Move ${sitting.label} later`}
                                    title={`Move ${sitting.label} later`}
                                    disabled={chosenIndex === chosenPrimary.length - 1}
                                    onClick={() => movePrimary(sitting.key, 1)}
                                  >
                                    <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <p className={`rpt-generate-total${primaryReady ? " is-ok" : ""}`}>
                      {chosenPrimary.length ? (
                        <>
                          Primary shares add up to <strong>{primaryTotal}%</strong>
                          {primaryReady ? "" : ". They must total 100%"}.
                        </>
                      ) : (
                        "Choose at least one Primary assessment."
                      )}
                    </p>
                  </>
                ) : (
                  <p className="rpt-generate-total">
                    None of the selected Primary classes have assessments set yet. They will be skipped.
                  </p>
                )}
              </div>
            ) : null}

            {nurseryGroups.length > 0 ? (
              <div className="rpt-batch-section">
                <div className="rpt-batch-section-head">
                  <strong>Nursery developmental sitting</strong>
                  <span>{nf(nurseryGroups.length)} {nurseryGroups.length === 1 ? "class" : "classes"}</span>
                </div>
                {nurseryCatalog.length > 0 ? (
                  <>
                    <ul className="rpt-generate-list">
                      {nurseryCatalog.map(({ sitting, classCount }) => {
                        const on = nurseryPicked === sitting.key;
                        return (
                          <li key={sitting.key} className={on ? "is-on" : ""}>
                            <label className="rpt-generate-pick">
                              <input
                                type="radio"
                                name="nursery_sitting"
                                value={sitting.key}
                                checked={on}
                                onChange={() => setNurseryPicked(sitting.key)}
                              />
                              <span>
                                <strong>{sitting.label}</strong>
                                <small>
                                  {sitting.kindLabel} · locked in {nf(classCount)} of {nf(nurseryGroups.length)}{" "}
                                  {nurseryGroups.length === 1 ? "class" : "classes"}
                                </small>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <p className={`rpt-generate-total${nurseryReady ? " is-ok" : ""}`}>
                      {nurseryPicked ? "One developmental assessment selected." : "Choose one developmental assessment."}
                    </p>
                  </>
                ) : (
                  <p className="rpt-generate-total">
                    None of the selected Nursery classes have a locked developmental assessment yet. They will be skipped.
                  </p>
                )}
              </div>
            ) : null}

            {readiness.skipped > 0 ? (
              <p className="rpt-batch-note">
                <i className="fa-solid fa-circle-info" aria-hidden="true" />{" "}
                {readiness.eligible > 0
                  ? `${nf(readiness.eligible)} ${readiness.eligible === 1 ? "class" : "classes"} ready to generate; ${nf(readiness.skipped)} ${readiness.skipped === 1 ? "class" : "classes"} missing a chosen assessment will be skipped.`
                  : "None of the selected classes match the chosen assessments."}
              </p>
            ) : null}

            <footer>
              <button ref={closeRef} type="button" className="rpt-btn is-ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="rpt-btn" type="submit" disabled={!canSubmit}>
                Generate {nf(readiness.eligible)} {readiness.eligible === 1 ? "class" : "classes"}
              </button>
            </footer>
          </form>
        ) : (
          <div className="rpt-batch-progress">
            <div className="rpt-batch-meter" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progressPct}%` }} />
            </div>

            {results.length > 0 ? (
              <ul className="rpt-batch-results">
                {results.map((item) => (
                  <li key={item.key} className={`is-${item.status}`}>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </div>
                    <em className={`rpt-batch-badge is-${item.status}`}>
                      {item.status === "prepared"
                        ? "Prepared"
                        : item.status === "unchanged"
                          ? "Unchanged"
                          : item.status === "skipped"
                            ? "Skipped"
                            : "Failed"}
                    </em>
                  </li>
                ))}
              </ul>
            ) : null}

            <footer>
              <button
                ref={closeRef}
                type="button"
                className="rpt-btn"
                disabled={phase === "running"}
                onClick={onClose}
              >
                {phase === "running" ? "Generating…" : "Done"}
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
