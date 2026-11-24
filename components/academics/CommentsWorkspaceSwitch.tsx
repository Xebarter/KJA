"use client";

import Link from "next/link";
import { ACADEMICS_BASE } from "@/lib/academics";

export type CommentsWorkspace = "bank" | "nursery-comments" | "primary-comments";

export function CommentsWorkspaceSwitch({
  active,
  classCode,
  stream,
  campus,
  classCampus,
  base = `${ACADEMICS_BASE}/comments`,
  showBank = true,
  showNursery = true,
  showPrimary = true,
}: {
  active: CommentsWorkspace;
  classCode?: string | null;
  stream?: string | null;
  campus?: string | null;
  classCampus?: string | null;
  base?: string;
  showBank?: boolean;
  showNursery?: boolean;
  showPrimary?: boolean;
}) {
  const bankHref = base;

  function deskHref(view: "nursery-comments" | "primary-comments") {
    const params = new URLSearchParams({ view });
    if (classCode) params.set("class", classCode);
    if (stream != null && stream !== "") params.set("stream", stream || "-");
    else if (stream === "") params.set("stream", "-");
    if (campus) params.set("campus", campus);
    if (classCampus) params.set("classCampus", classCampus);
    return `${base}?${params.toString()}`;
  }

  return (
    <div className="cmt-workspace-switch ncm-no-print" role="navigation" aria-label="Comments workspace">
      {showBank ? (
        <Link href={bankHref} className={active === "bank" ? "is-on" : ""} aria-current={active === "bank" ? "page" : undefined}>
          <i className="fa-solid fa-book-open" aria-hidden="true" />
          Comment bank
        </Link>
      ) : null}
      {showNursery ? (
        <Link
          href={deskHref("nursery-comments")}
          className={active === "nursery-comments" ? "is-on" : ""}
          aria-current={active === "nursery-comments" ? "page" : undefined}
        >
          <i className="fa-solid fa-seedling" aria-hidden="true" />
          Nursery Comments
        </Link>
      ) : null}
      {showPrimary ? (
        <Link
          href={deskHref("primary-comments")}
          className={active === "primary-comments" ? "is-on" : ""}
          aria-current={active === "primary-comments" ? "page" : undefined}
        >
          <i className="fa-solid fa-chalkboard-user" aria-hidden="true" />
          Primary Comments
        </Link>
      ) : null}
    </div>
  );
}
