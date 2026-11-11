"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveDevelopmentalDomain, saveDevelopmentalSkill } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import {
  NURSERY_DIVISIONS,
  type DevelopmentalDomainRow,
  type DevelopmentalSkillRow,
  type NurseryDivisionId,
} from "@/lib/nursery-dsba";

type SaveDomain = typeof saveDevelopmentalDomain;
type SaveSkill = typeof saveDevelopmentalSkill;

function nf(value: number) {
  return value.toLocaleString("en-GB");
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
  const [division, setDivision] = useState<"" | NurseryDivisionId>("");
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState(domains);
  const [skillRows, setSkillRows] = useState(skills);

  useEffect(() => setRows(domains), [domains]);
  useEffect(() => setSkillRows(skills), [skills]);

  const current = rows.find((row) => row.id === selected) ?? null;
  const domainSkills = skillRows
    .filter((skill) => skill.domain_id === current?.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.description.localeCompare(b.description));

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((domain) => {
      if (onlyHidden && domain.active) return false;
      if (division && !domain.divisions.includes(division)) return false;
      if (!words.length) return true;
      const hay = `${domain.code} ${domain.name}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [rows, query, division, onlyHidden]);

  function pick(id: string | null) {
    setSelected(id);
    if (window.matchMedia("(max-width: 960px)").matches) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function commitDomain(data: FormData) {
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

  return (
    <>
      <section className="asb-strip" aria-label="Domain snapshot">
        <div>
          <span className="asb-strip-icon" aria-hidden="true">
            <i className="fa-solid fa-seedling" />
          </span>
          <div>
            <span>Active</span>
            <strong>{nf(active)}</strong>
            <small>{hidden ? `${nf(hidden)} hidden` : "All shown"}</small>
          </div>
        </div>
        {NURSERY_DIVISIONS.map((entry) => (
          <div key={entry.id}>
            <span className="asb-strip-icon" aria-hidden="true">
              <i className="fa-solid fa-children" />
            </span>
            <div>
              <span>{entry.short}</span>
              <strong>{nf(rows.filter((row) => row.active && row.divisions.includes(entry.id)).length)}</strong>
              <small>{entry.label}</small>
            </div>
          </div>
        ))}
      </section>

      <div className="asb-layout">
        <section className="asb-panel asb-desk" aria-label="Domains">
          <div className="asb-panel-head">
            <div>
              <h2>Choose a domain</h2>
              <p>Each learning area carries its own skills for Developmental Skills-Based Assessment.</p>
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
              <div className="asb-chips" role="group" aria-label="Division">
                <button type="button" aria-pressed={!division} className={!division ? "is-on" : ""} onClick={() => setDivision("")}>
                  All
                </button>
                {NURSERY_DIVISIONS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={division === entry.id}
                    className={division === entry.id ? "is-on" : ""}
                    onClick={() => setDivision(entry.id)}
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
                {nf(visible.length)} domain{visible.length === 1 ? "" : "s"} · {nf(skillRows.length)} skills
              </p>
            </div>
          </div>

          {visible.length ? (
            <ul className="asb-list">
              {visible.map((domain, index) => {
                const on = domain.id === selected;
                const count = skillRows.filter((skill) => skill.domain_id === domain.id && skill.active).length;
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
                          {" · "}
                          {domain.divisions.map((id) => NURSERY_DIVISIONS.find((row) => row.id === id)?.short || id).join(" · ")}
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
              <p>{rows.length ? "Try another filter." : "Add the first developmental domain."}</p>
            </div>
          )}
        </section>

        <aside className="asb-panel asb-editor" ref={editorRef} aria-label={current ? `Edit ${current.name}` : "Add a domain"}>
          <DomainForm key={current?.id ?? "new"} domain={current} save={commitDomain} />
          {current ? <SkillList domain={current} skills={domainSkills} save={commitSkill} /> : null}
        </aside>
      </div>
    </>
  );
}

function DomainForm({
  domain,
  save,
}: {
  domain: DevelopmentalDomainRow | null;
  save: (data: FormData) => Promise<{ error?: string; ok?: string }>;
}) {
  const [name, setName] = useState(domain?.name ?? "");
  const [code, setCode] = useState("");
  const [picked, setPicked] = useState<NurseryDivisionId[]>(domain?.divisions?.length ? domain.divisions : ["rc_c2", "c3", "c4"]);
  const [active, setActive] = useState(domain ? domain.active : true);
  const [confirming, setConfirming] = useState(false);
  const [sortOrder, setSortOrder] = useState(String(domain?.sort_order ?? 50));

  function toggle(id: NurseryDivisionId) {
    setPicked((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }

  return (
    <DeskForm
      action={async (data) => {
        const outcome = await save(data);
        if (outcome.ok && data.get("intent") !== "delete") setConfirming(false);
        return outcome;
      }}
      className={`asb-form${domain ? "" : " is-new"}`}
      refresh={false}
    >
      {domain ? <input type="hidden" name="id" value={domain.id} /> : null}
      <header className="asb-sheet">
        <div className="asb-sheet-id">
          <span className={`asb-code${domain || code ? "" : " is-new"}`} aria-hidden="true">
            {domain?.code || code || <i className="fa-solid fa-plus" />}
          </span>
          <div>
            <p>{domain ? "Editing domain" : "Create domain"}</p>
            <h2>{name.trim() || (domain ? "Untitled" : "New domain")}</h2>
          </div>
        </div>
        <p className="asb-sheet-note">Learning area for Developmental Skills-Based Assessment reports.</p>
      </header>

      <div className="asb-sheet-body">
        <div className="asb-block">
          <p className="asb-step">
            <span>1</span> Identity
          </p>
          <div className={`asb-identity${domain ? " is-named" : ""}`}>
            {domain ? null : (
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
            )}
            <label className="ofc-field asb-name-field">
              <span>Name</span>
              <input name="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          </div>
          <label className="ofc-field" style={{ marginTop: "0.75rem" }}>
            <span>Sort order</span>
            <input name="sort_order" type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
          </label>
        </div>

        <div className="asb-block">
          <p className="asb-step">
            <span>2</span> Divisions
          </p>
          <div className="asb-seg is-bands" role="group">
            {NURSERY_DIVISIONS.map((entry) => {
              const on = picked.includes(entry.id);
              return (
                <label key={entry.id} className={on ? "is-on" : ""}>
                  <input type="checkbox" name="division" value={entry.id} checked={on} onChange={() => toggle(entry.id)} />
                  <strong>{entry.short}</strong>
                  <small>{entry.label}</small>
                </label>
              );
            })}
          </div>
        </div>

        <div className="asb-block asb-visible-block">
          <div className="asb-visible-head">
            <p>On class lists</p>
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

      <footer className="asb-sheet-foot">
        {domain ? (
          confirming ? (
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
              Delete
            </button>
          )
        ) : (
          <p className="asb-foot-hint">Ready when the name and divisions are set.</p>
        )}
        <button className="admin-btn" type="submit" disabled={!picked.length || (!domain && code.trim().length < 2) || name.trim().length < 2}>
          {domain ? "Save domain" : "Add domain"}
        </button>
      </footer>
    </DeskForm>
  );
}

function SkillList({
  domain,
  skills,
  save,
}: {
  domain: DevelopmentalDomainRow;
  skills: DevelopmentalSkillRow[];
  save: (data: FormData) => Promise<{ error?: string; ok?: string }>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const current = skills.find((skill) => skill.id === editing) ?? null;

  return (
    <div className="asb-form" style={{ marginTop: "1rem" }}>
      <header className="asb-sheet">
        <div className="asb-sheet-id">
          <span className="asb-code" aria-hidden="true">
            <i className="fa-solid fa-list-check" />
          </span>
          <div>
            <p>Skills under {domain.name}</p>
            <h2>{skills.length} skill{skills.length === 1 ? "" : "s"}</h2>
          </div>
        </div>
      </header>

      <ul className="asb-list" style={{ padding: "0.75rem 1rem" }}>
        {skills.map((skill, index) => (
          <li key={skill.id}>
            <button
              type="button"
              className={`asb-row is-skill${editing === skill.id ? " is-on" : ""}${skill.active ? "" : " is-hidden"}`}
              data-tone={String(index % 8)}
              onClick={() => setEditing(skill.id)}
            >
              <span className="asb-row-icon" aria-hidden="true">
                <i className="fa-solid fa-list-check" />
              </span>
              <span className="asb-who">
                <strong>{skill.description}</strong>
                <small>
                  {skill.divisions.map((id) => NURSERY_DIVISIONS.find((row) => row.id === id)?.short || id).join(" · ")}
                  {skill.active ? "" : " · Hidden"}
                </small>
              </span>
              <span className={`asb-badge${skill.active ? "" : " is-locked"}`}>{skill.active ? "Active" : "Hidden"}</span>
              <span className="asb-go">
                Edit <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <SkillForm
        key={current?.id ?? `new-${domain.id}`}
        domain={domain}
        skill={current}
        save={async (data) => {
          const outcome = await save(data);
          if (outcome.ok && data.get("intent") === "delete") setEditing(null);
          if (outcome.ok && !data.get("id")) setEditing(null);
          return outcome;
        }}
        onCancelEdit={() => setEditing(null)}
      />
    </div>
  );
}

function SkillForm({
  domain,
  skill,
  save,
  onCancelEdit,
}: {
  domain: DevelopmentalDomainRow;
  skill: DevelopmentalSkillRow | null;
  save: (data: FormData) => Promise<{ error?: string; ok?: string }>;
  onCancelEdit: () => void;
}) {
  const [description, setDescription] = useState(skill?.description ?? "");
  const [picked, setPicked] = useState<NurseryDivisionId[]>(skill?.divisions?.length ? skill.divisions : domain.divisions);
  const [active, setActive] = useState(skill ? skill.active : true);
  const [sortOrder, setSortOrder] = useState(String(skill?.sort_order ?? (skill ? skill.sort_order : 50)));

  function toggle(id: NurseryDivisionId) {
    setPicked((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }

  return (
    <DeskForm action={save} className="asb-sheet-body" refresh={false}>
      {skill ? <input type="hidden" name="id" value={skill.id} /> : null}
      <input type="hidden" name="domain_id" value={domain.id} />
      <div className="asb-block">
        <p className="asb-step">
          <span>{skill ? "Edit" : "Add"}</span> Skill
        </p>
        <label className="ofc-field">
          <span>Description</span>
          <textarea name="description" required rows={2} maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="ofc-field" style={{ marginTop: "0.75rem" }}>
          <span>Sort order</span>
          <input name="sort_order" type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </label>
      </div>
      <div className="asb-block">
        <div className="asb-seg is-bands" role="group">
          {NURSERY_DIVISIONS.map((entry) => {
            const on = picked.includes(entry.id);
            return (
              <label key={entry.id} className={on ? "is-on" : ""}>
                <input type="checkbox" name="division" value={entry.id} checked={on} onChange={() => toggle(entry.id)} />
                <strong>{entry.short}</strong>
              </label>
            );
          })}
        </div>
      </div>
      <div className="asb-seg is-two is-compact" role="radiogroup" style={{ marginBottom: "0.75rem" }}>
        <label className={active ? "is-on" : ""}>
          <input type="radio" name="active" value="1" checked={active} onChange={() => setActive(true)} />
          Shown
        </label>
        <label className={!active ? "is-on" : ""}>
          <input type="radio" name="active" value="0" checked={!active} onChange={() => setActive(false)} />
          Hidden
        </label>
      </div>
      <footer className="asb-sheet-foot">
        {skill ? (
          <>
            <button type="button" className="asb-delete-start" onClick={onCancelEdit}>
              Cancel
            </button>
            <button type="submit" formNoValidate name="intent" value="delete" className="grd-remove">
              Delete
            </button>
          </>
        ) : (
          <p className="asb-foot-hint">Add skills expected at this stage.</p>
        )}
        <button className="admin-btn" type="submit" disabled={!picked.length || description.trim().length < 2}>
          {skill ? "Save skill" : "Add skill"}
        </button>
      </footer>
    </DeskForm>
  );
}
