import Link from "next/link";
import { OFFICE, SECTIONS } from "@/lib/students";

export type ClassSummary = {
  code: string;
  name: string;
  section: "nursery" | "primary";
  total: number;
  boys: number;
  girls: number;
  /** Stream names, with "" for pupils who have no stream. */
  streams: { name: string; count: number }[];
  averageAge: number | null;
  ageWarn: boolean;
  medical: number;
  noHouse: number;
  review: number;
};

export type ClassesView = "cards" | "table";
export type ClassesSection = "all" | "nursery" | "primary";

const BASE = `${OFFICE}/classes`;
const nf = (value: number) => value.toLocaleString("en-GB");
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function href(view: ClassesView, section: ClassesSection) {
  const params = new URLSearchParams();
  if (section !== "all") params.set("section", section);
  if (view !== "cards") params.set("view", view);
  const query = params.toString();
  return query ? `${BASE}?${query}` : BASE;
}

function sum(classes: ClassSummary[], key: "total" | "boys" | "girls" | "medical" | "noHouse") {
  return classes.reduce((total, entry) => total + entry[key], 0);
}

function Split({ boys, girls, label }: { boys: number; girls: number; label?: string }) {
  const total = boys + girls;
  return (
    <span className="ocl-split" role="img" aria-label={label ?? `${boys} boys and ${girls} girls`}>
      {total ? (
        <>
          <span className="is-boy" style={{ flexGrow: boys }} />
          <span className="is-girl" style={{ flexGrow: girls }} />
        </>
      ) : null}
    </span>
  );
}

/** Hero summary: everyone placed in a class, and the balance of boys and girls. */
export function ClassesHeroStats({ classes, streams }: { classes: ClassSummary[]; streams: number }) {
  const total = sum(classes, "total");
  const boys = sum(classes, "boys");
  const girls = sum(classes, "girls");
  const running = classes.filter((entry) => entry.total).length;
  return (
    <div className="ocl-hero">
      <p className="ocl-hero-label">Pupils in class</p>
      <strong className="ocl-hero-total">{nf(total)}</strong>
      <p className="ocl-hero-sub">
        {running} classes · {streams} {streams === 1 ? "stream" : "streams"}
      </p>
      <Split boys={boys} girls={girls} />
      <dl className="ocl-hero-legend">
        <div><dt><i className="is-boy" aria-hidden="true" /> Boys</dt><dd>{nf(boys)} <small>{pct(boys, total)}%</small></dd></div>
        <div><dt><i className="is-girl" aria-hidden="true" /> Girls</dt><dd>{nf(girls)} <small>{pct(girls, total)}%</small></dd></div>
      </dl>
    </div>
  );
}

/** Column chart of class sizes, split into boys and girls, grouped by section. */
export function ClassSizeChart({ classes }: { classes: ClassSummary[] }) {
  const largest = Math.max(1, ...classes.map((entry) => entry.total));
  let index = 0;
  return (
    <section className="ocl-panel ocl-chart-panel" aria-labelledby="ocl-chart-title">
      <header className="ocl-panel-head">
        <div>
          <h2 id="ocl-chart-title">Class sizes</h2>
          <p>Pupils in each class, from Reception to Primary Seven. Select a column to open the class.</p>
        </div>
        <div className="ocl-legend" aria-hidden="true">
          <span><i className="is-boy" /> Boys</span>
          <span><i className="is-girl" /> Girls</span>
        </div>
      </header>
      <div className="ocl-chart">
        {SECTIONS.map((section) => {
          const group = classes.filter((entry) => entry.section === section.value);
          return (
            <div key={section.value} className="ocl-chart-group" style={{ flexGrow: group.length }}>
              <div className="ocl-chart-cols">
                {group.map((entry) => {
                  const order = index++;
                  return (
                    <Link
                      key={entry.code}
                      href={`${BASE}/${entry.code}`}
                      className={`ocl-col${entry.total ? "" : " is-empty"}`}
                      style={{ "--h": `${(entry.total / largest) * 100}%`, "--i": order } as React.CSSProperties}
                      title={`${entry.name}: ${entry.total} pupils (${entry.boys} boys, ${entry.girls} girls)`}
                    >
                      <span className="ocl-col-value">{entry.total || "–"}</span>
                      <span className="ocl-col-track">
                        <span className="ocl-col-bar">
                          {entry.girls ? <span className="is-girl" style={{ flexGrow: entry.girls }} /> : null}
                          {entry.boys ? <span className="is-boy" style={{ flexGrow: entry.boys }} /> : null}
                          {entry.total - entry.boys - entry.girls > 0 ? <span className="is-none" style={{ flexGrow: entry.total - entry.boys - entry.girls }} /> : null}
                        </span>
                      </span>
                      <span className="ocl-col-code">{entry.code}</span>
                    </Link>
                  );
                })}
              </div>
              <p className="ocl-chart-caption">{section.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ClassCard({ entry, order }: { entry: ClassSummary; order: number }) {
  const named = entry.streams.filter((stream) => stream.name);
  const unstreamed = entry.streams.find((stream) => !stream.name)?.count ?? 0;
  const flags = [
    entry.medical ? { tone: "med", icon: "fa-notes-medical", text: `${entry.medical} medical` } : null,
    entry.noHouse ? { tone: "warn", icon: "fa-house-circle-xmark", text: `${entry.noHouse} no house` } : null,
    unstreamed && named.length ? { tone: "warn", icon: "fa-shuffle", text: `${unstreamed} no stream` } : null,
    entry.review ? { tone: "warn", icon: "fa-circle-exclamation", text: `${entry.review} to check` } : null,
  ].filter(Boolean) as { tone: string; icon: string; text: string }[];

  return (
    <Link
      href={`${BASE}/${entry.code}`}
      className={`ocl-card${entry.total ? "" : " is-empty"}`}
      style={{ "--i": order } as React.CSSProperties}
    >
      <div className="ocl-card-head">
        <span className="ocl-code">{entry.code}</span>
        <span className="ocl-card-name">
          <strong>{entry.name}</strong>
          <small>
            {named.length ? `${named.length} ${named.length === 1 ? "stream" : "streams"}` : "Single class"}
            {entry.averageAge !== null ? (
              <>
                {" · "}
                <span className={entry.ageWarn ? "is-warn" : undefined} title={entry.ageWarn ? "Average age is unusual for this class" : "Average age"}>
                  age {entry.averageAge.toFixed(1)}
                </span>
              </>
            ) : null}
          </small>
        </span>
        <i className="fa-solid fa-arrow-right ocl-go" aria-hidden="true" />
      </div>

      {entry.total ? (
        <>
          <div className="ocl-card-count">
            <strong>{nf(entry.total)}</strong>
            <span>pupils</span>
          </div>
          <div className="ocl-card-split">
            <Split boys={entry.boys} girls={entry.girls} />
            <p>
              <span><i className="is-boy" aria-hidden="true" /> {entry.boys} boys</span>
              <span><i className="is-girl" aria-hidden="true" /> {entry.girls} girls</span>
            </p>
          </div>
          {named.length ? (
            <ul className="ocl-streams" aria-label="Streams">
              {named.map((stream) => (
                <li key={stream.name}><span>{stream.name}</span><strong>{stream.count}</strong></li>
              ))}
            </ul>
          ) : null}
          <div className="ocl-flags">
            {flags.length ? (
              flags.map((flag) => (
                <span key={flag.text} className={`is-${flag.tone}`}><i className={`fa-solid ${flag.icon}`} aria-hidden="true" /> {flag.text}</span>
              ))
            ) : (
              <span className="is-ok"><i className="fa-solid fa-circle-check" aria-hidden="true" /> All records complete</span>
            )}
          </div>
        </>
      ) : (
        <p className="ocl-card-empty"><i className="fa-regular fa-folder-open" aria-hidden="true" /> No pupils in this class yet</p>
      )}
    </Link>
  );
}

function ClassTable({ groups }: { groups: { label: string; classes: ClassSummary[] }[] }) {
  const all = groups.flatMap((group) => group.classes);
  const totals = (list: ClassSummary[]) => ({ total: sum(list, "total"), boys: sum(list, "boys"), girls: sum(list, "girls"), medical: sum(list, "medical"), noHouse: sum(list, "noHouse") });
  const grand = totals(all);
  return (
    <div className="ocl-table-scroll">
      <table className="ocl-table">
        <thead>
          <tr>
            <th scope="col">Class</th>
            <th scope="col">Streams</th>
            <th scope="col" className="is-num">Pupils</th>
            <th scope="col" className="is-num">Boys</th>
            <th scope="col" className="is-num">Girls</th>
            <th scope="col" className="ocl-col-balance">Balance</th>
            <th scope="col" className="is-num">Avg age</th>
            <th scope="col" className="is-num">Medical</th>
            <th scope="col" className="is-num">No house</th>
            <th scope="col"><span className="visually-hidden">Open</span></th>
          </tr>
        </thead>
        {groups.map((group) => {
          const sub = totals(group.classes);
          return (
            <tbody key={group.label}>
              <tr className="ocl-table-group">
                <th scope="rowgroup" colSpan={10}>{group.label}<span>{nf(sub.total)} pupils</span></th>
              </tr>
              {group.classes.map((entry) => (
                <tr key={entry.code} className={entry.total ? undefined : "is-empty"}>
                  <td>
                    <Link href={`${BASE}/${entry.code}`} className="ocl-table-class">
                      <span className="ocl-code is-sm">{entry.code}</span>
                      <strong>{entry.name}</strong>
                    </Link>
                  </td>
                  <td className="ocl-table-streams">
                    {entry.streams.filter((stream) => stream.name).map((stream) => (
                      <span key={stream.name}>{stream.name} <b>{stream.count}</b></span>
                    ))}
                    {!entry.streams.some((stream) => stream.name) ? <span className="ocl-muted">–</span> : null}
                  </td>
                  <td className="is-num is-strong">{entry.total || <span className="ocl-muted">0</span>}</td>
                  <td className="is-num">{entry.boys}</td>
                  <td className="is-num">{entry.girls}</td>
                  <td className="ocl-col-balance">{entry.total ? <Split boys={entry.boys} girls={entry.girls} /> : null}</td>
                  <td className={`is-num${entry.ageWarn ? " is-warn" : ""}`}>{entry.averageAge !== null ? entry.averageAge.toFixed(1) : "–"}</td>
                  <td className={`is-num${entry.medical ? " is-med" : ""}`}>{entry.medical || "–"}</td>
                  <td className={`is-num${entry.noHouse ? " is-warn" : ""}`}>{entry.noHouse || "–"}</td>
                  <td className="ocl-table-go">
                    <Link href={`${BASE}/${entry.code}`} aria-label={`Open ${entry.name}`}><i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>Whole school</th>
            <td className="is-num is-strong">{nf(grand.total)}</td>
            <td className="is-num">{nf(grand.boys)}</td>
            <td className="is-num">{nf(grand.girls)}</td>
            <td className="ocl-col-balance"><Split boys={grand.boys} girls={grand.girls} /></td>
            <td />
            <td className="is-num">{grand.medical || "–"}</td>
            <td className="is-num">{grand.noHouse || "–"}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ClassesBoard({ classes, view, section }: { classes: ClassSummary[]; view: ClassesView; section: ClassesSection }) {
  const groups = SECTIONS.filter((item) => section === "all" || item.value === section).map((item) => ({
    value: item.value,
    label: item.label,
    classes: classes.filter((entry) => entry.section === item.value),
  }));
  const tabs: { value: ClassesSection; label: string; count: number }[] = [
    { value: "all", label: "All classes", count: sum(classes, "total") },
    ...SECTIONS.map((item) => ({ value: item.value, label: item.label, count: sum(classes.filter((entry) => entry.section === item.value), "total") })),
  ];
  let order = 0;

  return (
    <section className="ocl-panel ocl-board" aria-labelledby="ocl-board-title">
      <header className="ocl-board-head">
        <h2 id="ocl-board-title" className="visually-hidden">Classes</h2>
        <nav className="ocl-tabs" aria-label="Section">
          {tabs.map((tab) => (
            <Link key={tab.value} href={href(view, tab.value)} className={section === tab.value ? "is-on" : undefined} aria-current={section === tab.value ? "page" : undefined} scroll={false}>
              {tab.label} <em>{nf(tab.count)}</em>
            </Link>
          ))}
        </nav>
        <div className="ocl-switch" role="group" aria-label="Layout">
          <Link href={href("cards", section)} className={view === "cards" ? "is-on" : undefined} aria-current={view === "cards" ? "true" : undefined} scroll={false}>
            <i className="fa-solid fa-grip" aria-hidden="true" /> Cards
          </Link>
          <Link href={href("table", section)} className={view === "table" ? "is-on" : undefined} aria-current={view === "table" ? "true" : undefined} scroll={false}>
            <i className="fa-solid fa-table-list" aria-hidden="true" /> Table
          </Link>
        </div>
      </header>

      {view === "table" ? (
        <ClassTable groups={groups} />
      ) : (
        groups.map((group) => {
          const boys = sum(group.classes, "boys");
          const girls = sum(group.classes, "girls");
          return (
            <div key={group.value} className="ocl-group">
              <div className="ocl-group-head">
                <h3>{group.label}</h3>
                <p>
                  {group.classes.filter((entry) => entry.total).length} classes · {nf(sum(group.classes, "total"))} pupils · {nf(boys)} boys, {nf(girls)} girls
                </p>
              </div>
              <div className="ocl-grid">
                {group.classes.map((entry) => <ClassCard key={entry.code} entry={entry} order={order++} />)}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
