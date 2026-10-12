"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function AdmissionsPopup({ title, body, label, href }: { title: string; body: string; label: string; href: string }) {
  const pathname = usePathname();
  const show = pathname === "/" || pathname.startsWith("/branch/");
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      setActive(true);
      document.body.classList.add("no-scroll");
    }, 300);
    return () => {
      clearTimeout(timer);
      document.body.classList.remove("no-scroll");
    };
  }, [show]);

  if (!show) return null;

  function close() {
    setActive(false);
    document.body.classList.remove("no-scroll");
  }

  return (
    <div id="welcomeDialog" className={`dialog-overlay${active ? " active" : ""}`}>
      <div className="dialog-box d-flex flex-column gap-3 align-items-center justify-content-center px-4" style={{ width: 450, height: 300 }}>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="d-flex align-items-center justify-content-center gap-3">
          <Link className="kja-btn" href={href} onClick={close}>{label}</Link>
          <button className="kja-btn btn px-5" id="closeDialog" type="button" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
