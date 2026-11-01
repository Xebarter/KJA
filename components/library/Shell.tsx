"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { signOut } from "@/app/actions";
import { setActiveLibrary } from "@/app/library/(desk)/actions";
import { DashboardSwitch } from "@/components/DashboardSwitch";
import { DeskWarmup } from "@/components/DeskWarmup";
import { DesktopChrome } from "@/components/DesktopChrome";
import { initials } from "@/lib/applications";
import { pageIdForPath } from "@/lib/dashboard-access";
import { isDesktopClient } from "@/lib/desktop";
import { LIBRARY_BASE, LIBRARY_LABELS, libraryNav, type LibraryBadge, type LibraryId } from "@/lib/library-nav";

function isActive(pathname: string, href: string) {
  return href === LIBRARY_BASE ? pathname === LIBRARY_BASE : pathname === href || pathname.startsWith(`${href}/`);
}

function Seal() {
  return (
    <span className="admin-seal" aria-hidden="true">
      <img src="/images/icon.png" alt="" />
    </span>
  );
}

export function LibraryShell({
  children,
  person,
  badges,
  libraries,
  activeLibrary,
  pages = null,
  canSwitch = false,
  home = LIBRARY_BASE,
}: {
  children: React.ReactNode;
  person: { name: string; email: string; role: string };
  badges: Record<LibraryBadge, number>;
  libraries: LibraryId[];
  activeLibrary: LibraryId;
  pages?: string[] | null;
  canSwitch?: boolean;
  home?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const show = (href: string) => {
    if (pages === null) return true;
    const id = pageIdForPath("library", href);
    return Boolean(id && pages.includes(id));
  };
  const nav = useMemo(
    () =>
      libraryNav.filter((item) => {
        if (pages === null) return true;
        const id = pageIdForPath("library", item.href);
        return Boolean(id && pages.includes(id));
      }),
    [pages],
  );
  const current = [...nav].reverse().find((item) => isActive(pathname, item.href))?.label ?? "Overview";

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    // Website: warm sidebar routes. Desktop: DeskWarmup handles this gently.
    if (isDesktopClient()) return;
    for (const item of libraryNav) {
      try {
        void router.prefetch(item.href);
      } catch {
        /* ignore */
      }
    }
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

  function switchLibrary(id: LibraryId) {
    if (id === activeLibrary || pending) return;
    startTransition(async () => {
      await setActiveLibrary(id);
      router.refresh();
    });
  }

  return (
    <div className={`admin-shell ofc-shell lib-shell${open ? " is-nav-open" : ""}`}>
      <DesktopChrome desk="Library" />
      <DeskWarmup hrefs={nav.map((item) => item.href)} />
      <header className="admin-topbar">
        <Link href={home} prefetch={false} className="admin-topbar-brand">
          <Seal />
          <span>
            <strong>Library</strong>
            <span>{current}</span>
          </span>
        </Link>
        <button
          className="admin-topbar-menu"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="library-side"
          onClick={() => setOpen((value) => !value)}
        >
          <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars-staggered"}`} aria-hidden="true" />
        </button>
      </header>
      <button className="admin-nav-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />

      <aside id="library-side" className="admin-side">
        <Link href={home} prefetch={false} className="admin-brand">
          <Seal />
          <span>
            <strong>Library</strong>
            <span>Kampala Junior Academy</span>
          </span>
        </Link>

        {libraries.length > 1 ? (
          <div className="lib-switch" role="group" aria-label="Active library">
            {libraries.map((id) => (
              <button
                key={id}
                type="button"
                className={activeLibrary === id ? "is-on" : ""}
                disabled={pending}
                onClick={() => switchLibrary(id)}
              >
                {id === "lower" ? "Lower" : "Upper"}
              </button>
            ))}
          </div>
        ) : (
          <p className="lib-switch is-solo">{LIBRARY_LABELS[activeLibrary]}</p>
        )}

        <nav className="admin-nav lib-nav" aria-label="Library desk">
          {nav.map((item, index) => {
            const active = isActive(pathname, item.href);
            const badge = item.badge ? badges[item.badge] : 0;
            const prev = nav[index - 1];
            const divided = Boolean(prev && prev.group !== item.group);
            return (
              <Fragment key={item.href}>
                {divided ? <hr className="admin-nav-rule" /> : null}
                <Link href={item.href} prefetch={false} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  <span>{item.label}</span>
                  {badge ? (
                    <em className="admin-nav-badge" aria-label={`${badge} to look at`}>
                      {badge > 99 ? "99+" : badge}
                    </em>
                  ) : null}
                </Link>
              </Fragment>
            );
          })}
        </nav>

        <div className="admin-side-foot">
          <DashboardSwitch show={canSwitch} />
          <div className="admin-user">
            <span className="admin-user-avatar" aria-hidden="true">
              {initials(person.name)}
            </span>
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

      <div className="admin-main lib-main">{children}</div>
    </div>
  );
}
