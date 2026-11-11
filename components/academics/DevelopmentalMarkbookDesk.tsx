"use client";

import { useMemo, useState } from "react";
import {
  approveDevelopmentalAssessment,
  reopenDevelopmentalAssessment,
  saveSkillRatings,
} from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import type { ProgressCodeRow } from "@/lib/nursery-dsba";

export type DsbaPupil = { id: string; name: string };
export type DsbaSkill = { id: string; description: string; sort: number };
export type DsbaDomain = { id: string; name: string; sort: number; skills: DsbaSkill[] };

export function DevelopmentalMarkbookDesk({
  assessmentId,
  domains,
  progressCodes,
  pupils,
  ratings,
  locked,
  phase,
  office,
}: {
  assessmentId: string;
  domains: DsbaDomain[];
  progressCodes: ProgressCodeRow[];
  pupils: DsbaPupil[];
  ratings: Record<string, string>;
  locked: boolean;
  phase: "open" | "submitted" | "approved";
  office: boolean;
}) {
  const [domainId, setDomainId] = useState(domains[0]?.id || "");
  const [entries, setEntries] = useState(ratings);
  const domain = domains.find((row) => row.id === domainId) || domains[0] || null;

  const filled = useMemo(() => {
    const skillIds = domains.flatMap((row) => row.skills.map((skill) => skill.id));
    let count = 0;
    for (const pupil of pupils) {
      for (const skillId of skillIds) {
        if (entries[`${pupil.id}|${skillId}`]) count += 1;
      }
    }
    return { count, total: pupils.length * skillIds.length };
  }, [domains, pupils, entries]);

  function setCode(pupilId: string, skillId: string, codeId: string) {
    setEntries((current) => ({ ...current, [`${pupilId}|${skillId}`]: codeId }));
  }

  return (
    <div className="mkb-desk">
      <div className="mkb-toolbar">
        <div>
          <strong>
            {filled.count.toLocaleString("en-GB")} / {filled.total.toLocaleString("en-GB")}
          </strong>
          <span> skill codes entered</span>
        </div>
        <p className="mkb-note">
          {phase === "approved" ? "Locked" : phase === "submitted" ? "Submitted · waiting for office lock" : "Open for entry"}
        </p>
      </div>

      <div className="asb-chips" role="tablist" aria-label="Domains" style={{ marginBottom: "1rem" }}>
        {domains.map((row) => (
          <button
            key={row.id}
            type="button"
            role="tab"
            aria-selected={domain?.id === row.id}
            className={domain?.id === row.id ? "is-on" : ""}
            onClick={() => setDomainId(row.id)}
          >
            {row.name}
          </button>
        ))}
      </div>

      {!domain ? (
        <p className="ofc-note">No developmental domains apply to this class division.</p>
      ) : (
        <DeskForm
          action={saveSkillRatings}
          className="mkb-form"
          refresh={false}
        >
          <input type="hidden" name="assessment_id" value={assessmentId} />
          {pupils.map((pupil) =>
            domains.flatMap((row) =>
              row.skills.map((skill) => (
                <input
                  key={`${pupil.id}|${skill.id}`}
                  type="hidden"
                  name={`rating:${pupil.id}|${skill.id}`}
                  value={entries[`${pupil.id}|${skill.id}`] || ""}
                />
              )),
            ),
          )}

          <div className="mkb-table-wrap" style={{ overflowX: "auto" }}>
            <table className="mkb-table">
              <thead>
                <tr>
                  <th>Pupil</th>
                  {domain.skills.map((skill) => (
                    <th key={skill.id} title={skill.description}>
                      <span style={{ display: "block", maxWidth: "7rem", whiteSpace: "normal", fontSize: "0.75rem", fontWeight: 600 }}>
                        {skill.description}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pupils.map((pupil) => (
                  <tr key={pupil.id}>
                    <th scope="row">{pupil.name}</th>
                    {domain.skills.map((skill) => {
                      const key = `${pupil.id}|${skill.id}`;
                      return (
                        <td key={skill.id}>
                          <select
                            disabled={locked}
                            value={entries[key] || ""}
                            onChange={(event) => setCode(pupil.id, skill.id, event.target.value)}
                            aria-label={`${pupil.name} · ${skill.description}`}
                          >
                            <option value="">—</option>
                            {progressCodes.map((code) => (
                              <option key={code.id} value={code.id}>
                                {code.code}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mkb-note" style={{ marginTop: "0.75rem" }}>
            Legend:{" "}
            {progressCodes.map((code) => `${code.code} = ${code.label}`).join(" · ")}
          </p>

          {!locked ? (
            <footer className="mkb-foot">
              <button className="admin-btn" type="submit">
                Save codes
              </button>
              <button className="admin-btn" type="submit" name="intent" value="submit">
                Save &amp; submit
              </button>
            </footer>
          ) : null}
        </DeskForm>
      )}

      {office && phase === "submitted" ? (
        <DeskForm action={approveDevelopmentalAssessment} className="mkb-foot">
          <input type="hidden" name="assessment_id" value={assessmentId} />
          <button className="admin-btn" type="submit">
            Lock assessment
          </button>
        </DeskForm>
      ) : null}
      {office && locked ? (
        <DeskForm action={reopenDevelopmentalAssessment} className="mkb-foot">
          <input type="hidden" name="assessment_id" value={assessmentId} />
          <button className="admin-btn" type="submit">
            Reopen
          </button>
        </DeskForm>
      ) : null}
    </div>
  );
}
