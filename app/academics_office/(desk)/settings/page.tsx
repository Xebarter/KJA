import { saveBand } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { gradeFor, mapBand, openAcademics, type BandRow } from "@/lib/academics";

export const metadata = { title: "Grading" };

const SECTIONS = [
  {
    value: "primary" as const,
    title: "Primary",
    note: "D1 is the top grade. A percentage falls into the first band that contains it. Lower points are the stronger grade.",
    samples: [92, 72, 55, 36],
  },
  {
    value: "nursery" as const,
    title: "Nursery",
    note: "Teachers choose a band. The markbook stores the middle of that range.",
    samples: [88, 60, 30, 10],
  },
];

function bandInk(index: number, count: number) {
  const strength = 0.28 + ((count - 1 - index) / Math.max(1, count - 1)) * 0.72;
  return { background: `rgba(25, 35, 43, ${strength.toFixed(3)})`, color: strength > 0.55 ? "#fff" : "#19232b" };
}

export default async function GradingPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Grading" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Grading" />;
  const { data, error } = await opened.auth.supabase.from("grade_bands").select("*").order("section").order("sort_order");
  if (error) return <AcademicsGate title="Grading" state={{ notice: "schema", message: error.message }} />;
  const bands = ((data || []) as Record<string, unknown>[]).map(mapBand);
  const reviews = SECTIONS.map((section) => ({ section, review: reviewScale(bands.filter((band) => band.section === section.value)) }));
  const openIssues = reviews.filter((item) => item.review.issues.length).length;

  return (
    <div className="app-page ofc-page acd-grd">
      <PageHeader
        kicker="Setup"
        icon="fa-sliders"
        title="Grading"
        description="The grade policy for the next draft. Approved and published report cards keep the rules they were given."
      />
      <div className="acd-grd-policy">
        <div>
          <strong>Grade policy</strong>
          <span>A percentage is read against the band that contains it. Lower points are the stronger grade.</span>
        </div>
        <div className="acd-grd-policy-meta">
          {reviews.map(({ section, review }) => (
            <span key={section.value}><b>{review.ranked.length}</b> {section.title}</span>
          ))}
          <em className={openIssues ? "is-watch" : "is-set"}>{openIssues ? "Needs review" : "In force"}</em>
        </div>
      </div>
      <div className="acd-grd-sheets">
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
    <section className="acd-grd-sheet">
      <header className="acd-grd-sheet-head">
        <div>
          <p>{section.value === "primary" ? "Primary leaving scale" : "Nursery attainment"}</p>
          <h2>{section.title}</h2>
        </div>
        <span className={issues.length ? "is-watch" : "is-set"}>{issues.length ? "Needs review" : "In force"}</span>
      </header>
      <p className="acd-grd-note">{section.note}</p>
      {ranked.length ? (
        <>
          <div className="acd-grd-ruler">
            <div className="acd-grd-track" aria-hidden="true">
              {ranked.map((band, index) => {
                const left = clamp(band.min_score);
                const width = Math.max(0, clamp(band.max_score) - left);
                if (!width) return null;
                return (
                  <i key={band.id} style={{ left: `${left}%`, width: `${width}%`, ...bandInk(index, ranked.length) }} title={`${band.label}: ${mark(band.min_score)}–${mark(band.max_score)}`} />
                );
              })}
            </div>
            <div className="acd-grd-axis" aria-hidden="true">
              {[0, 25, 50, 75, 100].map((tick) => <span key={tick}>{tick}</span>)}
            </div>
            <ul className="acd-grd-key">
              {ranked.map((band, index) => (
                <li key={band.id}>
                  <i style={bandInk(index, ranked.length)} />
                  <b>{band.label}</b>
                  <span>{mark(band.min_score)}–{mark(band.max_score)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="acd-grd-readout">
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
            <ul className="acd-grd-issues">
              {issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          ) : null}
          <div className="acd-grd-ledger">
            <div className="acd-grd-head" aria-hidden="true"><span>Grade</span><span>From</span><span>To</span><span>Points</span></div>
            {ranked.map((band) => (
              <DeskForm key={band.id} action={saveBand} className="acd-grd-form">
                <input type="hidden" name="id" value={band.id} />
                <input type="hidden" name="section" value={band.section} />
                <label className="ofc-field"><span className="acd-grd-sr">Grade</span><input name="label" defaultValue={band.label} aria-label={`${section.title} grade`} required /></label>
                <label className="ofc-field"><span className="acd-grd-sr">From</span><input name="min_score" type="number" step="0.1" defaultValue={band.min_score} aria-label={`${band.label} from`} required /></label>
                <label className="ofc-field"><span className="acd-grd-sr">To</span><input name="max_score" type="number" step="0.1" defaultValue={band.max_score} aria-label={`${band.label} to`} required /></label>
                <label className="ofc-field"><span className="acd-grd-sr">Points</span><input name="points" type="number" defaultValue={band.points} aria-label={`${band.label} points`} required /></label>
                <button className="acd-grd-save" type="submit">Save</button>
                <button className="acd-grd-remove" type="submit" name="intent" value="delete">Remove</button>
              </DeskForm>
            ))}
            <DeskForm action={saveBand} className="acd-grd-form is-new">
              <input type="hidden" name="section" value={section.value} />
              <label className="ofc-field"><span className="acd-grd-sr">Grade</span><input name="label" required placeholder={section.value === "primary" ? "D1" : "Secure"} aria-label={`New ${section.title} grade`} /></label>
              <label className="ofc-field"><span className="acd-grd-sr">From</span><input name="min_score" type="number" step="0.1" required placeholder="0" aria-label="From" /></label>
              <label className="ofc-field"><span className="acd-grd-sr">To</span><input name="max_score" type="number" step="0.1" required placeholder="100" aria-label="To" /></label>
              <label className="ofc-field"><span className="acd-grd-sr">Points</span><input name="points" type="number" required placeholder="1" aria-label="Points" /></label>
              <button className="acd-grd-save" type="submit">Add band</button>
            </DeskForm>
          </div>
        </>
      ) : (
        <>
          <div className="acd-grd-empty"><p>No {section.title.toLowerCase()} bands yet.</p></div>
          <div className="acd-grd-ledger">
          <DeskForm action={saveBand} className="acd-grd-form is-new">
            <input type="hidden" name="section" value={section.value} />
            <label className="ofc-field"><span className="acd-grd-sr">Grade</span><input name="label" required placeholder={section.value === "primary" ? "D1" : "Secure"} aria-label={`New ${section.title} grade`} /></label>
            <label className="ofc-field"><span className="acd-grd-sr">From</span><input name="min_score" type="number" step="0.1" required placeholder="0" aria-label="From" /></label>
            <label className="ofc-field"><span className="acd-grd-sr">To</span><input name="max_score" type="number" step="0.1" required placeholder="100" aria-label="To" /></label>
            <label className="ofc-field"><span className="acd-grd-sr">Points</span><input name="points" type="number" required placeholder="1" aria-label="Points" /></label>
            <button className="acd-grd-save" type="submit">Add band</button>
          </DeskForm>
          </div>
        </>
      )}
    </section>
  );
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
