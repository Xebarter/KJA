"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/app/actions";
import { contentGroups, inboxLinks, resourceLabel } from "@/lib/admin";
import { initials } from "@/lib/applications";

const GROUP_ICONS: Record<string, string> = {
  Website: "fa-globe",
  People: "fa-chalkboard-user",
  "Events & gallery": "fa-calendar-days",
  Alumni: "fa-user-graduate",
  Careers: "fa-briefcase",
};

const INBOX_ICONS: Record<string, string> = {
  "/admin/inbox/messages": "fa-envelope",
  "/admin/inbox/newsletter": "fa-paper-plane",
};

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function Seal() {
  return (
    <span className="admin-seal" aria-hidden="true">
      <img src="/images/icon.png" alt="" />
    </span>
  );
}

function NavLink({ href, icon, badge, children }: { href: string; icon: string; badge?: number; children: React.ReactNode }) {
  const active = isActive(usePathname(), href);
  return (
    <Link href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
      <i className={`fa-solid ${icon}`} aria-hidden="true" />
      <span>{children}</span>
      {badge ? <em className="admin-nav-badge" aria-label={`${badge} new`}>{badge > 99 ? "99+" : badge}</em> : null}
    </Link>
  );
}

export function AdminShell({
  children,
  admin,
  newApplications = 0,
  unreadMessages = 0,
  newJobApplications = 0,
}: {
  children: React.ReactNode;
  admin: { name: string; email: string };
  newApplications?: number;
  unreadMessages?: number;
  newJobApplications?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const sections = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/stories", label: "Stories" },
    { href: "/admin/applications", label: "Applications" },
    { href: "/admin/team", label: "Team" },
    { href: "/admin/images", label: "Images" },
    { href: "/admin/settings", label: "Site settings" },
    ...inboxLinks,
    ...contentGroups.flatMap((group) => group.keys.map((key) => ({ href: `/admin/content/${key}`, label: resourceLabel(key) }))),
  ];
  const current = sections.find((section) => isActive(pathname, section.href))?.label ?? "Dashboard";

  return (
    <div className={`admin-shell${open ? " is-nav-open" : ""}`}>
      <header className="admin-topbar">
        <Link href="/admin" className="admin-topbar-brand">
          <Seal />
          <span>
            <strong>KJA Admin</strong>
            <span>{current}</span>
          </span>
        </Link>
        <button
          className="admin-topbar-menu"
          type="button"
          aria-label={open ? "Close admin menu" : "Open admin menu"}
          aria-expanded={open}
          aria-controls="admin-side"
          onClick={() => setOpen((value) => !value)}
        >
          <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars-staggered"}`} aria-hidden="true" />
        </button>
      </header>
      <button className="admin-nav-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />

      <aside id="admin-side" className="admin-side">
        <Link href="/admin" className="admin-brand">
          <Seal />
          <span>
            <strong>KJA Admin</strong>
            <span>Kampala Junior Academy</span>
          </span>
        </Link>

        <nav className="admin-nav" aria-label="Admin">
          <NavLink href="/admin" icon="fa-gauge-high">Dashboard</NavLink>

          <span className="admin-nav-label">Newsroom</span>
          <NavLink href="/admin/stories" icon="fa-newspaper">Stories</NavLink>

          <span className="admin-nav-label">Admissions</span>
          <NavLink href="/admin/applications" icon="fa-file-signature" badge={newApplications}>Applications</NavLink>
          <NavLink href="/admin/team" icon="fa-user-shield">Team</NavLink>

          <span className="admin-nav-label">Inbox</span>
          {inboxLinks.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              icon={INBOX_ICONS[link.href] ?? "fa-inbox"}
              badge={link.href === "/admin/inbox/messages" ? unreadMessages : undefined}
            >
              {link.label}
            </NavLink>
          ))}

          <span className="admin-nav-label">Website</span>
          <NavLink href="/admin/images" icon="fa-images">Images</NavLink>
          <NavLink href="/admin/settings" icon="fa-sliders">Site settings</NavLink>

          <span className="admin-nav-label">Content</span>
          {contentGroups.map((group) => {
            const inGroup = group.keys.some((key) => isActive(pathname, `/admin/content/${key}`));
            const groupBadge = group.keys.some((key) => key === "vacancies") ? newJobApplications : 0;
            return (
              <details key={group.title} className={`admin-nav-group${inGroup ? " has-active" : ""}`} open={inGroup || undefined}>
                <summary>
                  <i className={`fa-solid ${GROUP_ICONS[group.title] ?? "fa-folder"}`} aria-hidden="true" />
                  <span>{group.title}</span>
                  {groupBadge ? <em className="admin-nav-badge" aria-label={`${groupBadge} new`}>{groupBadge > 99 ? "99+" : groupBadge}</em> : null}
                  <i className="fa-solid fa-chevron-down admin-nav-caret" aria-hidden="true" />
                </summary>
                <div className="admin-subnav">
                  {group.keys.map((key) => {
                    const href = `/admin/content/${key}`;
                    const active = isActive(pathname, href);
                    const badge = key === "vacancies" ? newJobApplications : 0;
                    return (
                      <Link key={key} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                        {resourceLabel(key)}
                        {badge ? <em className="admin-nav-badge" aria-label={`${badge} new applications`}>{badge > 99 ? "99+" : badge}</em> : null}
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </nav>

        <div className="admin-side-foot">
          <a className="admin-side-link" href="/" target="_blank" rel="noopener noreferrer">
            <i className="fa-solid fa-globe" aria-hidden="true" />
            <span>View website</span>
            <i className="fa-solid fa-arrow-up-right-from-square admin-side-link-out" aria-hidden="true" />
          </a>
          <div className="admin-user">
            <span className="admin-user-avatar" aria-hidden="true">{initials(admin.name)}</span>
            <span className="admin-user-text">
              <strong title={admin.name}>{admin.name}</strong>
              <span title={admin.email}>{admin.email || "Administrator"}</span>
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
