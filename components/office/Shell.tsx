"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions";
import { searchOffice } from "@/app/admissions_office/(office)/students/actions";
import { DashboardSwitch } from "@/components/DashboardSwitch";
import { DeskWarmup } from "@/components/DeskWarmup";
import { DesktopSyncBar } from "@/components/DesktopSyncBar";
import { SidebarSearch } from "@/components/SidebarSearch";
import { initials } from "@/lib/applications";
import { pageIdForPath, pageVisible } from "@/lib/dashboard-access";
import { EMPTY_OFFICE_BADGES, type OfficeBadgeCounts } from "@/lib/office-badges";
import { OFFICE_BASE, officeNav } from "@/lib/office-nav";
import type { SidebarHit } from "@/lib/sidebar-search";

const OFFICE_PLACES: SidebarHit[] = [
  ...officeNav.map((item) => ({ id: item.href, href: item.href, title: item.label, meta: item.group, icon: item.icon })),
  { id: `${OFFICE_BASE}/students/new`, href: `${OFFICE_BASE}/students/new`, title: "Enrol a student", meta: "Quick add", icon: "fa-user-plus" },
];

function isActive(pathname: string, href: string) {
  return href === OFFICE_BASE ? pathname === OFFICE_BASE : pathname === href || pathname.startsWith(`${href}/`);
}

function Seal() {
  return (
    <span className="admin-seal" aria-hidden="true">
      <img src="/images/icon.png" alt="" />
    </span>
  );
}

type Person = { name: string; email: string; role: string };

export function OfficeShell({
  children,
  person: initialPerson,
  badges: initialBadges = EMPTY_OFFICE_BADGES,
  pages = null,
  canSwitch = false,
  home = OFFICE_BASE,
}: {
  children: React.ReactNode;
  person: Person;
  badges?: OfficeBadgeCounts;
  pages?: string[] | null;
  canSwitch?: boolean;
  home?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState(initialBadges);
  const [person, setPerson] = useState(initialPerson);
  const search = useRef<HTMLInputElement>(null);
  const show = (href: string) => pages === null || pageVisible(pages, pageIdForPath("admissions", href) || "");
  const nav = officeNav.filter((item) => show(item.href));
  const places = OFFICE_PLACES.filter((place) => show(place.href));
  const current = [...nav].reverse().find((item) => isActive(pathname, item.href))?.label ?? "Overview";

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`${OFFICE_BASE}/api/badges`, { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          if (data.badges) setBadges(data.badges);
          if (data.person) setPerson(data.person);
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.key === "k" && (event.metaKey || event.ctrlKey))) return;
      event.preventDefault();
      setOpen(true);
      search.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`admin-shell ofc-shell${open ? " is-nav-open" : ""}`}>
      <DesktopSyncBar />
      <DeskWarmup hrefs={nav.map((item) => item.href)} />
      <header className="admin-topbar">
        <Link href={home} className="admin-topbar-brand">
          <Seal />
          <span>
            <strong>Admissions office</strong>
            <span>{current}</span>
          </span>
        </Link>
        <button
          className="admin-topbar-menu"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="office-side"
          onClick={() => setOpen((value) => !value)}
        >
          <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars-staggered"}`} aria-hidden="true" />
        </button>
      </header>
      <button className="admin-nav-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />

      <aside id="office-side" className="admin-side">
        <Link href={home} className="admin-brand">
          <Seal />
          <span>
            <strong>Admissions office</strong>
            <span>Kampala Junior Academy</span>
          </span>
        </Link>

        <SidebarSearch
          id="office-search"
          label="Find a student"
          placeholder="Name, number or parent phone"
          inputRef={search}
          places={places}
          recordsLabel="Students"
          browseLabel="See all students"
          browseHref={(q) => `${OFFICE_BASE}/students?status=all&q=${encodeURIComponent(q)}`}
          search={searchOffice}
          empty="No students match. Try a surname, a student number, or a parent phone."
        />

        <nav className="admin-nav" aria-label="Admissions office">
          {nav.map((item, index) => {
            const active = isActive(pathname, item.href);
            const badge = item.badge ? badges[item.badge] : 0;
            const divided = index > 0 && item.group !== nav[index - 1].group;
            return (
              <Fragment key={item.href}>
                {divided ? <hr className="admin-nav-rule" /> : null}
                <Link href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  <span>{item.label}</span>
                  {badge ? <em className="admin-nav-badge" aria-label={`${badge} to look at`}>{badge > 99 ? "99+" : badge}</em> : null}
                </Link>
              </Fragment>
            );
          })}
          <hr className="admin-nav-rule" />
          {show(`${OFFICE_BASE}/students/new`) ? (
            <Link href={`${OFFICE_BASE}/students/new`} className={pathname === `${OFFICE_BASE}/students/new` ? "active" : ""}>
              <i className="fa-solid fa-user-plus" aria-hidden="true" />
              <span>Enrol a student</span>
            </Link>
          ) : null}
        </nav>

        <div className="admin-side-foot">
          <DashboardSwitch show={canSwitch} />
          <div className="admin-user">
            <span className="admin-user-avatar" aria-hidden="true">{initials(person.name)}</span>
            <span className="admin-user-text">
              <strong title={person.name}>{person.name}</strong>
              <span title={person.email}>{person.role}</span>
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

      <div className="admin-main">{children}</div>
    </div>
  );
}
