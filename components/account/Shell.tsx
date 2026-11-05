"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { signOutAccount } from "@/app/account/actions";
import { accountNav } from "@/lib/account";

const GROUP_LABEL: Record<string, string> = {
  Home: "",
  Family: "My family",
  School: "At school",
  Inbox: "Inbox",
  Account: "Account",
};

const TONES = ["sky", "mint", "sun", "rose", "navy", "coral"] as const;

function toneFor(href: string, index: number) {
  if (href === "/account") return "sky";
  if (href.includes("children")) return "mint";
  if (href.includes("reports")) return "sun";
  if (href.includes("points")) return "coral";
  if (href.includes("fees")) return "rose";
  if (href.includes("charges")) return "sun";
  if (href.includes("applications")) return "navy";
  if (href.includes("clubs")) return "coral";
  if (href.includes("calendar")) return "sky";
  if (href.includes("communications")) return "mint";
  if (href.includes("notifications")) return "sun";
  if (href.includes("profile")) return "navy";
  return TONES[index % TONES.length];
}

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
  unreadMessages = 0,
}: {
  children: React.ReactNode;
  name: string;
  unread: number;
  unreadMessages?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = accountNav.find((item) => (item.href === "/account" ? pathname === "/account" : pathname.startsWith(item.href)));
  const firstName = name.trim().split(/\s+/)[0] || name;

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

      <div className="account-side-hello">
        <span className="account-side-hello-avatar" aria-hidden="true">{initials(name)}</span>
        <p>
          Hello, <em>{firstName}</em>
          <span>Parent account</span>
        </p>
      </div>

      <nav className="account-nav" aria-label="Parent portal">
        {accountNav.map((item, index) => {
          const active = item.href === "/account" ? pathname === "/account" : pathname.startsWith(item.href);
          const divided = index > 0 && item.group !== accountNav[index - 1].group;
          const groupTitle = GROUP_LABEL[item.group] ?? item.group;
          const badge =
            item.href === "/account/communications" && unreadMessages
              ? unreadMessages
              : item.href === "/account/notifications" && unread
                ? unread
                : 0;
          const tone = toneFor(item.href, index);
          return (
            <Fragment key={item.href}>
              {divided && groupTitle ? <p className="account-nav-group">{groupTitle}</p> : null}
              <Link
                href={item.href}
                className={`account-nav-link pa-tone-${tone}${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="account-nav-ico" aria-hidden="true">
                  <i className={`fa-solid ${item.icon}`} />
                </span>
                <span className="account-nav-label">{item.label}</span>
                {badge ? <em>{badge > 99 ? "99+" : badge}</em> : null}
              </Link>
            </Fragment>
          );
        })}
      </nav>

      <div className="account-side-foot">
        <Link href="/" className="account-side-link" onClick={() => setOpen(false)}>
          <span className="account-nav-ico" aria-hidden="true">
            <i className="fa-solid fa-globe" />
          </span>
          <span>School website</span>
          <i className="fa-solid fa-arrow-up-right-from-square account-side-link-out" />
        </Link>
        <div className="account-user">
          <span className="account-user-avatar" aria-hidden="true">{initials(name)}</span>
          <span className="account-user-text">
            <strong>{name}</strong>
            <span>Signed in</span>
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
    <div className={`account-shell pa-shell${open ? " is-nav-open" : ""}`}>
      <header className="account-topbar">
        <Link href="/account" className="account-topbar-brand" aria-label="Parent portal">
          <Seal />
          <span>
            <strong>{firstName}</strong>
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
