"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { signOutStudent } from "@/app/student/actions";
import { studentNav } from "@/lib/student";

function initials(name: string) {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] || "S") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

function Seal() {
  return (
    <span className="account-brand-seal" aria-hidden="true">
      <img src="/images/kja-logo.png" alt="" />
    </span>
  );
}

export function StudentShell({
  children,
  name,
  classLabel,
  unread,
  unreadMessages = 0,
}: {
  children: React.ReactNode;
  name: string;
  classLabel?: string;
  unread: number;
  unreadMessages?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = studentNav.find((item) => (item.href === "/student" ? pathname === "/student" : pathname.startsWith(item.href)));

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
      <Link href="/student" className="account-brand" onClick={() => setOpen(false)}>
        <Seal />
        <span>
          <strong>Student portal</strong>
          <span>Kampala Junior Academy</span>
        </span>
      </Link>
      <nav className="account-nav" aria-label="Student portal">
        {studentNav.map((item, index) => {
          const active = item.href === "/student" ? pathname === "/student" : pathname.startsWith(item.href);
          const divided = index > 0 && item.group !== studentNav[index - 1].group;
          const badge =
            item.href === "/student/notifications" && unread
              ? unread
              : item.href === "/student/messages" && unreadMessages
                ? unreadMessages
                : 0;
          return (
            <Fragment key={item.href}>
              {divided ? <hr className="account-nav-rule" /> : null}
              <Link href={item.href} className={active ? "active" : ""}>
                <i className={`fa-solid ${item.icon}`} />
                <span>{item.label}</span>
                {badge ? <em>{badge > 99 ? "99+" : badge}</em> : null}
              </Link>
            </Fragment>
          );
        })}
      </nav>
      <div className="account-side-foot">
        <Link href="/" className="account-side-link" onClick={() => setOpen(false)}>
          <i className="fa-solid fa-globe" />
          <span>School website</span>
          <i className="fa-solid fa-arrow-up-right-from-square account-side-link-out" />
        </Link>
        <div className="account-user">
          <span className="account-user-avatar" aria-hidden="true">{initials(name)}</span>
          <span className="account-user-text">
            <strong>{name}</strong>
            <span>{classLabel || "Student account"}</span>
          </span>
          <button
            type="button"
            className="account-user-signout"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await signOutStudent();
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
        <Link href="/student" className="account-topbar-brand" aria-label="Student portal">
          <Seal />
          <span>
            <strong>Student portal</strong>
            <span>{current?.label || "Home"}</span>
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
