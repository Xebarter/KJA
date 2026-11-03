"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "@/app/actions";
import { DashboardSwitch } from "@/components/DashboardSwitch";
import { DeskWarmup } from "@/components/DeskWarmup";
import { DesktopChrome } from "@/components/DesktopChrome";
import { initials } from "@/lib/applications";
import { pageIdForPath } from "@/lib/dashboard-access";
import { isDesktopClient } from "@/lib/desktop";
import { STORE_BASE, storeNav, type StoreBadge } from "@/lib/store-nav";

function isActive(pathname: string, href: string) {
  return href === STORE_BASE ? pathname === STORE_BASE : pathname === href || pathname.startsWith(`${href}/`);
}

function Seal() {
  return (
    <span className="admin-seal" aria-hidden="true">
      <img src="/images/icon.png" alt="" />
    </span>
  );
}

export function StoreShell({
  children,
  person,
  badges,
  pages = null,
  canSwitch = false,
  home = STORE_BASE,
}: {
  children: React.ReactNode;
  person: { name: string; email: string; role: string };
  badges: Record<StoreBadge, number>;
  pages?: string[] | null;
  canSwitch?: boolean;
  home?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const nav = useMemo(
    () =>
      storeNav.filter((item) => {
        if (pages === null) return true;
        const id = pageIdForPath("store", item.href);
        return Boolean(id && pages.includes(id));
      }),
    [pages],
  );
  const current = [...nav].reverse().find((item) => isActive(pathname, item.href))?.label ?? "Overview";

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (isDesktopClient()) return;
    for (const item of storeNav) {
      try {
        void router.prefetch(item.href);
      } catch {
        /* ignore */
      }
    }
  }, [router]);

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
    <div className={`admin-shell ofc-shell store-shell${open ? " is-nav-open" : ""}`}>
      <DesktopChrome desk="Store" />
      <DeskWarmup hrefs={nav.map((item) => item.href)} />
      <header className="admin-topbar">
        <Link href={home} prefetch={false} className="admin-topbar-brand">
          <Seal />
          <span>
            <strong>Store</strong>
            <span>{current}</span>
          </span>
        </Link>
        <button
          className="admin-topbar-menu"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="store-side"
          onClick={() => setOpen((value) => !value)}
        >
          <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars-staggered"}`} aria-hidden="true" />
        </button>
      </header>
      <button className="admin-nav-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />

      <aside id="store-side" className="admin-side">
        <Link href={home} prefetch={false} className="admin-brand">
          <Seal />
          <span>
            <strong>Store</strong>
            <span>Kampala Junior Academy</span>
          </span>
        </Link>

        <nav className="admin-nav store-nav" aria-label="Store desk">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            const badge = item.badge ? badges[item.badge] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span>{item.label}</span>
                {badge ? (
                  <em className="admin-nav-badge" aria-label={`${badge} to look at`}>
                    {badge > 99 ? "99+" : badge}
                  </em>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="admin-side-foot">
          <DashboardSwitch show={canSwitch} />
          <div className="admin-user">
            <span className="admin-user-avatar" aria-hidden="true">
              {initials(person.name)}
            </span>
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

      <div className="admin-main store-main">{children}</div>
    </div>
  );
}
