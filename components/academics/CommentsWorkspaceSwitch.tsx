"use client";

import Link from "next/link";
import { ACADEMICS_BASE } from "@/lib/academics";

export type CommentsWorkspace = "bank" | "nursery-comments";

export function CommentsWorkspaceSwitch({
  active,
  classCode,
  stream,
}: {
  active: CommentsWorkspace;
  classCode?: string | null;
  stream?: string | null;
}) {
  const bankHref = `${ACADEMICS_BASE}/comments`;
  const nurseryParams = new URLSearchParams({ view: "nursery-comments" });
  if (classCode) nurseryParams.set("class", classCode);
  if (stream != null && stream !== "") nurseryParams.set("stream", stream || "-");
  else if (stream === "") nurseryParams.set("stream", "-");
  const nurseryHref = `${ACADEMICS_BASE}/comments?${nurseryParams.toString()}`;

  return (
    <div className="cmt-workspace-switch ncm-no-print" role="navigation" aria-label="Comments workspace">
      <Link href={bankHref} className={active === "bank" ? "is-on" : ""} aria-current={active === "bank" ? "page" : undefined}>
        <i className="fa-solid fa-book-open" aria-hidden="true" />
        Comment bank
      </Link>
      <Link
        href={nurseryHref}
        className={active === "nursery-comments" ? "is-on" : ""}
        aria-current={active === "nursery-comments" ? "page" : undefined}
      >
        <i className="fa-solid fa-seedling" aria-hidden="true" />
        Nursery Comments
      </Link>
    </div>
  );
}
