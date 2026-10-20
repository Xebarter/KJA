import { saveBand, saveNextTermStart } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { gradeFor, loadCurrentTerm, mapBand, openAcademics, type BandRow } from "@/lib/academics";
import { formatReportDate, nextTermSlot } from "@/lib/report-closing";
import { serviceClient } from "@/lib/supabase/service";

export const metadata = { title: "Grading" };

const SECTIONS = [
  {
    value: "primary" as const,
    title: "Primary",
    kicker: "Primary leaving scale",
    icon: "fa-graduation-cap",
    note: "D1 is the top grade. A percentage falls into the first band that contains it. Lower points are the stronger grade.",
    samples: [92, 72, 55, 36],
  },
  {
    value: "nursery" as const,
    title: "Nursery",
    kicker: "Nursery attainment",
    icon: "fa-seedling",
    note: "Teachers choose a band. The markbook stores the middle of that range.",
    samples: [88, 60, 30, 10],
  },
];

const INK = ["#19232b", "#24323c", "#3d4c58", "#8a5a12", "#c9a227", "#d4bc6a", "#e6d7a4", "#efeae2"];

const nf = (value: number) => value.toLocaleString("en-GB");

function bandInk(index: number, count: number) {
  const slot = count <= 1 ? 0 : Math.round((index / (count - 1)) * (INK.length - 1));
  return { background: INK[slot], color: slot <= 3 ? "#fff" : "#19232b" };
}

export default async function GradingPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Grading" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Grading" />;
  const { data, error } = await opened.auth.supabase.from("grade_bands").select("*").order("section").order("sort_order");
  if (error) return <AcademicsGate title="Grading" state={{ notice: "schema", message: error.message }} />;
  const bands = ((data || []) as Record<string, unknown>[]).map(mapBand);
  const reviews = SECTIONS.map((section) => ({ section, review: reviewScale(bands.filter((band) => band.section === section.value)) }));
  const openIssues = reviews.reduce((sum, item) => sum + item.review.issues.length, 0);
  const primaryCount = reviews.find((item) => item.section.value === "primary")?.review.ranked.length ?? 0;
  const nurseryCount = reviews.find((item) => item.section.value === "nursery")?.review.ranked.length ?? 0;
  const nextTerm = await loadNextTerm(opened.auth.supabase);

  return (
    <div className="app-page ofc-page grd-page">
      <PageHeader
        kicker="Setup"
        icon="fa-sliders"
        title="Grading"
        description={<>The next draft uses this scale. <strong>{openIssues ? "Needs review" : "In force"}</strong>.</>}
      />
      <section className="grd-strip" aria-label="Grade policy">
        <div>
          <span className="grd-stat-icon" aria-hidden="true"><i className="fa-solid fa-graduation-cap" /></span>
          <span className="grd-stat-copy"><span>Primary</span><strong>{nf(primaryCount)}</strong><small>{primaryCount === 1 ? "Band" : "Bands"}</small></span>
        </div>
        <div>
          <span className="grd-stat-icon" aria-hidden="true"><i className="fa-solid fa-seedling" /></span>
          <span className="grd-stat-copy"><span>Nursery</span><strong>{nf(nurseryCount)}</strong><small>{nurseryCount === 1 ? "Band" : "Bands"}</small></span>
        </div>
        <div className={openIssues ? "is-warn" : "is-ok"}>
          <span className="grd-stat-icon" aria-hidden="true"><i className="fa-solid fa-triangle-exclamation" /></span>
          <span className="grd-stat-copy"><span>Gaps</span><strong>{nf(openIssues)}</strong><small>{openIssues ? "Need a look" : "Scale is covered"}</small></span>
        </div>
        <div className={openIssues ? "is-warn" : "is-ok"}>
          <span className="grd-stat-icon" aria-hidden="true"><i className="fa-solid fa-scale-balanced" /></span>
          <span className="grd-stat-copy"><span>Policy</span><strong>{openIssues ? "Review" : "Set"}</strong><small>Approved cards keep their rules</small></span>
        </div>
      </section>
      <section className="grd-card grd-next">
        <header className="grd-card-head">
          <div className="grd-card-title">
            <span className="grd-card-icon" aria-hidden="true"><i className="fa-solid fa-calendar-day" /></span>
            <div>
              <p>Report cards</p>
              <h2>Next term</h2>
            </div>
          </div>
        </header>
        <div className="grd-body">
          <p className="grd-note">This date is printed beside the fees on every report card{nextTerm.label ? <> for the term after <strong>{nextTerm.current}</strong></> : null}.</p>
          {nextTerm.ready ? (
            <DeskForm action={saveNextTermStart} className="grd-next-form">
              <label className="ofc-field">
                <span>Next term starts on</span>
                <input name="starts_on" type="date" required defaultValue={nextTerm.startsOn ?? ""} />
              </label>
              <button className="grd-save" type="submit">Save date</button>
            </DeskForm>
          ) : <p className="grd-quiet">Set a current term before choosing when the next one starts.</p>}
          {nextTerm.startsOn ? <p className="grd-next-when">{formatReportDate(nextTerm.startsOn)}</p> : null}
        </div>
      </section>
      <div className="grd-sheets">
        {SECTIONS.map((section) => (
          <Scale key={section.value} section={section} bands={bands.filter((band) => band.section === section.value)} />
        ))}
      </div>
    </div>
  );
}

function Scale({ section, bands }: { section: (typeof SECTIONS)[number]; bands: BandRow[] }) {
  const { ranked, issues } = reviewScale(bands);
  return (
    <section className="grd-card">
      <header className="grd-card-head">
        <div className="grd-card-title">
          <span className="grd-card-icon" aria-hidden="true"><i className={`fa-solid ${section.icon}`} /></span>
          <div>
            <p>{section.kicker}</p>
            <h2>{section.title}</h2>
          </div>
        </div>
        <span className={issues.length ? "grd-pill is-watch" : "grd-pill is-set"}>{issues.length ? "Needs review" : "In force"}</span>
      </header>
      <div className="grd-body">
        <p className="grd-note">{section.note}</p>
        {ranked.length ? (
          <>
            <div className="grd-ruler">
              <div className="grd-track" aria-hidden="true">
                {ranked.map((band, index) => {
                  const left = clamp(band.min_score);
                  const width = Math.max(0, clamp(band.max_score) - left);
                  if (!width) return null;
                  return (
                    <i key={band.id} style={{ left: `${left}%`, width: `${width}%`, background: bandInk(index, ranked.length).background }} title={`${band.label}: ${mark(band.min_score)}–${mark(band.max_score)}`} />
                  );
                })}
              </div>
              <div className="grd-axis" aria-hidden="true">
                {[0, 25, 50, 75, 100].map((tick) => <span key={tick} style={{ left: `${tick}%` }}>{tick}</span>)}
              </div>
              <ul className="grd-key">
                {ranked.map((band, index) => (
                  <li key={band.id}>
                    <i style={bandInk(index, ranked.length)}>{band.label}</i>
                    <span>{mark(band.min_score)}–{mark(band.max_score)}</span>
                    <em>{band.points} {band.points === 1 ? "pt" : "pts"}</em>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grd-readout">
              {section.samples.map((score) => {
                const band = gradeFor(bands, section.value, score);
                return (
                  <div key={score} className={band ? "" : "is-open"}>
                    <strong>{score}<small>%</small></strong>
                    <span>{band ? band.label : "No grade"}</span>
                    <em>{band ? `${band.points} ${band.points === 1 ? "pt" : "pts"}` : "Uncovered"}</em>
                  </div>
                );
              })}
            </div>
            {issues.length ? (
              <ul className="grd-issues">
                {issues.map((issue) => <li key={issue}><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />{issue}</li>)}
              </ul>
            ) : null}
          </>
        ) : <p className="grd-quiet">No {section.title.toLowerCase()} bands yet. Add the first range below.</p>}
        <div className="grd-ledger">
          {ranked.length ? <div className="grd-head" aria-hidden="true"><span>Grade</span><span>From</span><span>To</span><span>Points</span></div> : null}
          {ranked.map((band) => (
            <DeskForm key={band.id} action={saveBand} className="grd-form">
              <input type="hidden" name="id" value={band.id} />
              <input type="hidden" name="section" value={band.section} />
              <label className="ofc-field"><span className="grd-sr">Grade</span><input name="label" defaultValue={band.label} aria-label={`${section.title} grade`} required /></label>
              <label className="ofc-field"><span className="grd-sr">From</span><input name="min_score" type="number" step="0.1" defaultValue={band.min_score} aria-label={`${band.label} from`} required /></label>
              <label className="ofc-field"><span className="grd-sr">To</span><input name="max_score" type="number" step="0.1" defaultValue={band.max_score} aria-label={`${band.label} to`} required /></label>
              <label className="ofc-field"><span className="grd-sr">Points</span><input name="points" type="number" defaultValue={band.points} aria-label={`${band.label} points`} required /></label>
              <button className="grd-save" type="submit">Save</button>
              <button className="grd-remove" type="submit" name="intent" value="delete">Remove</button>
            </DeskForm>
          ))}
          <NewBand section={section} />
        </div>
      </div>
    </section>
  );
}

function NewBand({ section }: { section: (typeof SECTIONS)[number] }) {
  return (
    <DeskForm action={saveBand} className="grd-form is-new">
      <input type="hidden" name="section" value={section.value} />
      <label className="ofc-field"><span className="grd-sr">Grade</span><input name="label" required placeholder={section.value === "primary" ? "D1" : "Secure"} aria-label={`New ${section.title} grade`} /></label>
      <label className="ofc-field"><span className="grd-sr">From</span><input name="min_score" type="number" step="0.1" required placeholder="0" aria-label="From" /></label>
      <label className="ofc-field"><span className="grd-sr">To</span><input name="max_score" type="number" step="0.1" required placeholder="100" aria-label="To" /></label>
      <label className="ofc-field"><span className="grd-sr">Points</span><input name="points" type="number" required placeholder="1" aria-label="Points" /></label>
      <button className="grd-save" type="submit">Add band</button>
    </DeskForm>
  );
}

async function loadNextTerm(supabase: Parameters<typeof loadCurrentTerm>[0]) {
  const termPack = await loadCurrentTerm(supabase);
  if (!termPack.term) return { ready: false, current: "", label: "", startsOn: null as string | null };
  const slot = nextTermSlot(termPack.term.year, termPack.term.term);
  const db = serviceClient() ?? supabase;
  const { data } = await db.from("fee_terms").select("label, starts_on").eq("year", slot.year).eq("term", slot.term).maybeSingle();
  return {
    ready: true,
    current: termPack.term.label,
    label: data?.label || `${slot.year} Term ${slot.term}`,
    startsOn: data?.starts_on ? String(data.starts_on).slice(0, 10) : null,
  };
}

function reviewScale(bands: BandRow[]) {
  const ranked = [...bands].sort((a, b) => b.min_score - a.min_score || a.max_score - b.max_score);
  const issues: string[] = [];
  const holes = uncovered(bands);
  if (holes.length === 1) issues.push(`${mark(holes[0].from)}–${mark(holes[0].to)} is not in a grade.`);
  else if (holes.length > 1) issues.push(`${holes.length} gaps in the scale. ${mark(holes[0].from)}% would not receive a grade.`);
  for (let index = 0; index < ranked.length; index += 1) {
    for (let next = index + 1; next < ranked.length; next += 1) {
      const left = ranked[index];
      const right = ranked[next];
      const overlap = Math.min(left.max_score, right.max_score) - Math.max(left.min_score, right.min_score);
      if (overlap >= 0) issues.push(`${left.label} and ${right.label} overlap. The lower points win.`);
    }
  }
  return { ranked, issues: issues.slice(0, 4) };
}

function uncovered(bands: BandRow[]) {
  const holes: { from: number; to: number }[] = [];
  let start: number | null = null;
  for (let step = 0; step <= 1000; step += 1) {
    const score = step / 10;
    const covered = bands.some((band) => score + 1e-9 >= band.min_score && score - 1e-9 <= band.max_score);
    if (!covered && start === null) start = score;
    if (covered && start !== null) {
      holes.push({ from: start, to: (step - 1) / 10 });
      start = null;
    }
  }
  if (start !== null) holes.push({ from: start, to: 100 });
  return holes.filter((hole) => hole.to >= hole.from);
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}

function mark(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
