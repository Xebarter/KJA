"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveDevelopmentalDomain, saveDevelopmentalSkill } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import {
  NURSERY_DIVISION_IDS,
  NURSERY_DIVISIONS,
  type DevelopmentalDomainRow,
  type DevelopmentalSkillRow,
  type NurseryDivisionId,
  type SkillValueKind,
} from "@/lib/nursery-dsba";

type SaveDomain = typeof saveDevelopmentalDomain;
type SaveSkill = typeof saveDevelopmentalSkill;

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

function sectionMeta(id: NurseryDivisionId) {
  return NURSERY_DIVISIONS.find((row) => row.id === id)!;
}

export function DomainsDesk({
  domains,
  skills,
  saveDomain,
  saveSkill,
}: {
  domains: DevelopmentalDomainRow[];
  skills: DevelopmentalSkillRow[];
  saveDomain: SaveDomain;
  saveSkill: SaveSkill;
}) {
  const editorRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<NurseryDivisionId>("rc_c2");
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState(domains);
  const [skillRows, setSkillRows] = useState(skills);

  useEffect(() => setRows(domains), [domains]);
  useEffect(() => setSkillRows(skills), [skills]);

  const current = rows.find((row) => row.id === selected) ?? null;
  const sectionSkills = useMemo(
    () =>
      skillRows
        .filter((skill) => skill.divisions.includes(section))
        .sort((a, b) => a.sort_order - b.sort_order || a.description.localeCompare(b.description)),
    [skillRows, section],
  );
  const domainSkills = sectionSkills.filter((skill) => skill.domain_id === current?.id);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((domain) => {
      if (onlyHidden && domain.active) return false;
      if (!words.length) return true;
      const hay = `${domain.code} ${domain.name}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [rows, query, onlyHidden]);

  function pick(id: string | null) {
    setSelected(id);
    if (window.matchMedia("(max-width: 960px)").matches) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function commitDomain(data: FormData) {
    for (const id of NURSERY_DIVISION_IDS) data.append("division", id);
    const outcome = await saveDomain(data);
    if (outcome.removedDomainId) {
      setRows((currentRows) => currentRows.filter((row) => row.id !== outcome.removedDomainId));
      setSkillRows((currentSkills) => currentSkills.filter((skill) => skill.domain_id !== outcome.removedDomainId));
      setSelected(null);
    } else if (outcome.domain) {
      const saved = outcome.domain;
      setRows((currentRows) => {
        const next = currentRows.filter((row) => row.id !== saved.id);
        next.push(saved);
        next.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
        return next;
      });
      if (!data.get("id")) setSelected(saved.id);
    }
    return outcome;
  }

  async function commitSkill(data: FormData) {
    const outcome = await saveSkill(data);
    if (outcome.removedSkillId) {
      setSkillRows((currentSkills) => currentSkills.filter((skill) => skill.id !== outcome.removedSkillId));
    } else if (outcome.skill) {
      const saved = outcome.skill;
      setSkillRows((currentSkills) => {
        const next = currentSkills.filter((skill) => skill.id !== saved.id);
        next.push(saved);
        return next;
      });
    }
    return outcome;
  }

  const active = rows.filter((row) => row.active).length;
  const hidden = rows.length - active;
  const sectionLabel = sectionMeta(section);

  return (
    <>
      <section className="asb-strip" aria-label="Domain snapshot">
        <div>
          <span className="asb-strip-icon" aria-hidden="true">
            <i className="fa-solid fa-seedling" />
          </span>
          <div>
            <span>Shared domains</span>
            <strong>{nf(active)}</strong>
            <small>{hidden ? `${nf(hidden)} hidden` : "All sections"}</small>
          </div>
        </div>
        {NURSERY_DIVISIONS.map((entry) => {
          const count = skillRows.filter((skill) => skill.active && skill.divisions.includes(entry.id)).length;
          return (
            <div key={entry.id}>
              <span className="asb-strip-icon" aria-hidden="true">
                <i className="fa-solid fa-children" />
              </span>
              <div>
                <span>{entry.short}</span>
                <strong>{nf(count)}</strong>
                <small>{count === 1 ? "skill" : "skills"}</small>
              </div>
            </div>
          );
        })}
      </section>

      <div className="asb-layout">
        <section className="asb-panel asb-desk" aria-label="Domains">
          <div className="asb-panel-head">
            <div>
              <h2>Skills by section</h2>
              <p>
                Domains are shared across nursery. Choose a section, open a domain, then add or edit the skills for that
                stage.
              </p>
            </div>
            <button type="button" className={`asb-add${current ? "" : " is-on"}`} onClick={() => pick(null)}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Add domain
            </button>
          </div>

          <div className="asb-finder">
            <label className="asb-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="sr-only">Search domains</span>
              <input
                type="search"
                value={query}
                placeholder="Search by name or code"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="asb-filters">
              <div className="asb-chips" role="group" aria-label="Nursery section">
                {NURSERY_DIVISIONS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={section === entry.id}
                    className={section === entry.id ? "is-on" : ""}
                    onClick={() => setSection(entry.id)}
                  >
                    {entry.short}
                  </button>
                ))}
                {hidden ? (
                  <button type="button" aria-pressed={onlyHidden} className={onlyHidden ? "is-on" : ""} onClick={() => setOnlyHidden((value) => !value)}>
                    Hidden
                  </button>
                ) : null}
              </div>
              <p className="asb-count-line">
                {sectionLabel.short} · {nf(visible.length)} domain{visible.length === 1 ? "" : "s"} · {nf(sectionSkills.length)}{" "}
                skill{sectionSkills.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {visible.length ? (
            <ul className="asb-list">
              {visible.map((domain, index) => {
                const on = domain.id === selected;
                const count = sectionSkills.filter((skill) => skill.domain_id === domain.id && skill.active).length;
                return (
                  <li key={domain.id}>
                    <button
                      type="button"
                      className={`asb-row${on ? " is-on" : ""}${domain.active ? "" : " is-hidden"}`}
                      data-tone={String(index % 8)}
                      aria-pressed={on}
                      onClick={() => pick(domain.id)}
                    >
                      <span className="asb-row-icon" aria-hidden="true">
                        <i className="fa-solid fa-puzzle-piece" />
                      </span>
                      <span className="asb-who">
                        <strong>{domain.name}</strong>
                        <small>
                          {domain.code}
                          {` · ${sectionLabel.short}`}
                          {` · ${count} skill${count === 1 ? "" : "s"}`}
                          {domain.active ? "" : " · Hidden"}
                        </small>
                      </span>
                      <span className={`asb-badge${domain.active ? "" : " is-locked"}`}>{domain.active ? "Active" : "Hidden"}</span>
                      <span className="asb-go">
                        Open <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="asb-empty">
              <span>
                <i className="fa-solid fa-seedling" aria-hidden="true" />
              </span>
              <h2>{rows.length ? "Nothing matches" : "No domains yet"}</h2>
              <p>{rows.length ? "Try another search." : "Add the first developmental domain."}</p>
            </div>
          )}
        </section>

        <aside
          className="asb-panel asb-editor asb-domain-workspace"
          ref={editorRef}
          aria-label={current ? `Edit ${current.name}` : "Add a domain"}
        >
          {current ? (
            <DomainWorkspace
              key={`${current.id}-${section}`}
              domain={current}
              section={section}
              skills={domainSkills}
              saveDomain={commitDomain}
              saveSkill={commitSkill}
            />
          ) : (
            <DomainCreateForm key="new" save={commitDomain} />
          )}
        </aside>
      </div>
    </>
  );
}

function DomainCreateForm({ save }: { save: (data: FormData) => Promise<{ error?: string; ok?: string }> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("50");

  return (
    <DeskForm action={save} className="asb-form is-new asb-domain-card" refresh={false}>
      <header className="asb-sheet asb-domain-hero">
        <div className="asb-sheet-id">
          <span className={`asb-code${code ? "" : " is-new"}`} aria-hidden="true">
            {code || <i className="fa-solid fa-plus" />}
          </span>
          <div>
            <p>New domain</p>
            <h2>{name.trim() || "Untitled domain"}</h2>
          </div>
        </div>
        <p className="asb-sheet-note">Shared by every nursery section. After saving, add skills for each stage here.</p>
      </header>

      <div className="asb-sheet-body">
        <div className="asb-block">
          <div className={`asb-identity`}>
            <label className="ofc-field asb-code-field">
              <span>Code</span>
              <input
                name="code"
                required
                minLength={2}
                maxLength={20}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              />
            </label>
            <label className="ofc-field asb-name-field">
              <span>Name</span>
              <input name="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          </div>
          <div className="asb-pair" style={{ marginTop: "0.75rem" }}>
            <label className="ofc-field">
              <span>Sort order</span>
              <input name="sort_order" type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
            </label>
            <div className="asb-visible-head" style={{ alignSelf: "end" }}>
              <p>On lists</p>
              <div className="asb-seg is-two is-compact" role="radiogroup">
                <label className={active ? "is-on" : ""}>
                  <input type="radio" name="active" value="1" checked={active} onChange={() => setActive(true)} />
                  Shown
                </label>
                <label className={!active ? "is-on" : ""}>
                  <input type="radio" name="active" value="0" checked={!active} onChange={() => setActive(false)} />
                  Hidden
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="asb-sheet-foot">
        <p className="asb-foot-hint">Applies to RC · C2, C3, and C4.</p>
        <button className="admin-btn" type="submit" disabled={code.trim().length < 2 || name.trim().length < 2}>
          Create domain
        </button>
      </footer>
    </DeskForm>
  );
}

function DomainWorkspace({
  domain,
  section,
  skills,
  saveDomain,
  saveSkill,
}: {
  domain: DevelopmentalDomainRow;
  section: NurseryDivisionId;
  skills: DevelopmentalSkillRow[];
  saveDomain: (data: FormData) => Promise<{ error?: string; ok?: string }>;
  saveSkill: (data: FormData) => Promise<{ error?: string; ok?: string }>;
}) {
  const [name, setName] = useState(domain.name);
  const [active, setActive] = useState(domain.active);
  const [sortOrder, setSortOrder] = useState(String(domain.sort_order));
  const [confirming, setConfirming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const editing = skills.find((skill) => skill.id === editingId) ?? null;
  const sectionLabel = sectionMeta(section);
  const dialogOpen = dialogMode !== null && (dialogMode === "add" || Boolean(editing));

  useEffect(() => {
    setName(domain.name);
    setActive(domain.active);
    setSortOrder(String(domain.sort_order));
    setConfirming(false);
    setSettingsOpen(false);
  }, [domain.id, domain.name, domain.active, domain.sort_order]);

  useEffect(() => {
    setDialogMode(null);
    setEditingId(null);
    setRemovingId(null);
    setRemoveError("");
  }, [section, domain.id]);

  function openAdd() {
    setRemovingId(null);
    setEditingId(null);
    setDialogMode("add");
  }

  function openEdit(id: string) {
    setRemovingId(null);
    setEditingId(id);
    setDialogMode("edit");
  }

  function closeDialog() {
    setDialogMode(null);
    setEditingId(null);
  }

  async function removeFromSection(skill: DevelopmentalSkillRow) {
    setRemoveBusy(true);
    setRemoveError("");
    const data = new FormData();
    data.set("id", skill.id);
    const remaining = skill.divisions.filter((id) => id !== section);
    if (!remaining.length) {
      data.set("intent", "delete");
    } else {
      data.set("domain_id", skill.domain_id);
      data.set("description", skill.description);
      data.set("sort_order", String(skill.sort_order));
      data.set("active", skill.active ? "1" : "0");
      data.set("value_kind", skill.value_kind);
      for (const id of remaining) data.append("division", id);
    }
    const outcome = await saveSkill(data);
    setRemoveBusy(false);
    if (outcome.error) {
      setRemoveError(outcome.error);
      return;
    }
    setRemovingId(null);
  }

  return (
    <div className="asb-domain-card">
      <header className="asb-sheet asb-domain-hero">
        <div className="asb-sheet-id">
          <span className="asb-code" aria-hidden="true">
            {domain.code}
          </span>
          <div>
            <p>Domain · shared</p>
            <h2>{name.trim() || domain.name}</h2>
          </div>
        </div>
        <div className="asb-domain-hero-meta">
          <span className="asb-chip">{sectionLabel.short}</span>
          <span className="asb-chip">
            {skills.length} skill{skills.length === 1 ? "" : "s"}
          </span>
          <span className={`asb-chip${active ? "" : " is-muted"}`}>{active ? "Shown" : "Hidden"}</span>
          <button
            type="button"
            className={`asb-settings-toggle${settingsOpen ? " is-on" : ""}`}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <i className="fa-solid fa-sliders" aria-hidden="true" />
            {settingsOpen ? "Hide settings" : "Domain settings"}
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <DeskForm
          action={async (data) => {
            const outcome = await saveDomain(data);
            if (outcome.ok && data.get("intent") !== "delete") setConfirming(false);
            return outcome;
          }}
          className="asb-form asb-domain-settings"
          refresh={false}
        >
          <input type="hidden" name="id" value={domain.id} />
          <div className="asb-sheet-body">
            <div className="asb-block">
              <label className="ofc-field">
                <span>Name</span>
                <input name="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <div className="asb-pair" style={{ marginTop: "0.75rem" }}>
                <label className="ofc-field">
                  <span>Sort order</span>
                  <input name="sort_order" type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
                </label>
                <div className="asb-visible-head" style={{ alignSelf: "end" }}>
                  <p>On lists</p>
                  <div className="asb-seg is-two is-compact" role="radiogroup">
                    <label className={active ? "is-on" : ""}>
                      <input type="radio" name="active" value="1" checked={active} onChange={() => setActive(true)} />
                      Shown
                    </label>
                    <label className={!active ? "is-on" : ""}>
                      <input type="radio" name="active" value="0" checked={!active} onChange={() => setActive(false)} />
                      Hidden
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <footer className="asb-sheet-foot">
            {confirming ? (
              <div className="asb-delete" role="group">
                <p>Delete {domain.name}? Skills under it are removed too.</p>
                <button type="button" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button type="submit" formNoValidate name="intent" value="delete">
                  Delete
                </button>
              </div>
            ) : (
              <button type="button" className="asb-delete-start" onClick={() => setConfirming(true)}>
                Delete domain
              </button>
            )}
            <button className="admin-btn" type="submit" disabled={name.trim().length < 2}>
              Save domain
            </button>
          </footer>
        </DeskForm>
      ) : null}

      <section className="asb-skills-panel" aria-label={`${sectionLabel.short} skills`}>
        <div className="asb-skills-toolbar">
          <div>
            <p className="asb-skills-kicker">{sectionLabel.short}</p>
            <h3>Skills under {domain.name}</h3>
          </div>
          <button type="button" className="asb-add-skill" onClick={openAdd}>
            <i className="fa-solid fa-plus" aria-hidden="true" />
            Add skill
          </button>
        </div>

        {removeError ? (
          <p className="acd-feedback is-error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {removeError}
          </p>
        ) : null}

        {skills.length ? (
          <ul className="asb-skill-list">
            {skills.map((skill) => {
              const on = dialogMode === "edit" && editingId === skill.id;
              const confirming = removingId === skill.id;
              return (
                <li key={skill.id}>
                  <div className={`asb-skill-item${on ? " is-on" : ""}${skill.active ? "" : " is-hidden"}${confirming ? " is-confirm" : ""}`}>
                    <button type="button" className="asb-skill-main" onClick={() => openEdit(skill.id)}>
                      <span className={`asb-skill-kind${skill.value_kind === "number" ? " is-number" : ""}`} aria-hidden="true">
                        <i className={`fa-solid ${skill.value_kind === "number" ? "fa-hashtag" : "fa-a"}`} />
                      </span>
                      <span className="asb-skill-copy">
                        <strong>{skill.description}</strong>
                        <small>
                          {skill.value_kind === "number" ? "Number" : "Progress code"}
                          {" · "}
                          {skill.divisions.map((id) => NURSERY_DIVISIONS.find((row) => row.id === id)?.short || id).join(" · ")}
                          {skill.active ? "" : " · Hidden"}
                        </small>
                      </span>
                    </button>
                    {confirming ? (
                      <div className="asb-skill-confirm" role="group" aria-label="Confirm remove">
                        <span>Remove from {sectionLabel.short}?</span>
                        <button type="button" disabled={removeBusy} onClick={() => setRemovingId(null)}>
                          Keep
                        </button>
                        <button type="button" className="is-danger" disabled={removeBusy} onClick={() => removeFromSection(skill)}>
                          {removeBusy ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    ) : (
                      <div className="asb-skill-actions">
                        <button type="button" className="asb-skill-icon" title="Edit skill" aria-label={`Edit ${skill.description}`} onClick={() => openEdit(skill.id)}>
                          <i className="fa-solid fa-pen" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="asb-skill-icon is-danger"
                          title={`Remove from ${sectionLabel.short}`}
                          aria-label={`Remove ${skill.description} from ${sectionLabel.short}`}
                          onClick={() => {
                            setRemoveError("");
                            setRemovingId(skill.id);
                          }}
                        >
                          <i className="fa-regular fa-trash-can" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="asb-skills-empty">
            <span aria-hidden="true">
              <i className="fa-solid fa-list-check" />
            </span>
            <h4>No skills for {sectionLabel.short} yet</h4>
            <p>Add the first skill teachers will assess under this domain.</p>
            <button type="button" className="admin-btn" onClick={openAdd}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Add skill
            </button>
          </div>
        )}
      </section>

      {dialogOpen ? (
        <SkillDialog
          key={editing?.id ?? `new-${domain.id}-${section}`}
          domain={domain}
          section={section}
          skill={dialogMode === "edit" ? editing : null}
          save={async (data) => {
            const outcome = await saveSkill(data);
            if (outcome.ok) closeDialog();
            return outcome;
          }}
          onClose={closeDialog}
        />
      ) : null}
    </div>
  );
}

function SkillDialog({
  domain,
  section,
  skill,
  save,
  onClose,
}: {
  domain: DevelopmentalDomainRow;
  section: NurseryDivisionId;
  skill: DevelopmentalSkillRow | null;
  save: (data: FormData) => Promise<{ error?: string; ok?: string }>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [description, setDescription] = useState(skill?.description ?? "");
  // Always start from the section chosen on the domain card; other sections stay off until ticked.
  const [picked, setPicked] = useState<NurseryDivisionId[]>([section]);
  const [valueKind, setValueKind] = useState<SkillValueKind>(skill?.value_kind ?? "progress_code");
  const [active, setActive] = useState(skill ? skill.active : true);
  const [sortOrder, setSortOrder] = useState(String(skill?.sort_order ?? 50));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sectionLabel = sectionMeta(section);
  const titleId = skill ? "asb-skill-edit-title" : "asb-skill-add-title";
  const canSave = picked.length > 0 && description.trim().length >= 2;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const timer = window.setTimeout(() => {
      dialog.querySelector<HTMLTextAreaElement>("textarea[name='description']")?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, []);

  function toggle(id: NurseryDivisionId) {
    setPicked((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }

  return (
    <dialog
      ref={dialogRef}
      className="asb-skill-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <DeskForm action={save} className="asb-form asb-skill-dialog-form" refresh={false}>
        {skill ? <input type="hidden" name="id" value={skill.id} /> : null}
        <input type="hidden" name="domain_id" value={domain.id} />

        <header className="asb-skill-dialog-head">
          <div className="asb-skill-dialog-lead">
            <div className="asb-skill-dialog-badges">
              <span>{domain.code}</span>
              <span>{sectionLabel.short}</span>
              <span>{domain.name}</span>
            </div>
            <h2 id={titleId}>{skill ? "Edit skill" : "Add skill"}</h2>
          </div>
          <button type="button" className="asb-composer-close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="asb-skill-dialog-body">
          <label className="ofc-field asb-skill-desc">
            <span>Skill description</span>
            <textarea
              name="description"
              required
              rows={2}
              maxLength={200}
              placeholder="e.g. Recognises / identifies / writes numbers up to"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <small>{description.trim().length}/200</small>
          </label>

          <div className="asb-skill-field">
            <p>Teacher enters</p>
            <div className="asb-value-cards" role="radiogroup" aria-label="Value type">
              <label className={`asb-value-card${valueKind === "progress_code" ? " is-on" : ""}`}>
                <input
                  type="radio"
                  name="value_kind"
                  value="progress_code"
                  checked={valueKind === "progress_code"}
                  onChange={() => setValueKind("progress_code")}
                />
                <i className="fa-solid fa-a" aria-hidden="true" />
                <strong>Progress code</strong>
                <small>M, S, D and other nursery codes</small>
              </label>
              <label className={`asb-value-card${valueKind === "number" ? " is-on" : ""}`}>
                <input type="radio" name="value_kind" value="number" checked={valueKind === "number"} onChange={() => setValueKind("number")} />
                <i className="fa-solid fa-hashtag" aria-hidden="true" />
                <strong>Number</strong>
                <small>Whole number such as 50</small>
              </label>
            </div>
          </div>

          <div className="asb-skill-field">
            <p>
              Nursery sections
              <em> · {sectionLabel.short} on</em>
            </p>
            <div className="asb-section-picks" role="group" aria-label="Nursery sections">
              {NURSERY_DIVISIONS.map((entry) => {
                const on = picked.includes(entry.id);
                const isCurrent = entry.id === section;
                return (
                  <label
                    key={entry.id}
                    className={`asb-section-pick${on ? " is-on" : ""}${isCurrent ? " is-current" : ""}`}
                  >
                    <input type="checkbox" name="division" value={entry.id} checked={on} onChange={() => toggle(entry.id)} />
                    <span className="asb-section-check" aria-hidden="true">
                      <i className={`fa-solid ${on ? "fa-check" : "fa-plus"}`} />
                    </span>
                    <strong>{entry.short}</strong>
                    <small>{entry.label}</small>
                    {on ? <b>On</b> : <b className="is-off">Off</b>}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="asb-skill-meta">
            <label className="ofc-field">
              <span>Sort order</span>
              <input name="sort_order" type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
            </label>
            <div className="asb-visible-head">
              <p>On marksheets</p>
              <div className="asb-seg is-two is-compact" role="radiogroup">
                <label className={active ? "is-on" : ""}>
                  <input type="radio" name="active" value="1" checked={active} onChange={() => setActive(true)} />
                  Shown
                </label>
                <label className={!active ? "is-on" : ""}>
                  <input type="radio" name="active" value="0" checked={!active} onChange={() => setActive(false)} />
                  Hidden
                </label>
              </div>
            </div>
          </div>
        </div>

        <footer className="asb-skill-dialog-foot">
          {skill ? (
            confirmDelete ? (
              <div className="asb-delete" role="group">
                <p>Delete this skill?</p>
                <button type="button" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
                <button type="submit" formNoValidate name="intent" value="delete" className="grd-remove">
                  Delete
                </button>
              </div>
            ) : (
              <button type="button" className="asb-dialog-ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )
          ) : (
            <span className="asb-skill-hint">Esc to close</span>
          )}
          <div className="asb-skill-dialog-actions">
            <button type="button" className="asb-dialog-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="admin-btn" type="submit" disabled={!canSave}>
              {skill ? "Save" : "Add skill"}
            </button>
          </div>
        </footer>
      </DeskForm>
    </dialog>
  );
}
