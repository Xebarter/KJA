"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Empty } from "@/components/academics/ui";
import { ACADEMICS_BASE } from "@/lib/academics-nav";

export type RosterPupil = {
  id: string;
  full_name: string;
  student_number: string;
  sex: string | null;
};

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function sexLabel(sex: string | null) {
  if (sex === "M") return "Boy";
  if (sex === "F") return "Girl";
  return "";
}

export function ClassRoster({ pupils }: { pupils: RosterPupil[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) return pupils;
    const words = needle.split(/\s+/).filter(Boolean);
    return pupils.filter((pupil) => {
      const hay = `${pupil.full_name} ${pupil.student_number}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [pupils, needle]);

  return (
    <div className="acr-roster">
      <label className="acl-search acr-search">
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Find a pupil"
          aria-label="Find a pupil"
        />
        {q ? (
          <button className="acl-search-clear" type="button" aria-label="Clear search" onClick={() => setQ("")}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
      </label>
      {visible.length ? (
        <ul className="acr-people">
          {visible.map((pupil, index) => (
            <li key={pupil.id} style={{ "--i": Math.min(index, 14) } as React.CSSProperties}>
              <Link href={`${ACADEMICS_BASE}/students/${pupil.id}`}>
                <span className={`acr-avatar${pupil.sex === "M" ? " is-boy" : pupil.sex === "F" ? " is-girl" : ""}`} aria-hidden="true">{initials(pupil.full_name)}</span>
                <span className="acr-person">
                  <strong>{pupil.full_name}</strong>
                  <small>{pupil.student_number}</small>
                </span>
                {sexLabel(pupil.sex) ? <span className={`acr-sex${pupil.sex === "M" ? " is-boy" : " is-girl"}`}>{sexLabel(pupil.sex)}</span> : <span />}
                <i className="fa-solid fa-chevron-right acr-go" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="fa-user" title={needle ? "No pupils match" : "No pupils in this stream"}>
          {needle ? "Try another name or admission number." : "This stream has no active pupils."}
        </Empty>
      )}
    </div>
  );
}
