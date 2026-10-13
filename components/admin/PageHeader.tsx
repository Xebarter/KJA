export function PageHeader({
  kicker,
  icon,
  title,
  description,
  actions,
  children,
}: {
  kicker: string;
  icon: string;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className={`admin-hero${children ? " has-aside" : ""}`}>
      <div className="admin-hero-main">
        <p className="admin-hero-kicker">
          <i className={`fa-solid ${icon}`} aria-hidden="true" /> {kicker}
        </p>
        <h1>{title}</h1>
        <p className="admin-hero-lede">{description}</p>
        {actions ? <div className="admin-hero-actions">{actions}</div> : null}
      </div>
      {children ? <div className="admin-hero-aside">{children}</div> : null}
    </header>
  );
}
