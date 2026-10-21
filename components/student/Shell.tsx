"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { StudentFace } from "@/components/StudentFace";
import { signOutStudent } from "@/app/student/actions";
import { studentNav } from "@/lib/student";

const GROUP_LABEL: Record<string, string> = {
  Home: "",
  School: "At school",
  Life: "My life",
  Inbox: "Messages",
  Account: "About me",
};

const TONES = ["sky", "mint", "sun", "rose", "lilac", "coral"] as const;

function toneFor(href: string, index: number) {
  if (href.includes("homework")) return "rose";
  if (href.includes("timetable")) return "sky";
  if (href.includes("attendance")) return "mint";
  if (href.includes("reports")) return "sun";
  if (href.includes("class")) return "lilac";
  if (href.includes("clubs")) return "coral";
  if (href.includes("calendar")) return "sky";
  if (href.includes("messages")) return "mint";
  if (href.includes("notifications")) return "sun";
  if (href.includes("profile")) return "lilac";
  return TONES[index % TONES.length];
}

function initials(name: string) {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] || "S") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

function Seal() {
  return (
    <span className="st-side-seal" aria-hidden="true">
      <img src="/images/kja-logo.png" alt="" />
    </span>
  );
}

export function StudentShell({
  children,
  name,
  classLabel,
  studentId,
  photoPath,
  unread,
  unreadMessages = 0,
}: {
  children: React.ReactNode;
  name: string;
  classLabel?: string;
  studentId?: string;
  photoPath?: string | null;
  unread: number;
  unreadMessages?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = studentNav.find((item) => (item.href === "/student" ? pathname === "/student" : pathname.startsWith(item.href)));
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
      <Link href="/student" className="st-side-brand" onClick={() => setOpen(false)}>
        <Seal />
        <span>
          <strong>My school</strong>
          <span>Kampala Junior Academy</span>
        </span>
      </Link>

      <div className="st-side-hello">
        {studentId ? (
          <StudentFace id={studentId} name={name} photoPath={photoPath} className="st-side-photo" />
        ) : (
          <span className="st-side-photo st-side-photo-fallback" aria-hidden="true">{initials(name)}</span>
        )}
        <p>
          Hello, <em>{firstName}</em>
          {classLabel ? <span>{classLabel}</span> : null}
        </p>
      </div>

      <nav className="st-side-nav" aria-label="Student portal">
        {studentNav.map((item, index) => {
          const active = item.href === "/student" ? pathname === "/student" : pathname.startsWith(item.href);
          const divided = index > 0 && item.group !== studentNav[index - 1].group;
          const groupTitle = GROUP_LABEL[item.group] ?? item.group;
          const badge =
            item.href === "/student/notifications" && unread
              ? unread
              : item.href === "/student/messages" && unreadMessages
                ? unreadMessages
                : 0;
          const tone = toneFor(item.href, index);
          return (
            <Fragment key={item.href}>
              {divided && groupTitle ? <p className="st-side-group">{groupTitle}</p> : null}
              <Link
                href={item.href}
                className={`st-side-link st-tone-${tone}${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="st-side-ico" aria-hidden="true">
                  <i className={`fa-solid ${item.icon}`} />
                </span>
                <span className="st-side-label">{item.label}</span>
                {badge ? <em>{badge > 99 ? "99+" : badge}</em> : null}
              </Link>
            </Fragment>
          );
        })}
      </nav>

      <div className="st-side-foot">
        <div className="st-side-user">
          {studentId ? (
            <StudentFace id={studentId} name={name} photoPath={photoPath} className="st-side-avatar" />
          ) : (
            <span className="st-side-avatar" aria-hidden="true">{initials(name)}</span>
          )}
          <span className="st-side-user-text">
            <strong>{name}</strong>
            <span>{classLabel || "Student"}</span>
          </span>
          <button
            type="button"
            className="st-side-out"
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
    <div className={`account-shell st-shell${open ? " is-nav-open" : ""}`}>
      <header className="account-topbar st-topbar">
        <Link href="/student" className="st-topbar-brand" aria-label="Student portal">
          {studentId ? (
            <StudentFace id={studentId} name={name} photoPath={photoPath} className="st-topbar-photo" />
          ) : (
            <Seal />
          )}
          <span>
            <strong>{firstName}</strong>
            <span>{current?.label || "Home"}</span>
          </span>
        </Link>
        <button
          className="account-menu-toggle st-menu-toggle"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars"}`} />
        </button>
      </header>
      <button className="account-nav-scrim" type="button" aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      <aside className="account-side st-side">{nav}</aside>
      <div className="account-main">{children}</div>
    </div>
  );
}
