import Link from "next/link";

export function CareersNav({ current, openRoles, applicants, fresh }: { current: "roles" | "applications"; openRoles: number; applicants: number; fresh: number }) {
  return (
    <nav className="ja-switch" aria-label="Careers">
      <Link href="/admin/content/vacancies" className={current === "roles" ? "is-active" : ""} aria-current={current === "roles" ? "page" : undefined}>
        <i className="fa-solid fa-briefcase" aria-hidden="true" />
        <span>Vacancies</span>
        <em>{openRoles} open</em>
      </Link>
      <Link
        href="/admin/content/vacancies?view=applications"
        className={current === "applications" ? "is-active" : ""}
        aria-current={current === "applications" ? "page" : undefined}
      >
        <i className="fa-solid fa-user-tie" aria-hidden="true" />
        <span>Applications</span>
        <em>{applicants}</em>
        {fresh ? <strong className="ja-switch-new">{fresh} new</strong> : null}
      </Link>
    </nav>
  );
}
