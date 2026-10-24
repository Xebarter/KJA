"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions";
import { searchFeeAccounts } from "@/app/accounts/(desk)/payments/actions";
import { DashboardSwitch } from "@/components/DashboardSwitch";
import { DeskWarmup } from "@/components/DeskWarmup";
import { DesktopSyncBar } from "@/components/DesktopSyncBar";
import { SidebarSearch } from "@/components/SidebarSearch";
import { initials } from "@/lib/applications";
import { ACCOUNTS_BASE, accountsNav, type AccountsBadge } from "@/lib/accounts-nav";
import { pageIdForPath } from "@/lib/dashboard-access";
import type { SidebarHit } from "@/lib/sidebar-search";

const ACCOUNTS_PLACES: SidebarHit[] = [
  ...accountsNav.map((item) => ({ id: item.href, href: item.href, title: item.label, meta: item.group, icon: item.icon })),
  { id: `${ACCOUNTS_BASE}/payments/new`, href: `${ACCOUNTS_BASE}/payments/new`, title: "Record a payment", meta: "Quick add", icon: "fa-cash-register" },
  { id: `${ACCOUNTS_BASE}/expenses/new`, href: `${ACCOUNTS_BASE}/expenses/new`, title: "Add an expense", meta: "Quick add", icon: "fa-file-circle-plus" },
];

function isActive(pathname: string, href: string) {
  return href === ACCOUNTS_BASE ? pathname === ACCOUNTS_BASE : pathname === href || pathname.startsWith(`${href}/`);
}

function Seal() {
  return (
    <span className="admin-seal" aria-hidden="true">
      <img src="/images/icon.png" alt="" />
    </span>
  );
}

export function AccountsShell({
  children,
  person,
  badges,
  term,
  pages = null,
  canSwitch = false,
  home = ACCOUNTS_BASE,
}: {
  children: React.ReactNode;
  person: { name: string; email: string; role: string };
  badges: Record<AccountsBadge, number>;
  term: string | null;
  pages?: string[] | null;
  canSwitch?: boolean;
  home?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const show = (href: string) => {
    if (pages === null) return true;
    const id = pageIdForPath("accounts", href);
    return Boolean(id && pages.includes(id));
  };
  const nav = accountsNav.filter((item) => show(item.href));
  const places = ACCOUNTS_PLACES.filter((place) => show(place.href));
  const current = [...nav].reverse().find((item) => isActive(pathname, item.href))?.label ?? "Overview";

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    // Website keeps eager nav prefetch; DeskWarmup covers the desktop shell.
    for (const item of accountsNav) router.prefetch(item.href);
    router.prefetch(`${ACCOUNTS_BASE}/payments/new`);
    router.prefetch(`${ACCOUNTS_BASE}/expenses/new`);
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
    <div className={`admin-shell ofc-shell acc-shell${open ? " is-nav-open" : ""}`}>
      <DesktopSyncBar />
      <DeskWarmup
        hrefs={[
          ...nav.map((item) => item.href),
          `${ACCOUNTS_BASE}/payments/new`,
          `${ACCOUNTS_BASE}/expenses/new`,
        ]}
      />
      <header className="admin-topbar">
        <Link href={home} className="admin-topbar-brand">
          <Seal />
          <span>
            <strong>Accounts office</strong>
            <span>{current}</span>
          </span>
        </Link>
        <button
          className="admin-topbar-menu"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="accounts-side"
          onClick={() => setOpen((value) => !value)}
        >
          <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars-staggered"}`} aria-hidden="true" />
        </button>
      </header>
      <button className="admin-nav-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />

      <aside id="accounts-side" className="admin-side">
        <Link href={home} className="admin-brand">
          <Seal />
          <span>
            <strong>Accounts office</strong>
            <span>Kampala Junior Academy</span>
          </span>
        </Link>

        {term && show(`${ACCOUNTS_BASE}/settings`) ? (
          <Link href={`${ACCOUNTS_BASE}/settings#terms`} className="acc-term-pill" title="Change the current term in Fee setup">
            <i className="fa-regular fa-calendar" aria-hidden="true" />
            <span>
              <small>Current term</small>
              <strong>{term}</strong>
            </span>
          </Link>
        ) : null}

        <SidebarSearch
          id="accounts-search"
          label="Find a fee account"
          placeholder="Pupil, number or family"
          inputRef={search}
          places={places}
          recordsLabel="Pupils"
          browseLabel="See all fee accounts"
          browseHref={(q) => `${ACCOUNTS_BASE}/students?status=all&q=${encodeURIComponent(q)}`}
          search={searchFeeAccounts}
          empty="No pupils match. Try a surname, a student number, or a family number."
        />

        <nav className="admin-nav" aria-label="Accounts office">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            const badge = item.badge ? badges[item.badge] : 0;
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span>{item.label}</span>
                {badge ? <em className="admin-nav-badge" aria-label={`${badge} to look at`}>{badge > 99 ? "99+" : badge}</em> : null}
              </Link>
            );
          })}
          {show(`${ACCOUNTS_BASE}/payments/new`) ? (
            <Link href={`${ACCOUNTS_BASE}/payments/new`} className={pathname === `${ACCOUNTS_BASE}/payments/new` ? "active" : ""}>
              <i className="fa-solid fa-cash-register" aria-hidden="true" />
              <span>Record a payment</span>
            </Link>
          ) : null}
          {show(`${ACCOUNTS_BASE}/expenses/new`) ? (
            <Link href={`${ACCOUNTS_BASE}/expenses/new`} className={pathname === `${ACCOUNTS_BASE}/expenses/new` ? "active" : ""}>
              <i className="fa-solid fa-file-circle-plus" aria-hidden="true" />
              <span>Add an expense</span>
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
