/** Navy masthead matching the Accounts overview — title left, actions right. */
export function AccountsPageHeader({
  kicker,
  icon,
  title,
  description,
  actions,
  iconFamily = "solid",
}: {
  kicker: string;
  icon: string;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  iconFamily?: "solid" | "regular";
}) {
  return (
    <header className="aov-head">
      <div>
        <p className="aov-kicker">
          <i className={`fa-${iconFamily} ${icon}`} aria-hidden="true" /> {kicker}
        </p>
        <h1>{title}</h1>
        {description ? <p className="aov-lede">{description}</p> : null}
      </div>
      {actions ? <div className="aov-actions">{actions}</div> : null}
    </header>
  );
}
