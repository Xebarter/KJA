"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOutAccount } from "@/app/account/actions";
import { accountNav } from "@/lib/account";

export function AccountShell({
  children,
  name,
  unread,
}: {
  children: React.ReactNode;
  name: string;
  unread: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const groups = [...new Set(accountNav.map((item) => item.group))];

  return (
    <div className={`account-shell${open ? " is-nav-open" : ""}`}>
      <button className="account-menu-toggle" type="button" aria-label="Open menu" onClick={() => setOpen((value) => !value)}>
        <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars"}`} />
      </button>
      <aside className="account-side" onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button.account-nav-link")) setOpen(false);
      }}>
        <Link href="/account" className="account-brand">
          <img src="/images/kja-logo.png" alt="" />
          <span>
            <strong>Parent portal</strong>
            <span>{name || "Kampala Junior Academy"}</span>
          </span>
        </Link>
        {groups.map((group) => (
          <div key={group}>
            <span className="account-nav-label">{group}</span>
            {accountNav.filter((item) => item.group === group).map((item) => {
              const active = item.href === "/account" ? pathname === "/account" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                  <i className={`fa-solid ${item.icon}`} />
                  {item.label}
                  {item.href === "/account/notifications" && unread ? ` (${unread})` : ""}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="account-side-foot">
          <Link href="/"><i className="fa-solid fa-arrow-up-right-from-square" /> School website</Link>
          <button
            type="button"
            className="account-nav-link"
            onClick={async () => {
              await signOutAccount();
              router.push("/account/login");
              router.refresh();
            }}
          >
            <i className="fa-solid fa-right-from-bracket" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="account-main">{children}</div>
    </div>
  );
}
