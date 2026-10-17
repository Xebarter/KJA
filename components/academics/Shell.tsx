"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { searchAcademics } from "@/app/academics_office/(desk)/actions";
import { signOut } from "@/app/actions";
import { SidebarSearch } from "@/components/SidebarSearch";
import { initials } from "@/lib/applications";
import { ACADEMICS_BASE, academicsNav, type AcademicsBadge } from "@/lib/academics-nav";
import type { SidebarHit } from "@/lib/sidebar-search";

function placesFor(office: boolean): SidebarHit[] {
  return academicsNav.filter((item) => office || !item.office).map((item) => ({
    id: item.href,
    href: item.href,
    title: item.label,
    meta: item.group,
    icon: item.icon,
  }));
}

function isActive(pathname: string, href: string) {
  return href === ACADEMICS_BASE ? pathname === ACADEMICS_BASE : pathname === href || pathname.startsWith(`${href}/`);
}

function Seal() {
  return (
    <span className="admin-seal" aria-hidden="true">
      <img src="/images/icon.png" alt="" />
    </span>
  );
}

export function AcademicsShell({
  children,
  person,
  badges,
  office,
}: {
  children: React.ReactNode;
  person: { name: string; email: string; role: string };
  badges: Record<AcademicsBadge, number>;
  office: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const nav = academicsNav.filter((item) => office || !item.office);
  const current = [...nav].reverse().find((item) => isActive(pathname, item.href))?.label ?? "Overview";

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    // Dynamic office pages otherwise prefetch only the loading skeleton, so the click still waits on the server.
    for (const item of academicsNav) {
      if (office || !item.office) router.prefetch(item.href, { kind: "full" as const } as Parameters<typeof router.prefetch>[1]);
    }
  }, [router, office]);

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
      <header className="admin-topbar">
        <Link href={ACADEMICS_BASE} className="admin-topbar-brand">
          <Seal />
          <span>
            <strong>Academics office</strong>
            <span>{current}</span>
          </span>
        </Link>
        <button
          className="admin-topbar-menu"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="academics-side"
          onClick={() => setOpen((value) => !value)}
        >
          <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars-staggered"}`} aria-hidden="true" />
        </button>
      </header>
      <button className="admin-nav-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />

      <aside id="academics-side" className="admin-side">
        <Link href={ACADEMICS_BASE} className="admin-brand">
          <Seal />
          <span>
            <strong>Academics office</strong>
            <span>Kampala Junior Academy</span>
          </span>
        </Link>

        <SidebarSearch
          id="academics-search"
          label="Find a pupil"
          placeholder="Name or student number"
          inputRef={search}
          places={placesFor(office)}
          recordsLabel="Pupils"
          browseLabel="See classes"
          browseHref={() => `${ACADEMICS_BASE}/classes`}
          search={searchAcademics}
          empty="No pupils match. Try a surname or a student number."
        />

        <nav className="admin-nav" aria-label="Academics office">
          {nav.map((item, index) => {
            const active = isActive(pathname, item.href);
            const badge = item.badge ? badges[item.badge] : 0;
            const divided = index > 0 && item.group !== nav[index - 1].group;
            return (
              <Fragment key={item.href}>
                {divided ? <hr className="admin-nav-rule" /> : null}
                <Link href={item.href} prefetch={true} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  <span>{item.label}</span>
                  {badge ? <em className="admin-nav-badge" aria-label={`${badge} to look at`}>{badge > 99 ? "99+" : badge}</em> : null}
                </Link>
              </Fragment>
            );
          })}
          <hr className="admin-nav-rule" />
          <Link href={`${ACADEMICS_BASE}/attendance`} prefetch={true} className={pathname === `${ACADEMICS_BASE}/attendance` ? "active" : ""}>
            <i className="fa-solid fa-clipboard-check" aria-hidden="true" />
            <span>Take a register</span>
          </Link>
        </nav>

        <div className="admin-side-foot">
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
                router.push("/");
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
