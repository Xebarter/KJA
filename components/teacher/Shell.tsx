"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { signOut } from "@/app/actions";
import { DeskWarmup } from "@/components/DeskWarmup";
import { DesktopSyncBar } from "@/components/DesktopSyncBar";
import { isDesktopClient } from "@/lib/desktop";
import { TEACHER_BASE, teacherNav } from "@/lib/teacher";

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "T") + (parts[1]?.[0] || "")).toUpperCase();
}

function Seal() {
  return (
    <span className="admin-seal" aria-hidden="true">
      <img src="/images/icon.png" alt="" />
    </span>
  );
}

function isActive(pathname: string, href: string) {
  return href === TEACHER_BASE ? pathname === TEACHER_BASE : pathname === href || pathname.startsWith(`${href}/`);
}

export function TeacherShell({
  children,
  name,
  email,
  classTeacher,
  locked,
}: {
  children: React.ReactNode;
  name: string;
  email: string;
  classTeacher: boolean;
  locked: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const nav = teacherNav(classTeacher, locked);
  const current = [...nav].reverse().find((item) => isActive(pathname, item.href))?.label ?? "Home";
  const homeHref = locked ? `${TEACHER_BASE}/profile` : TEACHER_BASE;
  const role = locked ? "Finish profile" : classTeacher ? "Class teacher" : "Subject teacher";
  const linkPrefetch = desktop ? undefined : false;

  useEffect(() => setDesktop(isDesktopClient()), []);
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`admin-shell ofc-shell tch-shell${open ? " is-nav-open" : ""}`}>
      <DesktopSyncBar />
      <DeskWarmup hrefs={nav.map((item) => item.href)} />
      <header className="admin-topbar">
        <Link href={homeHref} className="admin-topbar-brand" prefetch={linkPrefetch}>
          <Seal />
          <span>
            <strong>Teacher desk</strong>
            <span>{current}</span>
          </span>
        </Link>
        <button
          className="admin-topbar-menu"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="teacher-side"
          onClick={() => setOpen((value) => !value)}
        >
          <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars-staggered"}`} aria-hidden="true" />
        </button>
      </header>

      <button className="admin-nav-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />

      <aside id="teacher-side" className="admin-side" aria-label="Teacher navigation">
        <Link href={homeHref} className="admin-brand" prefetch={linkPrefetch} onClick={() => setOpen(false)}>
          <Seal />
          <span>
            <strong>Teacher desk</strong>
            <span>Kampala Junior Academy</span>
          </span>
        </Link>

        <nav className="admin-nav" aria-label="Teacher desk">
          {nav.map((item, index) => {
            const active = isActive(pathname, item.href);
            const divided = index > 0 && item.group !== nav[index - 1].group;
            return (
              <Fragment key={item.href}>
                {divided ? <hr className="admin-nav-rule" /> : null}
                <Link
                  href={item.href}
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                  prefetch={linkPrefetch}
                  onClick={() => setOpen(false)}
                  title={item.label}
                >
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              </Fragment>
            );
          })}
        </nav>

        <div className="admin-side-foot">
          <div className="admin-user">
            <span className="admin-user-avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <span className="admin-user-text">
              <strong title={name}>{name}</strong>
              <span title={email}>{role}</span>
            </span>
            <button
              type="button"
              className="admin-user-signout"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await signOut();
                router.push("/admin/login");
                router.refresh();
              }}
            >
              <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="admin-main tch-main">{children}</div>
    </div>
  );
}
