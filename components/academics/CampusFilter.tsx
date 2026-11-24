"use client";

import Link from "next/link";

export function CampusFilter({
  options,
  selected,
  basePath,
  query = {},
  parameter = "campus",
}: {
  options: readonly string[];
  selected: string | null;
  basePath: string;
  query?: Readonly<Record<string, string>>;
  parameter?: string;
}) {
  if (options.length < 2) return null;
  function hrefFor(campus: string | null) {
    const params = new URLSearchParams(query);
    if (campus) params.set(parameter, campus);
    else params.delete(parameter);
    const suffix = params.toString();
    return suffix ? `${basePath}?${suffix}` : basePath;
  }

  return (
    <nav className="acd-campus-filter" aria-label="Filter by campus">
      <span>Campus</span>
      <div>
        <Link href={hrefFor(null)} aria-current={selected ? undefined : "page"} className={selected ? "" : "is-on"}>
          All campuses
        </Link>
        {options.map((campus) => (
          <Link
            key={campus}
            href={hrefFor(campus)}
            aria-current={selected === campus ? "page" : undefined}
            className={selected === campus ? "is-on" : ""}
          >
            {campus}
          </Link>
        ))}
      </div>
    </nav>
  );
}
