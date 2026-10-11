"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function AdmissionsPopup({ title, body, label, href }: { title: string; body: string; label: string; href: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), 300);
    return () => clearTimeout(timer);
  }, []);
  if (!open) return null;
  return (
    <div className="dialog-overlay">
      <div className="dialog-box d-flex flex-column gap-3 align-items-center justify-content-center px-4" style={{ width: 450, minHeight: 280 }}>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="d-flex align-items-center justify-content-center gap-3">
          <Link className="kja-btn" href={href} onClick={() => setOpen(false)}>{label}</Link>
          <button className="kja-btn btn px-5" type="button" onClick={() => setOpen(false)}>Close</button>
        </div>
      </div>
    </div>
  );
}
