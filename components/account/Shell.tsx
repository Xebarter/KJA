"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAccount } from "@/app/account/actions";
import { accountNav } from "@/lib/account";

function initials(name: string) {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] || "P") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

function Seal() {
  return (
    <span className="account-brand-seal" aria-hidden="true">
      <img src="/images/kja-logo.png" alt="" />
    </span>
  );
}

export function AccountShell({
  children,
  name,
  unread,
  staffLink = null,
}: {
  children: React.ReactNode;
  name: string;
  unread: number;
  staffLink?: { href: string; label: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const groups = [...new Set(accountNav.map((item) => item.group))];
  const current = accountNav.find((item) => (item.href === "/account" ? pathname === "/account" : pathname.startsWith(item.href)));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nav = (
    <>
      <Link href="/account" className="account-brand" onClick={() => setOpen(false)}>
        <Seal />
        <span>
          <strong>Parent portal</strong>
          <span>Kampala Junior Academy</span>
        </span>
      </Link>
      <nav className="account-nav" aria-label="Parent portal">
        {groups.map((group) => (
          <div key={group} className="account-nav-group">
            <span className="account-nav-label">{group}</span>
            {accountNav.filter((item) => item.group === group).map((item) => {
              const active = item.href === "/account" ? pathname === "/account" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                  <i className={`fa-solid ${item.icon}`} />
                  <span>{item.label}</span>
                  {item.href === "/account/notifications" && unread ? <em>{unread}</em> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="account-side-foot">
        {staffLink ? (
          <a href={staffLink.href} className="account-side-link">
            <i className="fa-solid fa-building-user" />
            <span>{staffLink.label}</span>
            <i className="fa-solid fa-arrow-right account-side-link-out" />
          </a>
        ) : null}
        <Link href="/" className="account-side-link" onClick={() => setOpen(false)}>
          <i className="fa-solid fa-globe" />
          <span>School website</span>
          <i className="fa-solid fa-arrow-up-right-from-square account-side-link-out" />
        </Link>
        <div className="account-user">
          <span className="account-user-avatar" aria-hidden="true">{initials(name)}</span>
          <span className="account-user-text">
            <strong>{name}</strong>
            <span>Parent account</span>
          </span>
          <button
            type="button"
            className="account-user-signout"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await signOutAccount();
              router.push("/");
              router.refresh();
            }}
          >
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className={`account-shell${open ? " is-nav-open" : ""}`}>
      <header className="account-topbar">
        <Link href="/account" className="account-topbar-brand" aria-label="Parent portal">
          <Seal />
          <span>
            <strong>Parent portal</strong>
            <span>{current?.label || "Overview"}</span>
          </span>
        </Link>
        <button
          className="account-menu-toggle"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars"}`} />
        </button>
      </header>
      <button className="account-nav-scrim" type="button" aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      <aside className="account-side">{nav}</aside>
      <div className="account-main">{children}</div>
    </div>
  );
}
