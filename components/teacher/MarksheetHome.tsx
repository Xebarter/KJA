import Link from "next/link";
import {
  MarksheetSittingCombine,
  type MarksheetSittingChoice,
} from "@/components/teacher/MarksheetSittingCombine";

export type { MarksheetSittingChoice };

export type MarksheetClassChoice = {
  key: string;
  label: string;
  campus: string;
  href: string;
  section?: "nursery" | "primary";
  pupils?: number;
  hint?: string;
};

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

function Hero({
  kicker = "My class",
  kickerIcon = "fa-table-cells",
  title,
  lede,
  chips,
  actions,
}: {
  kicker?: string;
  kickerIcon?: string;
  title: string;
  lede: React.ReactNode;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="tch-hero">
      <p className="tch-hero-kicker">
        <i className={`fa-solid ${kickerIcon}`} aria-hidden="true" /> {kicker}
      </p>
      <h1>{title}</h1>
      <p className="tch-hero-lede">{lede}</p>
      {chips ? <div className="tch-hero-meta">{chips}</div> : null}
      {actions ? <div className="tch-hero-actions">{actions}</div> : null}
    </header>
  );
}

function EmptyState({
  title,
  children,
  icon = "fa-table-cells",
}: {
  title: string;
  children: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="tch-msh-empty">
      <span>
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function ClassCard({ post, index }: { post: MarksheetClassChoice; index: number }) {
  const pupils = post.pupils ?? null;
  const hint =
    post.hint ||
    (post.section === "nursery"
      ? "Open developmental sittings for this stream."
      : "View every subject’s marks for this stream.");

  return (
    <li>
      <Link className="tch-msh-card is-class" href={post.href} data-tone={String(index % 8)}>
        <div className="tch-msh-card-top">
          <span className="tch-msh-card-icon" aria-hidden="true">
            <i className={`fa-solid ${post.section === "nursery" ? "fa-seedling" : "fa-chalkboard-user"}`} />
          </span>
          <span className="tch-msh-badge">{post.campus}</span>
        </div>
        <div>
          <h3>{post.label}</h3>
          <p>{hint}</p>
        </div>
        {pupils != null || post.section ? (
          <ul className="tch-msh-meta">
            {post.section ? (
              <li>
                <i className={`fa-solid ${post.section === "nursery" ? "fa-seedling" : "fa-book"}`} aria-hidden="true" />
                {post.section === "nursery" ? "Nursery" : "Primary"}
              </li>
            ) : null}
            {pupils != null ? (
              <li>
                <i className="fa-solid fa-users" aria-hidden="true" />
                {nf(pupils)} on roll
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="tch-msh-card-foot">
          <span className="tch-msh-go">
            Open class <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </li>
  );
}

function ClassSections({ classes }: { classes: MarksheetClassChoice[] }) {
  const nursery = classes.filter((row) => row.section === "nursery");
  const primary = classes.filter((row) => row.section === "primary");
  const other = classes.filter((row) => row.section !== "nursery" && row.section !== "primary");
  const grouped = nursery.length + primary.length > 0 && nursery.length + primary.length === classes.length;

  if (!grouped) {
    return (
      <ul className="tch-msh-grid">
        {classes.map((post, index) => (
          <ClassCard key={post.key} post={post} index={index} />
        ))}
      </ul>
    );
  }

  let tone = 0;
  return (
    <div className="tch-msh-sections">
      {nursery.length ? (
        <div className="tch-msh-section">
          <p className="tch-msh-section-label">
            <i className="fa-solid fa-seedling" aria-hidden="true" /> Nursery
          </p>
          <ul className="tch-msh-grid">
            {nursery.map((post) => {
              const index = tone++;
              return <ClassCard key={post.key} post={post} index={index} />;
            })}
          </ul>
        </div>
      ) : null}
      {primary.length ? (
        <div className="tch-msh-section">
          <p className="tch-msh-section-label">
            <i className="fa-solid fa-book" aria-hidden="true" /> Primary
          </p>
          <ul className="tch-msh-grid">
            {primary.map((post) => {
              const index = tone++;
              return <ClassCard key={post.key} post={post} index={index} />;
            })}
          </ul>
        </div>
      ) : null}
      {other.length ? (
        <div className="tch-msh-section">
          <ul className="tch-msh-grid">
            {other.map((post) => {
              const index = tone++;
              return <ClassCard key={post.key} post={post} index={index} />;
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function MarksheetClassPicker({
  termLabel,
  classes,
  kicker = "My class",
  kickerIcon = "fa-table-cells",
  lede = "Open a class you lead, then choose which assessment marks to review and edit.",
  panelTitle = "Choose a class",
  panelHint = "Each stream has its own marksheet for the current term.",
  emptyTitle = "No class assigned",
  emptyHint = "Ask the academics office to assign you as class teacher for this term.",
}: {
  termLabel: string;
  classes: MarksheetClassChoice[];
  kicker?: string;
  kickerIcon?: string;
  lede?: string;
  panelTitle?: string;
  panelHint?: string;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const totalPupils = classes.reduce((sum, row) => sum + (row.pupils || 0), 0);

  return (
    <div className="app-page tch-msh-page">
      <Hero
        kicker={kicker}
        kickerIcon={kickerIcon}
        title="Marksheet"
        lede={lede}
        chips={
          <>
            <span className="tch-chip">{termLabel}</span>
            {classes.length ? <span className="tch-chip">{nf(classes.length)} streams</span> : null}
            {totalPupils ? <span className="tch-chip">{nf(totalPupils)} on roll</span> : null}
          </>
        }
      />
      <section className="tch-msh-panel" aria-label="Classes">
        <div className="tch-msh-panel-head">
          <div>
            <h2>{panelTitle}</h2>
            <p>{panelHint}</p>
          </div>
        </div>
        {classes.length ? (
          <ClassSections classes={classes} />
        ) : (
          <EmptyState title={emptyTitle} icon="fa-chalkboard-user">
            {emptyHint}
          </EmptyState>
        )}
      </section>
    </div>
  );
}

export function MarksheetSittingPicker({
  classLabel,
  termLabel,
  campus,
  classCode,
  stream,
  basePath,
  sittings,
  classesHref,
  kicker = "My class",
  kickerIcon = "fa-table-cells",
}: {
  classLabel: string;
  termLabel: string;
  campus: string;
  classCode: string;
  stream: string;
  basePath: string;
  sittings: MarksheetSittingChoice[];
  classesHref?: string;
  kicker?: string;
  kickerIcon?: string;
}) {
  const openSubjects = sittings.reduce((sum, sitting) => sum + sitting.open, 0);
  const totalSubjects = sittings.reduce((sum, sitting) => sum + sitting.subjects, 0);

  return (
    <div className="app-page tch-msh-page">
      <Hero
        kicker={kicker}
        kickerIcon={kickerIcon}
        title={classLabel}
        lede="Choose which assessment marks to show. You can edit every open subject directly on the marksheet."
        chips={
          <>
            <span className="tch-chip">{termLabel}</span>
            <span className="tch-chip">{campus}</span>
          </>
        }
        actions={
          classesHref ? (
            <Link className="tch-hero-btn" href={classesHref}>
              <i className="fa-solid fa-layer-group" aria-hidden="true" /> Classes
            </Link>
          ) : null
        }
      />

      {sittings.length ? (
        <section className="tch-msh-strip" aria-label="Marksheet snapshot">
          <div>
            <span>Assessments</span>
            <strong>{nf(sittings.length)}</strong>
            <small>ready to open</small>
          </div>
          <div>
            <span>Subjects</span>
            <strong>{nf(totalSubjects)}</strong>
            <small>across all sittings</small>
          </div>
          <div>
            <span>Editable now</span>
            <strong>{nf(openSubjects)}</strong>
            <small>{openSubjects ? "open papers" : "all locked"}</small>
          </div>
        </section>
      ) : null}

      <section className="tch-msh-panel" aria-label="Assessments">
        {sittings.length ? (
          <MarksheetSittingCombine
            sittings={sittings}
            classCode={classCode}
            stream={stream}
            campus={campus}
            basePath={basePath}
          />
        ) : (
          <>
            <div className="tch-msh-panel-head">
              <div>
                <h2>Assessments</h2>
                <p>Pick one sitting to open the full class marksheet.</p>
              </div>
            </div>
            <EmptyState title="No assessments yet" icon="fa-folder-open">
              The academics office has not set assessments for this class yet.
            </EmptyState>
          </>
        )}
      </section>
    </div>
  );
}

export function MarksheetNotice({
  title,
  lede,
  emptyTitle,
  children,
  actions,
  kicker = "My class",
  kickerIcon = "fa-table-cells",
}: {
  title: string;
  lede: React.ReactNode;
  emptyTitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  kicker?: string;
  kickerIcon?: string;
}) {
  return (
    <div className="app-page tch-msh-page">
      <Hero kicker={kicker} kickerIcon={kickerIcon} title={title} lede={lede} actions={actions} />
      <section className="tch-msh-panel">
        <EmptyState title={emptyTitle}>{children}</EmptyState>
      </section>
    </div>
  );
}

export type NurseryDsbaSittingChoice = {
  id: string;
  name: string;
  kindLabel: string;
  heldLabel: string;
  status: "open" | "submitted" | "approved";
  href: string;
};

/** Nursery marksheet: pick a developmental sitting, then enter skill codes. */
export function NurseryDsbaSittingPicker({
  classLabel,
  termLabel,
  campus,
  sittings,
  classesHref,
  assessmentsHref,
  kicker = "My class",
  kickerIcon = "fa-table-cells",
  emptyHint = "Ask the academics office to set an assessment that includes this nursery class.",
}: {
  classLabel: string;
  termLabel: string;
  campus?: string;
  sittings: NurseryDsbaSittingChoice[];
  classesHref?: string;
  assessmentsHref?: string;
  kicker?: string;
  kickerIcon?: string;
  emptyHint?: string;
}) {
  const openCount = sittings.filter((row) => row.status === "open").length;

  return (
    <div className="app-page tch-msh-page">
      <Hero
        kicker={kicker}
        kickerIcon={kickerIcon}
        title={classLabel}
        lede="Open a developmental sitting to enter progress codes on the class marksheet — the same fullscreen sheet as other classes, with skills instead of subjects."
        chips={
          <>
            <span className="tch-chip">{termLabel}</span>
            {campus ? <span className="tch-chip">{campus}</span> : null}
          </>
        }
        actions={
          <>
            {classesHref ? (
              <Link className="tch-hero-btn" href={classesHref}>
                <i className="fa-solid fa-layer-group" aria-hidden="true" /> Classes
              </Link>
            ) : null}
            {assessmentsHref ? (
              <Link className="tch-hero-btn" href={assessmentsHref}>
                <i className="fa-solid fa-list" aria-hidden="true" /> All assessments
              </Link>
            ) : null}
          </>
        }
      />

      {sittings.length ? (
        <section className="tch-msh-strip" aria-label="Nursery snapshot">
          <div>
            <span>Sittings</span>
            <strong>{nf(sittings.length)}</strong>
            <small>ready to open</small>
          </div>
          <div>
            <span>Open now</span>
            <strong>{nf(openCount)}</strong>
            <small>{openCount ? "ready to mark" : "all handed in"}</small>
          </div>
          <div>
            <span>Entry</span>
            <strong>Codes</strong>
            <small>skills marksheet</small>
          </div>
        </section>
      ) : null}

      <section className="tch-msh-panel" aria-label="Developmental assessments">
        <div className="tch-msh-panel-head">
          <div>
            <h2>Choose a sitting</h2>
            <p>Each sitting opens the class marksheet for developmental skills and progress codes.</p>
          </div>
        </div>
        {sittings.length ? (
          <ul className="tch-msh-grid">
            {sittings.map((sitting, index) => (
              <li key={sitting.id}>
                <Link className="tch-msh-card" href={sitting.href} data-tone={String(index % 8)}>
                  <div className="tch-msh-card-top">
                    <span className="tch-msh-card-icon" aria-hidden="true">
                      <i className="fa-solid fa-table-cells" />
                    </span>
                    <span className={`tch-msh-badge${sitting.status === "approved" ? " is-locked" : sitting.status === "open" ? " is-open" : ""}`}>
                      {sitting.status === "approved" ? "Locked" : sitting.status === "submitted" ? "Submitted" : "Open"}
                    </span>
                  </div>
                  <div>
                    <h3>{sitting.name}</h3>
                    <p>
                      {sitting.kindLabel} · {sitting.heldLabel}
                    </p>
                  </div>
                  <div className="tch-msh-card-foot">
                    <span className="tch-msh-go">
                      Open marksheet <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No developmental sitting yet" icon="fa-seedling">
            {emptyHint}
          </EmptyState>
        )}
      </section>
    </div>
  );
}
