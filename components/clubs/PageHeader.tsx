/** Shared masthead for Clubs desk pages. Navy and gold, compact and calm. */
export function ClubsPageHeader({
  kicker = "Clubs",
  icon = "fa-puzzle-piece",
  title,
  description,
  meta,
  actions,
  children,
}: {
  kicker?: string;
  icon?: string;
  title: string;
  description?: React.ReactNode;
  /** Optional chips under the lede (term, counts, etc.). */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional aside such as an attention strip or summary card. */
  children?: React.ReactNode;
}) {
  return (
    <header className={`clubs-head${children ? " has-aside" : ""}`}>
      <div className="clubs-head-main">
        <p className="clubs-head-kicker">
          <i className={`fa-solid ${icon}`} aria-hidden="true" />
          <span>{kicker}</span>
        </p>
        <h1>{title}</h1>
        {description ? <p className="clubs-head-lede">{description}</p> : null}
        {meta ? <div className="clubs-head-meta">{meta}</div> : null}
        {actions ? <div className="clubs-head-actions">{actions}</div> : null}
      </div>
      {children ? <div className="clubs-head-aside">{children}</div> : null}
    </header>
  );
}
