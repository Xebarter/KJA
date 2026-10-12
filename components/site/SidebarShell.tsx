"use client";

import { useEffect, useState } from "react";

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <aside id="secondary" className="widget-area">
      <button
        className="d-lg-none btn btn-outline-primary w-100 mb-4 d-flex justify-content-between align-items-center"
        type="button"
        aria-controls="sidebar"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Open side menu <i className="fa-solid fa-ellipsis-vertical" />
      </button>
      <div className={`offcanvas-lg offcanvas-end${open ? " show" : ""}`} tabIndex={-1} id="sidebar" aria-labelledby="sidebarLabel">
        <div className="offcanvas-header">
          <span className="h5 offcanvas-title" id="sidebarLabel">Sidebar</span>
          <button type="button" className="btn-close" aria-label="Close" onClick={() => setOpen(false)} />
        </div>
        <div className="offcanvas-body flex-column">{children}</div>
      </div>
      {open ? <div className="offcanvas-backdrop fade show d-lg-none" onClick={() => setOpen(false)} /> : null}
    </aside>
  );
}
