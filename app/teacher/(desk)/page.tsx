import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AcademicsGate } from "@/components/academics/ui";
import { classLabel, kampalaLong, kampalaToday, streamOf, streamQuery } from "@/lib/academics";
import { loadClosures, loadDayMarks, loadRoll } from "@/lib/academics-roll";
import { TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const metadata = { title: "Home" };

type OpenPaper = {
  id: string;
  name: string;
  subject: string;
  classLabel: string;
  heldOn: string | null;
};

type DueHomework = {
  id: string;
  title: string;
  subject: string;
  classLabel: string;
  dueOn: string;
  published: boolean;
};

type UpcomingDate = {
  id: string;
  title: string;
  kind: string;
  startsOn: string;
  scope: string;
};

function firstName(full: string) {
  const part = full.trim().split(/\s+/)[0];
  return part || "Teacher";
}

function shortDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function dayChip(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return { month: "", day: iso };
  const date = new Date(Date.UTC(year, month - 1, day));
  return {
    month: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    day: String(day),
  };
}

function addDaysIso(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function kampalaHour() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value || 12);
}

function Card({
  id,
  icon,
  tone,
  title,
  description,
  action,
  children,
}: {
  id: string;
  icon: string;
  tone: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className={`acd-card is-${tone}`} aria-labelledby={`${id}-title`}>
      <header className="acd-card-head">
        <span className="acd-card-icon" aria-hidden="true">
          <i className={`fa-solid ${icon}`} />
        </span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? (
          <Link className="acd-card-link" href={action.href}>
            {action.label} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Quiet({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="acd-quiet">
      <span aria-hidden="true">
        <i className={`fa-solid ${icon}`} />
      </span>
      {children}
    </p>
  );
}

export default async function TeacherHomePage() {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Teacher desk" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Teacher desk" state={{ notice: "schema", message: teacher.termError }} />;
  const { supabase, user, term, classes, subjects } = teacher;
  const today = kampalaToday();
  const weekEnd = addDaysIso(today, 7);
  const name = teacher.profile.full_name || "Teacher";
  const hasClass = classes.length > 0;
  const allowed = new Set(subjects.map((post) => `${post.classCode}|${post.stream}|${post.subjectId}`));
  const subjectName = new Map(subjects.map((post) => [post.subjectId, post.subjectName]));

  const [papersQuery, homeworkQuery, datesQuery, rollPack] = await Promise.all([
    term && subjects.length
      ? supabase
          .from("assessments")
          .select("id, name, class_code, stream, subject_id, status, held_on")
          .eq("term_id", term.id)
          .eq("status", "open")
          .order("held_on", { ascending: true })
          .limit(40)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    term && subjects.length
      ? supabase
          .from("homework_assignments")
          .select("id, title, class_code, stream, subject_id, due_on, published_at")
          .eq("term_id", term.id)
          .gte("due_on", today)
          .lte("due_on", weekEnd)
          .order("due_on", { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    term && hasClass
      ? supabase
          .from("academic_dates")
          .select("id, title, kind, starts_on, class_code, stream")
          .eq("term_id", term.id)
          .gte("starts_on", today)
          .lte("starts_on", addDaysIso(today, 14))
          .order("starts_on", { ascending: true })
          .limit(12)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    hasClass
      ? Promise.all([loadRoll(supabase, user.id), loadDayMarks(supabase, user.id, today), loadClosures(supabase, today)])
      : Promise.resolve(null),
  ]);

  const paperRows = "error" in papersQuery && papersQuery.error ? [] : papersQuery.data || [];
  const openPapers: OpenPaper[] = (
    paperRows as {
      id: string;
      name: string;
      class_code: string;
      stream: string | null;
      subject_id: string;
      held_on: string | null;
    }[]
  )
    .filter((row) => allowed.has(`${row.class_code}|${streamOf(row.stream)}|${row.subject_id}`))
    .map((row) => ({
      id: row.id,
      name: row.name,
      subject: subjectName.get(row.subject_id) || "Subject",
      classLabel: classLabel(row.class_code, row.stream),
      heldOn: row.held_on,
    }));

  const homeworkRows = "error" in homeworkQuery && homeworkQuery.error ? [] : homeworkQuery.data || [];
  const dueHomework: DueHomework[] = (
    homeworkRows as {
      id: string;
      title: string;
      class_code: string;
      stream: string | null;
      subject_id: string;
      due_on: string;
      published_at: string | null;
    }[]
  )
    .filter((row) => allowed.has(`${row.class_code}|${streamOf(row.stream)}|${row.subject_id}`))
    .map((row) => ({
      id: row.id,
      title: row.title,
      subject: subjectName.get(row.subject_id) || "Subject",
      classLabel: classLabel(row.class_code, row.stream),
      dueOn: row.due_on,
      published: Boolean(row.published_at),
    }));

  const registers = rollPack
    ? (() => {
        const [roll, marks, closures] = rollPack;
        const marked = new Set(marks.map((mark) => mark.student_id));
        const closed = new Set(closures.map((row) => `${row.class_code}|${streamOf(row.stream)}`));
        return classes.map((post) => {
          const pupils = roll.filter((pupil) => pupil.class_code === post.classCode && streamOf(pupil.stream) === post.stream);
          const done = pupils.filter((pupil) => marked.has(pupil.id)).length;
          return {
            ...post,
            pupils: pupils.length,
            done,
            closed: closed.has(`${post.classCode}|${post.stream}`),
          };
        });
      })()
    : [];

  const waiting = registers.filter((row) => !row.closed && !(row.pupils > 0 && row.done >= row.pupils));
  const primaryRegister = waiting[0];
  const classKeys = new Set(classes.map((post) => `${post.classCode}|${post.stream}`));
  const registersDone = registers.filter((row) => row.closed || (row.pupils > 0 && row.done >= row.pupils)).length;
  const registerRate = registers.length
    ? Math.round((registersDone / registers.length) * 100)
    : null;

  const dateRows = "error" in datesQuery && datesQuery.error ? [] : datesQuery.data || [];
  const upcoming: UpcomingDate[] = (
    dateRows as {
      id: string;
      title: string;
      kind: string;
      starts_on: string;
      class_code: string | null;
      stream: string | null;
    }[]
  )
    .filter((row) => {
      if (!row.class_code) return true;
      return classKeys.has(`${row.class_code}|${streamOf(row.stream)}`);
    })
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      startsOn: row.starts_on,
      scope: row.class_code ? classLabel(row.class_code, row.stream) : "School",
    }));

  const unpublished = dueHomework.filter((row) => !row.published);
  const openWork = [
    ...(waiting.length
      ? [
          {
            label: waiting.length === 1 ? `Mark ${primaryRegister!.label}` : "Registers waiting",
            note: waiting.length === 1
              ? `${primaryRegister!.done}/${primaryRegister!.pupils || 0} pupils marked`
              : "Finish attendance before the day closes",
            count: waiting.length,
            href: `${TEACHER_BASE}/attendance?class=${primaryRegister!.classCode}&stream=${streamQuery(primaryRegister!.stream)}`,
            icon: "fa-clipboard-user",
          },
        ]
      : []),
    ...(openPapers.length
      ? [
          {
            label: openPapers.length === 1 ? openPapers[0].name : "Open markbooks",
            note: openPapers.length === 1
              ? `${openPapers[0].subject} · ${openPapers[0].classLabel}`
              : "Enter scores while papers are open",
            count: openPapers.length,
            href: `${TEACHER_BASE}/assessments/${openPapers[0].id}`,
            icon: "fa-pen-to-square",
          },
        ]
      : []),
    ...(unpublished.length
      ? [
          {
            label: "Homework drafts due soon",
            note: "Publish so pupils can see the work",
            count: unpublished.length,
            href: `${TEACHER_BASE}/homework`,
            icon: "fa-book",
          },
        ]
      : dueHomework.length
        ? [
            {
              label: "Homework due this week",
              note: dueHomework[0].title,
              count: dueHomework.length,
              href: `${TEACHER_BASE}/homework`,
              icon: "fa-book",
            },
          ]
        : []),
  ].slice(0, 3);

  const todoCount = openWork.reduce((sum, item) => sum + item.count, 0);
  const primaryHref = primaryRegister
    ? `${TEACHER_BASE}/attendance?class=${primaryRegister.classCode}&stream=${streamQuery(primaryRegister.stream)}`
    : openPapers[0]
      ? `${TEACHER_BASE}/assessments/${openPapers[0].id}`
      : `${TEACHER_BASE}/assessments`;
  const primaryLabel = primaryRegister ? "Take register" : openPapers.length ? "Open markbook" : "Assessments";
  const primaryIcon = primaryRegister ? "fa-clipboard-user" : "fa-pen-to-square";

  const lede = !term
    ? "There is no current term yet. Ask Accounts to open one."
    : !subjects.length
      ? "No subjects are assigned to you this term. The academics office can set your posts."
      : waiting.length
        ? `${waiting.length} class${waiting.length === 1 ? "" : "es"} still need today’s register.`
        : openPapers.length
          ? `${openPapers.length} markbook${openPapers.length === 1 ? "" : "s"} open on your subjects.`
          : "Your classes and markbooks are up to date.";

  const heroPrimary = hasClass
    ? {
        href: `${TEACHER_BASE}/attendance`,
        rate: registerRate ?? 0,
        done: registerRate === 100,
        label: "Registers",
        value: waiting.length ? String(waiting.length) : registers.length ? "Done" : "—",
        note: registers.length
          ? waiting.length
            ? `${waiting.length} ${waiting.length === 1 ? "class" : "classes"} still to mark`
            : "Every class is marked"
          : "No classes on the register",
      }
    : {
        href: openPapers[0] ? `${TEACHER_BASE}/assessments/${openPapers[0].id}` : `${TEACHER_BASE}/assessments`,
        rate: openPapers.length === 0 ? 100 : 0,
        done: openPapers.length === 0,
        label: "Markbooks",
        value: openPapers.length ? String(openPapers.length) : subjects.length ? "Clear" : "—",
        note: openPapers.length
          ? "Open papers ready for scores"
          : subjects.length
            ? "No open markbooks on your subjects"
            : "No subjects assigned this term",
      };

  const snapshot = [
    {
      href: `${TEACHER_BASE}/assessments`,
      value: String(subjects.length),
      label: "Subjects",
      note: "Assigned this term",
    },
    {
      href: `${TEACHER_BASE}/assessments`,
      value: String(openPapers.length),
      label: "Markbooks",
      note: openPapers.length ? "Ready for scores" : "Nothing waiting",
    },
    {
      href: `${TEACHER_BASE}/homework`,
      value: String(dueHomework.length),
      label: "Homework",
      note: "Due in 7 days",
    },
    hasClass
      ? {
          href: `${TEACHER_BASE}/attendance`,
          value: String(waiting.length),
          label: "Registers",
          note: waiting.length ? "Still to mark" : "All marked today",
        }
      : {
          href: `${TEACHER_BASE}/performance`,
          value: String(unpublished.length),
          label: "Drafts",
          note: unpublished.length ? "Homework to publish" : "Nothing pending",
        },
  ];

  const tools = hasClass
    ? [
        { href: `${TEACHER_BASE}/attendance`, icon: "fa-clipboard-user", title: "Attendance", note: "Daily register for your class", tone: "gold" },
        { href: `${TEACHER_BASE}/chat`, icon: "fa-comments", title: "Chat", note: "Message pupils in your class", tone: "blue" },
        { href: `${TEACHER_BASE}/calendar`, icon: "fa-calendar-days", title: "Calendar", note: "Class dates and school events", tone: "violet" },
        { href: `${TEACHER_BASE}/notices`, icon: "fa-bell", title: "Notices", note: "Post to the Pupils App", tone: "teal" },
      ]
    : [];

  return (
    <div className="app-page ofc-page acd-page ov-page tch-page tch-home">
      <PageHeader
        kicker="Teacher desk"
        icon="fa-chalkboard-user"
        title={`${greetingForHour(kampalaHour())}, ${firstName(name)}`}
        description={
          <>
            <span className="acd-today">
              <i className="fa-regular fa-calendar" aria-hidden="true" /> {kampalaLong()}
              {term ? <> · {term.label}</> : null}
              <> · {hasClass ? "Class teacher" : "Subject teacher"}</>
            </span>
            {lede}
          </>
        }
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={primaryHref}>
              <i className={`fa-solid ${primaryIcon}`} aria-hidden="true" /> {primaryLabel}
            </Link>
            <Link className="admin-hero-btn" href={`${TEACHER_BASE}/homework`}>
              <i className="fa-solid fa-book" aria-hidden="true" /> Homework
            </Link>
            <Link className="admin-hero-btn" href={`${TEACHER_BASE}/performance`}>
              <i className="fa-solid fa-chart-column" aria-hidden="true" /> Performance
            </Link>
          </>
        }
      >
        <nav className="acd-todo" aria-label="Needs attention">
          <p className="acd-todo-head">
            <span>Needs attention</span>
            {todoCount ? (
              <em>{todoCount} to do</em>
            ) : (
              <em className="is-clear">
                <i className="fa-solid fa-check" aria-hidden="true" /> Clear
              </em>
            )}
          </p>
          <ul>
            {(openWork.length
              ? openWork
              : [
                  {
                    label: "You’re clear for now",
                    note: hasClass ? "Registers and markbooks are up to date" : "No open markbooks need you",
                    count: 0,
                    href: `${TEACHER_BASE}/assessments`,
                    icon: "fa-circle-check",
                  },
                ]
            ).map((item) => (
              <li key={item.label}>
                <Link href={item.href} className={item.count ? "" : "is-done"}>
                  <span className="acd-todo-icon" aria-hidden="true">
                    <i className={`fa-solid ${item.count ? item.icon : "fa-check"}`} />
                  </span>
                  <span className="acd-todo-text">
                    <strong>{item.label}</strong>
                    <small>{item.note}</small>
                  </span>
                  {item.count ? <em>{item.count}</em> : <em>0</em>}
                  <i className="fa-solid fa-chevron-right acd-todo-go" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHeader>

      {!term ? (
        <p className="acd-note">
          <i className="fa-solid fa-circle-info" aria-hidden="true" />
          No current term. Ask Accounts to open one before registers and markbooks unlock.
        </p>
      ) : null}

      <section className="ov-board" aria-label="Today">
        <header className="ov-cap">
          <p>Today</p>
          <p>{todoCount ? `${todoCount} to do` : "All caught up"}</p>
        </header>
        <div className="ov-main">
          <Link className="ov-hero" href={heroPrimary.href}>
            <span
              className={`ov-ring${heroPrimary.done ? " is-done" : ""}`}
              style={{ "--ov-rate": heroPrimary.rate } as React.CSSProperties}
            >
              <svg viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="15.5" pathLength={100} />
                <circle
                  className="is-value"
                  cx="18"
                  cy="18"
                  r="15.5"
                  pathLength={100}
                  strokeDasharray={`${heroPrimary.rate} 100`}
                />
              </svg>
              <em>
                {hasClass
                  ? registerRate === null
                    ? "—"
                    : `${heroPrimary.rate}%`
                  : heroPrimary.done
                    ? "OK"
                    : heroPrimary.value}
              </em>
            </span>
            <div>
              <span>{heroPrimary.label}</span>
              <strong>{heroPrimary.value}</strong>
              <p>{heroPrimary.note}</p>
            </div>
          </Link>
          {openWork.length ? (
            <ul className="ov-work">
              {openWork.map((item) => (
                <li key={item.label}>
                  <Link href={item.href}>
                    <span className="ov-work-icon" aria-hidden="true">
                      <i className={`fa-solid ${item.icon}`} />
                    </span>
                    <span className="ov-work-text">
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </span>
                    <em>{item.count}</em>
                    <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ov-clear">
              <span aria-hidden="true">
                <i className="fa-solid fa-circle-check" />
              </span>
              Nothing is waiting. Registers, markbooks and homework are clear.
            </p>
          )}
        </div>
        <ul className="ov-snap">
          {snapshot.map((item) => (
            <li key={item.label}>
              <Link href={item.href}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
                <small>{item.note}</small>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="ov-layout">
        <div className="ov-col">
          <Card
            id="markbooks"
            icon="fa-pen-to-square"
            tone="blue"
            title="Open markbooks"
            description="Scores you can still enter this term."
            action={{ href: `${TEACHER_BASE}/assessments`, label: "View all" }}
          >
            {openPapers.length ? (
              <ul className="acd-list">
                {openPapers.slice(0, 6).map((paper, index) => (
                  <li key={paper.id} style={{ "--i": index } as React.CSSProperties}>
                    <span className="acd-initials" aria-hidden="true">
                      <i className="fa-solid fa-pen-to-square" />
                    </span>
                    <div>
                      <Link href={`${TEACHER_BASE}/assessments/${paper.id}`}>{paper.name}</Link>
                      <small>
                        {paper.subject} · {paper.classLabel}
                        {paper.heldOn ? ` · ${shortDay(paper.heldOn)}` : ""}
                      </small>
                    </div>
                    <span className="acd-pill">Open</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet icon="fa-circle-check">No open markbooks on your subjects.</Quiet>
            )}
          </Card>

          <Card
            id="homework"
            icon="fa-book"
            tone="gold"
            title="Homework this week"
            description="Due dates from today through the next seven days."
            action={{ href: `${TEACHER_BASE}/homework`, label: "Manage" }}
          >
            {dueHomework.length ? (
              <ul className="acd-list">
                {dueHomework.slice(0, 6).map((row, index) => (
                  <li key={row.id} style={{ "--i": index } as React.CSSProperties}>
                    <span className="acd-initials" aria-hidden="true">
                      <i className={`fa-solid ${row.published ? "fa-book" : "fa-pen"}`} />
                    </span>
                    <div>
                      <Link href={`${TEACHER_BASE}/homework`}>{row.title}</Link>
                      <small>
                        {row.subject} · {row.classLabel} · due {shortDay(row.dueOn)}
                      </small>
                    </div>
                    <span className={`acd-pill${row.published ? "" : " is-draft"}`}>
                      {row.published ? "Live" : "Draft"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet icon="fa-book">Nothing due in the next week.</Quiet>
            )}
          </Card>

          {hasClass ? (
            <Card
              id="registers"
              icon="fa-clipboard-user"
              tone="green"
              title="Today’s registers"
              description="Classes you lead: mark before the day is closed."
              action={{ href: `${TEACHER_BASE}/attendance`, label: "Open" }}
            >
              <ul className="ov-teachers">
                {registers.map((post) => {
                  const complete = !post.closed && post.pupils > 0 && post.done >= post.pupils;
                  const status = post.closed ? "closed" : complete ? "done" : "wait";
                  const note = post.closed
                    ? "Closed for today"
                    : complete
                      ? "Complete"
                      : post.pupils
                        ? `${post.done} of ${post.pupils} marked`
                        : "No pupils on roll";
                  const progress = post.pupils ? Math.min(100, Math.round((post.done / post.pupils) * 100)) : 0;
                  return (
                    <li key={`${post.classCode}-${post.stream}`}>
                      <span className={`acd-initials is-${status === "done" ? "green" : status === "wait" ? "gold" : "slate"}`} aria-hidden="true">
                        <i
                          className={`fa-solid ${
                            status === "done" ? "fa-circle-check" : status === "closed" ? "fa-lock" : "fa-clipboard-list"
                          }`}
                        />
                      </span>
                      <div>
                        <strong>
                          <Link href={`${TEACHER_BASE}/attendance?class=${post.classCode}&stream=${streamQuery(post.stream)}`}>
                            {post.label}
                          </Link>
                        </strong>
                        <small>{note}</small>
                        {!post.closed && post.pupils ? (
                          <span className="ov-track" aria-hidden="true">
                            <span style={{ width: `${progress}%` }} />
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="ov-col">
          <Card
            id="subjects"
            icon="fa-book-open"
            tone="navy"
            title="Your subjects"
            description="Classes and streams you teach this term."
            action={{ href: `${TEACHER_BASE}/assessments`, label: "Markbooks" }}
          >
            {subjects.length ? (
              <ul className="acd-list">
                {subjects.map((post, index) => (
                  <li key={`${post.classCode}-${post.stream}-${post.subjectId}`} style={{ "--i": index } as React.CSSProperties}>
                    <span className="acd-initials" aria-hidden="true">
                      <i className="fa-solid fa-book-open" />
                    </span>
                    <div>
                      <Link href={`${TEACHER_BASE}/assessments`}>{post.subjectName}</Link>
                      <small>{post.label}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet icon="fa-book-open">No subjects this term.</Quiet>
            )}
          </Card>

          {tools.length ? (
            <Card id="class-tools" icon="fa-chalkboard" tone="violet" title="My class" description="Tools for the class you lead.">
              <div className="tch-tools">
                {tools.map((tool) => (
                  <Link key={tool.href} href={tool.href} className={`tch-tool is-${tool.tone}`}>
                    <span className="tch-tool-ico" aria-hidden="true">
                      <i className={`fa-solid ${tool.icon}`} />
                    </span>
                    <span>
                      <strong>{tool.title}</strong>
                      <em>{tool.note}</em>
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          {hasClass ? (
            <Card
              id="dates"
              icon="fa-calendar-days"
              tone="teal"
              title="Coming up"
              description="School and class dates in the next two weeks."
              action={{ href: `${TEACHER_BASE}/calendar`, label: "Calendar" }}
            >
              {upcoming.length ? (
                <ul className="acd-list">
                  {upcoming.map((row, index) => {
                    const chip = dayChip(row.startsOn);
                    return (
                      <li key={row.id} style={{ "--i": index } as React.CSSProperties}>
                        <span className="acd-date">
                          <small>{chip.month}</small>
                          <strong>{chip.day}</strong>
                        </span>
                        <div>
                          <Link href={`${TEACHER_BASE}/calendar`}>{row.title}</Link>
                          <small>
                            {row.scope}
                            {row.kind ? ` · ${row.kind}` : ""}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Quiet icon="fa-calendar">No examinations, deadlines or meetings ahead.</Quiet>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
