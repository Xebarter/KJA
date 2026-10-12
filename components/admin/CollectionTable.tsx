"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export function CollectionTable({
  table,
  rows,
}: {
  table: string;
  rows: Record<string, unknown>[];
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }, [query, rows]);

  return (
    <>
      <div className="admin-toolbar">
        <input className="admin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this list" />
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Preview</th>
            <th>Title</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, index) => {
            const id = String(row.id || "");
            const label = String(row.title || row.name || row.slug || "Untitled");
            const image = String(row.image_url || "");
            return (
              <tr key={id || `${label}-${index}`}>
                <td>{image ? <img className="admin-thumb" src={image} alt="" /> : "—"}</td>
                <td>{label}</td>
                <td>{row.published === false ? "Hidden" : "Live"}</td>
                <td>
                  {id ? <Link href={`/admin/content/${table}/${id}`}>Edit</Link> : "Import to Supabase to edit"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!visible.length ? <p className="admin-empty">Nothing matches that search.</p> : null}
    </>
  );
}
