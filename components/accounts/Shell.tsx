"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions";
import { initials } from "@/lib/applications";
import { ACCOUNTS_BASE, accountsNav, type AccountsBadge } from "@/lib/accounts-nav";

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
}: {
  children: React.ReactNode;
  person: { name: string; email: string; role: string };
  badges: Record<AccountsBadge, number>;
  term: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const groups = [...new Set(accountsNav.map((item) => item.group))];
  const current = [...accountsNav].reverse().find((item) => isActive(pathname, item.href))?.label ?? "Overview";

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
      <header className="admin-topbar">
        <Link href={ACCOUNTS_BASE} className="admin-topbar-brand">
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
        <Link href={ACCOUNTS_BASE} className="admin-brand">
          <Seal />
          <span>
            <strong>Accounts office</strong>
            <span>Kampala Junior Academy</span>
          </span>
        </Link>

        {term ? (
          <Link href={`${ACCOUNTS_BASE}/settings#terms`} className="acc-term-pill" title="Change the current term in Fee setup">
            <i className="fa-regular fa-calendar" aria-hidden="true" />
            <span>
              <small>Current term</small>
              <strong>{term}</strong>
            </span>
          </Link>
        ) : null}

        <form
          className="ofc-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const q = query.trim();
            if (!q) return;
            router.push(`${ACCOUNTS_BASE}/students?status=all&q=${encodeURIComponent(q)}`);
            setQuery("");
          }}
        >
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <label className="visually-hidden" htmlFor="accounts-search">Find a fee account</label>
          <input
            ref={search}
            id="accounts-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pupil, number or family"
            autoComplete="off"
          />
          <kbd aria-hidden="true">Ctrl K</kbd>
        </form>

        <nav className="admin-nav" aria-label="Accounts office">
          {groups.map((group) => (
            <Fragment key={group}>
              {group !== "Office" ? <span className="admin-nav-label">{group}</span> : null}
              {accountsNav.filter((item) => item.group === group).map((item) => {
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
            </Fragment>
          ))}
          <span className="admin-nav-label">Quick add</span>
          <Link href={`${ACCOUNTS_BASE}/payments/new`} className={pathname === `${ACCOUNTS_BASE}/payments/new` ? "active" : ""}>
            <i className="fa-solid fa-cash-register" aria-hidden="true" />
            <span>Record a payment</span>
          </Link>
          <Link href={`${ACCOUNTS_BASE}/expenses/new`} className={pathname === `${ACCOUNTS_BASE}/expenses/new` ? "active" : ""}>
            <i className="fa-solid fa-file-circle-plus" aria-hidden="true" />
            <span>Add an expense</span>
          </Link>
        </nav>

        <div className="admin-side-foot">
          {person.role === "Administrator" ? (
            <>
              <a className="admin-side-link" href="/admin">
                <i className="fa-solid fa-gauge-high" aria-hidden="true" />
                <span>Admin dashboard</span>
                <i className="fa-solid fa-arrow-right admin-side-link-out" aria-hidden="true" />
              </a>
              <a className="admin-side-link" href="/admissions_office">
                <i className="fa-solid fa-building-user" aria-hidden="true" />
                <span>Admissions office</span>
                <i className="fa-solid fa-arrow-right admin-side-link-out" aria-hidden="true" />
              </a>
            </>
          ) : null}
          <a className="admin-side-link" href="/" target="_blank" rel="noopener noreferrer">
            <i className="fa-solid fa-globe" aria-hidden="true" />
            <span>View website</span>
            <i className="fa-solid fa-arrow-up-right-from-square admin-side-link-out" aria-hidden="true" />
          </a>
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
