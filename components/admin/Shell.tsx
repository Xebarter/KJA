"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions";
import { contentGroups, inboxLinks, resourceLabel } from "@/lib/admin";

function NavLink({ href, icon, children }: { href: string; icon: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={active ? "active" : ""}>
      <i className={`fa-solid ${icon}`} />
      {children}
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className={`admin-shell${open ? " is-nav-open" : ""}`}>
      <button className="admin-menu-toggle" type="button" aria-label="Open admin menu" onClick={() => setOpen((value) => !value)}>
        <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars"}`} />
      </button>
      <aside className="admin-side" onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button.admin-nav-link")) setOpen(false);
      }}>
        <Link href="/admin" className="admin-brand">
          <img src="/images/kja-logo.png" alt="" />
          <span>
            <strong>KJA Admin</strong>
            <span>Kampala Junior Academy</span>
          </span>
        </Link>
        <NavLink href="/admin" icon="fa-house">Overview</NavLink>
        <NavLink href="/admin/images" icon="fa-images">Images</NavLink>
        <NavLink href="/admin/settings" icon="fa-sliders">Site settings</NavLink>
        {contentGroups.map((group) => {
          const inGroup = group.keys.some((key) => pathname.includes(`/content/${key}`));
          return (
            <details key={group.title} open={inGroup || group.title === "Website"}>
              <summary>{group.title}</summary>
              {group.keys.map((key) => (
                <NavLink key={key} href={`/admin/content/${key}`} icon="fa-angle-right">{resourceLabel(key)}</NavLink>
              ))}
            </details>
          );
        })}
        <span className="admin-nav-label">Inbox</span>
        {inboxLinks.map((link) => (
          <NavLink key={link.href} href={link.href} icon="fa-inbox">{link.label}</NavLink>
        ))}
        <div className="admin-side-foot">
          <NavLink href="/" icon="fa-arrow-up-right-from-square">View website</NavLink>
          <button
            type="button"
            className="admin-nav-link"
            onClick={async () => {
              await signOut();
              router.push("/admin/login");
              router.refresh();
            }}
          >
            <i className="fa-solid fa-right-from-bracket" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
