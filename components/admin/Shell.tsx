"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/app/actions";
import { resourceOrder, resources } from "@/lib/resources";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Link href="/admin"><strong>KJA Admin</strong></Link>
        <Link href="/admin/settings" className={pathname === "/admin/settings" ? "active" : ""}>Settings</Link>
        {resourceOrder.map((key) => (
          <Link key={key} href={`/admin/content/${key}`} className={pathname.includes(`/content/${key}`) ? "active" : ""}>{resources[key].label}</Link>
        ))}
        <Link href="/admin/inbox/applications">Applications</Link>
        <Link href="/admin/inbox/messages">Messages</Link>
        <Link href="/admin/inbox/newsletter">Newsletter</Link>
        <Link href="/">View site</Link>
        <button type="button" onClick={async () => { await signOut(); router.push("/admin/login"); router.refresh(); }} style={{ margin: "1rem 1.25rem", background: "transparent", color: "#fff", border: "1px solid #fff" }}>Sign out</button>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
