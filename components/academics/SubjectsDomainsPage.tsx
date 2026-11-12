"use client";

import { useState } from "react";
import { DomainsDesk } from "@/components/academics/DomainsDesk";
import { SubjectsDesk, type SubjectClass } from "@/components/academics/SubjectsDesk";
import type { SubjectRow } from "@/lib/academics";
import type { DevelopmentalDomainRow, DevelopmentalSkillRow } from "@/lib/nursery-dsba";

type Mode = "primary" | "nursery";

export function SubjectsDomainsPage({
  subjects,
  classes,
  domains,
  skills,
  saveSubject,
  saveDomain,
  saveSkill,
  domainsError,
}: {
  subjects: SubjectRow[];
  classes: SubjectClass[];
  domains: DevelopmentalDomainRow[];
  skills: DevelopmentalSkillRow[];
  saveSubject: React.ComponentProps<typeof SubjectsDesk>["save"];
  saveDomain: React.ComponentProps<typeof DomainsDesk>["saveDomain"];
  saveSkill: React.ComponentProps<typeof DomainsDesk>["saveSkill"];
  domainsError?: string | null;
}) {
  const [mode, setMode] = useState<Mode>("nursery");
  const nurseryActive = domains.filter((row) => row.active).length;
  const primaryActive = subjects.filter((row) => row.active).length;

  return (
    <div className="asb-shell">
      <header className="asb-banner">
        <div className="asb-banner-main">
          <p className="asb-banner-kicker">
            <i className="fa-solid fa-book-open" aria-hidden="true" /> Teaching catalogue
          </p>
          <h1>Subjects / Domains</h1>
          <p className="asb-banner-lede">
            Primary keeps subjects and marks. Nursery uses shared domains with section-specific skills for Skills-Based
            Assessment reports.
          </p>
          <div className="asb-banner-meta" aria-hidden="true">
            <span className="asb-chip">{primaryActive} primary subjects</span>
            <span className="asb-chip">{nurseryActive} nursery domains</span>
          </div>
          <div className="asb-banner-actions" role="tablist" aria-label="Catalogue">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "nursery"}
              className={`asb-banner-btn${mode === "nursery" ? " is-primary" : ""}`}
              onClick={() => setMode("nursery")}
            >
              <i className="fa-solid fa-seedling" aria-hidden="true" />
              Nursery domains
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "primary"}
              className={`asb-banner-btn${mode === "primary" ? " is-primary" : ""}`}
              onClick={() => setMode("primary")}
            >
              <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
              Primary subjects
            </button>
          </div>
        </div>
      </header>

      {mode === "nursery" ? (
        domainsError ? (
          <section className="asb-panel asb-panel-alone" aria-label="Nursery domains">
            <div className="asb-empty">
              <span>
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
              </span>
              <h2>Domains need a migration</h2>
              <p>
                Nursery domains need <code>supabase/0077_nursery_dsba.sql</code>. {domainsError}
              </p>
            </div>
          </section>
        ) : (
          <DomainsDesk domains={domains} skills={skills} saveDomain={saveDomain} saveSkill={saveSkill} />
        )
      ) : (
        <SubjectsDesk subjects={subjects} classes={classes} save={saveSubject} />
      )}
    </div>
  );
}
