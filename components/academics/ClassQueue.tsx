"use client";

import { useState } from "react";
import Link from "next/link";

export type ClassQueueItem = { key: string; code: string; name: string; href: string; done: number; pupils: number };

const nf = (value: number) => value.toLocaleString("en-GB");
const FIRST = 8;

export function ClassQueue({ classes }: { classes: ClassQueueItem[] }) {
  const [open, setOpen] = useState(false);
  const hidden = Math.max(0, classes.length - FIRST);
  const shown = open || !hidden ? classes : classes.slice(0, FIRST);

  return (
    <div className="ov-classes">
      <ul>
        {shown.map((group) => {
          const width = group.pupils ? Math.round((group.done / group.pupils) * 100) : 0;
          return (
            <li key={group.key}>
              <Link href={group.href}>
                <span className="ov-class-name">
                  <strong>{group.code}</strong>
                  <small>{group.name}</small>
                </span>
                <span className="ov-track" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
                <span className="ov-class-total">{group.done}/{group.pupils}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {hidden ? (
        <button type="button" className="ov-more" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? "Show fewer" : `${nf(hidden)} more ${hidden === 1 ? "class" : "classes"}`}
        </button>
      ) : null}
    </div>
  );
}
