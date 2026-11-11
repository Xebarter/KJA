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
};

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

function Hero({
  title,
  lede,
  chips,
  actions,
}: {
  title: string;
  lede: React.ReactNode;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="tch-hero">
      <p className="tch-hero-kicker">
        <i className="fa-solid fa-table-cells" aria-hidden="true" /> My class
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

export function MarksheetClassPicker({
  termLabel,
  classes,
}: {
  termLabel: string;
  classes: MarksheetClassChoice[];
}) {
  return (
    <div className="app-page tch-msh-page">
      <Hero
        title="Marksheet"
        lede="Open a class you lead, then choose which assessment marks to review and edit."
        chips={<span className="tch-chip">{termLabel}</span>}
      />
      <section className="tch-msh-panel" aria-label="Your classes">
        <div className="tch-msh-panel-head">
          <div>
            <h2>Choose a class</h2>
            <p>Each stream has its own marksheet for the current term.</p>
          </div>
        </div>
        {classes.length ? (
          <ul className="tch-msh-grid">
            {classes.map((post, index) => (
              <li key={post.key}>
                <Link className="tch-msh-card is-class" href={post.href} data-tone={String(index % 8)}>
                  <div className="tch-msh-card-top">
                    <span className="tch-msh-card-icon" aria-hidden="true">
                      <i className="fa-solid fa-chalkboard-user" />
                    </span>
                    <span className="tch-msh-badge">{post.campus}</span>
                  </div>
                  <div>
                    <h3>{post.label}</h3>
                    <p>View every subject’s marks for this stream.</p>
                  </div>
                  <div className="tch-msh-card-foot">
                    <span className="tch-msh-go">
                      Open class <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No class assigned" icon="fa-chalkboard-user">
            Ask the academics office to assign you as class teacher for this term.
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
}: {
  classLabel: string;
  termLabel: string;
  campus: string;
  classCode: string;
  stream: string;
  basePath: string;
  sittings: MarksheetSittingChoice[];
  classesHref?: string;
}) {
  const openSubjects = sittings.reduce((sum, sitting) => sum + sitting.open, 0);
  const totalSubjects = sittings.reduce((sum, sitting) => sum + sitting.subjects, 0);

  return (
    <div className="app-page tch-msh-page">
      <Hero
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
}: {
  title: string;
  lede: React.ReactNode;
  emptyTitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="app-page tch-msh-page">
      <Hero title={title} lede={lede} actions={actions} />
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
}: {
  classLabel: string;
  termLabel: string;
  campus?: string;
  sittings: NurseryDsbaSittingChoice[];
  classesHref?: string;
  assessmentsHref?: string;
}) {
  const openCount = sittings.filter((row) => row.status === "open").length;

  return (
    <div className="app-page tch-msh-page">
      <Hero
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
            Ask the academics office to set an assessment that includes this nursery class.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
