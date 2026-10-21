import Link from "next/link";
import { NewStoryMenu, StoryStatusBadge } from "@/components/admin/Stories";
import { APPLICATION_STATUSES, OPEN_STATUSES, initials, statusInfo, timeAgo, type Application } from "@/lib/applications";
import { kampalaIso, STORY_SOURCES } from "@/lib/newsroom";
import type { StoryListItem } from "@/lib/story-admin";
import type { StoriesMode } from "@/lib/story-admin-server";
import type { Article } from "@/lib/types";

const ZONE = "Africa/Kampala";
export const DAY = 86_400_000;

export type DashboardApplication = Pick<Application, "id" | "child_name" | "parent_name" | "grade" | "campus" | "status" | "visit_at" | "created_at">;

export type DashboardMessage = { id: string; name: string; email: string; subject: string | null; message: string; read: boolean; created_at: string };

export type DashboardProps = {
  now: Date;
  configured: boolean;
  applications: DashboardApplication[];
  messages: DashboardMessage[];
  unreadMessages: number;
  subscribers: number;
  newSubscribers: number;
  stories: { mode: StoriesMode; items: StoryListItem[] };
  events: Article[];
  counts: Record<"pages" | "campuses" | "teachers" | "events" | "gallery" | "images" | "alumni" | "vacancies", number>;
};

function greeting(now: Date) {
  const hour = Number(now.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: ZONE }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function eventDay(day: string) {
  const date = new Date(`${day}T12:00:00+03:00`);
  return {
    day: date.toLocaleDateString("en-GB", { day: "numeric", timeZone: ZONE }),
    month: date.toLocaleDateString("en-GB", { month: "short", timeZone: ZONE }),
    weekday: date.toLocaleDateString("en-GB", { weekday: "long", timeZone: ZONE }),
  };
}

export function Dashboard({ now, configured, applications, messages, unreadMessages, subscribers, newSubscribers, stories, events, counts }: DashboardProps) {
  const today = now.toLocaleDateString("en-CA", { timeZone: ZONE });

  const statusCounts = new Map<string, number>();
  applications.forEach((row) => statusCounts.set(row.status || "received", (statusCounts.get(row.status || "received") ?? 0) + 1));
  const newApplications = statusCounts.get("received") ?? 0;
  const openApplications = OPEN_STATUSES.reduce((sum, status) => sum + (statusCounts.get(status) ?? 0), 0);
  const thisWeek = applications.filter((row) => new Date(row.created_at).getTime() >= now.getTime() - 7 * DAY).length;
  const upcomingVisits = applications.filter((row) => row.status === "visit_scheduled" && row.visit_at && new Date(row.visit_at) >= now).length;
  const pipeline = APPLICATION_STATUSES.map((status) => ({ ...status, count: statusCounts.get(status.value) ?? 0 })).filter((status) => status.count);

  const live = stories.items.filter((item) => item.status === "live").length;
  const drafts = stories.items.filter((item) => item.status === "draft").length;
  const scheduled = stories.items.filter((item) => item.status === "scheduled").length;
  const recentStories = [...stories.items]
    .sort((a, b) => new Date(kampalaIso(b.updatedAt || b.publishedAt || b.createdAt) || 0).getTime() - new Date(kampalaIso(a.updatedAt || a.publishedAt || a.createdAt) || 0).getTime())
    .slice(0, 5);

  const upcoming = events
    .filter((event) => event.starts_on && event.starts_on.slice(0, 10) >= today)
    .sort((a, b) => (a.starts_on ?? "").localeCompare(b.starts_on ?? ""));

  const attention = [
    { count: newApplications, label: newApplications === 1 ? "new application" : "new applications", href: "/admin/applications?status=received", icon: "fa-file-signature" },
    { count: unreadMessages, label: unreadMessages === 1 ? "unread message" : "unread messages", href: "/admin/inbox/messages", icon: "fa-envelope" },
    { count: upcomingVisits, label: upcomingVisits === 1 ? "school visit booked" : "school visits booked", href: "/admin/applications?status=visit_scheduled", icon: "fa-calendar-check" },
    { count: drafts + scheduled, label: drafts + scheduled === 1 ? "story not yet live" : "stories not yet live", href: "/admin/stories?status=draft", icon: "fa-pen-to-square" },
  ];
  const todo = attention.filter((item) => item.count);

  const kpis = [
    { label: "Open applications", value: openApplications, note: thisWeek ? `+${thisWeek} this week` : "None new this week", up: thisWeek > 0, href: "/admin/applications", icon: "fa-file-signature" },
    { label: "Live stories", value: live, note: `${drafts} draft${drafts === 1 ? "" : "s"} · ${scheduled} scheduled`, href: "/admin/stories", icon: "fa-newspaper" },
    { label: "Newsletter", value: subscribers, note: newSubscribers ? `+${newSubscribers} in 30 days` : "No new sign-ups in 30 days", up: newSubscribers > 0, href: "/admin/inbox/newsletter", icon: "fa-paper-plane" },
    { label: "Upcoming events", value: upcoming.length, note: upcoming[0]?.starts_on ? `Next on ${eventDay(upcoming[0].starts_on.slice(0, 10)).day} ${eventDay(upcoming[0].starts_on.slice(0, 10)).month}` : "Nothing scheduled", href: "/admin/content/events", icon: "fa-calendar-days" },
  ];

  const library = [
    { label: "Pages", value: counts.pages, href: "/admin/content/pages", icon: "fa-file-lines" },
    { label: "Campuses", value: counts.campuses, href: "/admin/content/campuses", icon: "fa-school" },
    { label: "Teachers", value: counts.teachers, href: "/admin/content/teachers", icon: "fa-chalkboard-user" },
    { label: "Events", value: counts.events, href: "/admin/content/events", icon: "fa-calendar-days" },
    { label: "Gallery", value: counts.gallery, href: "/admin/content/gallery_items", icon: "fa-camera-retro" },
    { label: "Images", value: counts.images, href: "/admin/images", icon: "fa-images" },
    { label: "Alumni", value: counts.alumni, href: "/admin/content/alumni_profiles", icon: "fa-user-graduate" },
    { label: "Vacancies", value: counts.vacancies, href: "/admin/content/vacancies", icon: "fa-briefcase" },
  ];

  const shortcuts = [
    { href: "/admin/applications", label: "Applications", icon: "fa-file-signature", badge: newApplications || undefined },
    { href: "/admin/stories", label: "Stories", icon: "fa-newspaper" },
    { href: "/admin/students", label: "Students", icon: "fa-user-graduate" },
    { href: "/admin/inbox/messages", label: "Inbox", icon: "fa-envelope", badge: unreadMessages || undefined },
    { href: "/admin/team", label: "Team", icon: "fa-user-shield" },
    { href: "/academics_office", label: "Academics", icon: "fa-graduation-cap", external: true },
    { href: "/admissions_office", label: "Admissions", icon: "fa-building-user", external: true },
    { href: "/accounts", label: "Accounts", icon: "fa-calculator", external: true },
  ];

  return (
    <div className="dash">
      <section className="dash-hero">
        <div className="dash-hero-art" aria-hidden="true" />
        <div className="dash-hero-copy">
          <p className="dash-kicker">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONE })}</p>
          <h1>{greeting(now)}</h1>
          <p>
            {todo.length
              ? "A few items need a look today. Start with the list on the right, or jump below."
              : "You're up to date. Use the shortcuts below to manage the school website."}
          </p>
          <div className="dash-hero-actions">
            <NewStoryMenu disabled={stories.mode === "setup"} />
            <Link className="dash-btn dash-btn-glass" href="/admin/applications">
              <i className="fa-solid fa-file-signature" aria-hidden="true" /> Applications
            </Link>
            <Link className="dash-btn dash-btn-glass" href="/admin/students">
              <i className="fa-solid fa-user-graduate" aria-hidden="true" /> Students
            </Link>
          </div>
        </div>
        <div className="dash-attention">
          <p className="dash-attention-label">Needs attention</p>
          {todo.length ? (
            <ul>
              {todo.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>
                    <span className="dash-attention-icon"><i className={`fa-solid ${item.icon}`} aria-hidden="true" /></span>
                    <span><strong>{item.count}</strong> {item.label}</span>
                    <i className="fa-solid fa-arrow-right dash-attention-go" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-clear"><i className="fa-solid fa-circle-check" aria-hidden="true" /> All caught up</p>
          )}
        </div>
      </section>

      {!configured ? (
        <p className="dash-notice">
          <i className="fa-solid fa-plug-circle-exclamation" aria-hidden="true" />
          <span>Supabase isn&apos;t connected yet, so the public site is using the imported content file. Add your keys in <code>.env.local</code> to save changes.</span>
        </p>
      ) : null}

      <nav className="dash-go" aria-label="Quick links">
        {shortcuts.map((item) =>
          item.external ? (
            <a key={item.href} href={item.href} className="dash-go-link">
              <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
              {item.badge ? <em>{item.badge > 99 ? "99+" : item.badge}</em> : null}
            </a>
          ) : (
            <Link key={item.href} href={item.href} className="dash-go-link">
              <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
              {item.badge ? <em>{item.badge > 99 ? "99+" : item.badge}</em> : null}
            </Link>
          ),
        )}
      </nav>

      <div className="admin-kpis">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="admin-kpi">
            <span className="admin-kpi-icon"><i className={`fa-solid ${kpi.icon}`} aria-hidden="true" /></span>
            <span className="admin-kpi-label">{kpi.label}</span>
            <strong>{kpi.value.toLocaleString("en-GB")}</strong>
            <span className={`admin-kpi-note${kpi.up ? " is-up" : ""}`}>
              {kpi.up ? <i className="fa-solid fa-arrow-trend-up" aria-hidden="true" /> : null} {kpi.note}
            </span>
            <i className="fa-solid fa-arrow-right admin-kpi-go" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <div className="dash-grid">
        <div className="dash-col">
          <section className="dash-panel">
            <header className="dash-panel-head">
              <div>
                <h2>Admissions</h2>
                <p>{applications.length ? `${applications.length.toLocaleString("en-GB")} applications in total` : "Applications will appear here as families apply online."}</p>
              </div>
              <Link href="/admin/applications">View all</Link>
            </header>
            {pipeline.length ? (
              <>
                <div className="admin-pipeline" role="img" aria-label={pipeline.map((status) => `${status.label}: ${status.count}`).join(", ")}>
                  {pipeline.map((status) => (
                    <span key={status.value} className={`admin-seg admin-seg-${status.tone}`} style={{ flexGrow: status.count }} />
                  ))}
                </div>
                <ul className="dash-legend">
                  {pipeline.map((status) => (
                    <li key={status.value}>
                      <Link href={`/admin/applications?status=${status.value}`}>
                        <span className={`admin-dot admin-seg-${status.tone}`} aria-hidden="true" />
                        {status.label}
                        <strong>{status.count}</strong>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {applications.length ? (
              <ul className="dash-apps">
                {applications.slice(0, 5).map((row) => {
                  const info = statusInfo(row.status);
                  const child = row.child_name || "Unnamed child";
                  return (
                    <li key={row.id}>
                      <Link href={`/admin/applications/${row.id}`}>
                        <span className="dash-avatar" aria-hidden="true">{initials(child)}</span>
                        <span className="dash-apps-main">
                          <strong>{child}</strong>
                          <small>{[row.grade, row.campus].filter(Boolean).join(" · ") || row.parent_name || "Details pending"}</small>
                        </span>
                        <span className={`app-status app-status-${info.tone}`}>{info.label}</span>
                        <time dateTime={row.created_at}>{timeAgo(row.created_at)}</time>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="dash-empty">
                <i className="fa-regular fa-folder-open" aria-hidden="true" />
                <p>No applications yet.</p>
              </div>
            )}
          </section>

          <section className="dash-panel">
            <header className="dash-panel-head">
              <div>
                <h2>Recent stories</h2>
                <p>News, blog and alumni stories, most recently edited first.</p>
              </div>
              <Link href="/admin/stories">All stories</Link>
            </header>
            {recentStories.length ? (
              <ul className="dash-stories">
                {recentStories.map((item) => {
                  const href = item.id ? `/admin/stories/${item.table}/${item.id}` : item.href;
                  const when = item.updatedAt || item.publishedAt;
                  return (
                    <li key={item.key}>
                      <span className="dash-story-thumb">
                        {item.image ? <img src={item.image} alt="" loading="lazy" /> : <i className="fa-solid fa-newspaper" aria-hidden="true" />}
                      </span>
                      <span className="dash-story-main">
                        <Link href={href}>{item.title}</Link>
                        <small>
                          <span className="dash-story-type">{STORY_SOURCES[item.source].label}</span>
                          {when ? ` · ${item.updatedAt ? "Edited" : "Published"} ${timeAgo(kampalaIso(when)!)}` : ""}
                        </small>
                      </span>
                      <StoryStatusBadge status={item.status} at={item.publishedAt} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="dash-empty">
                <i className="fa-regular fa-newspaper" aria-hidden="true" />
                <p>No stories yet. Use “New story” to publish the first one.</p>
              </div>
            )}
          </section>
        </div>

        <div className="dash-col">
          <section className="dash-panel">
            <header className="dash-panel-head">
              <div>
                <h2>Inbox</h2>
                <p>{unreadMessages ? `${unreadMessages} unread` : "No unread messages"}</p>
              </div>
              <Link href="/admin/inbox/messages">Open inbox</Link>
            </header>
            {messages.length ? (
              <ul className="dash-inbox">
                {messages.map((message) => (
                  <li key={message.id} className={message.read ? "" : "is-unread"}>
                    <Link href="/admin/inbox/messages">
                      <span className="dash-avatar is-light" aria-hidden="true">{initials(message.name || message.email)}</span>
                      <span className="dash-inbox-main">
                        <span className="dash-inbox-top">
                          <strong>{message.name || message.email}</strong>
                          <time dateTime={message.created_at}>{timeAgo(message.created_at)}</time>
                        </span>
                        <span className="dash-inbox-text">
                          {message.subject ? <em>{message.subject} · </em> : null}
                          {message.message}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dash-empty">
                <i className="fa-regular fa-envelope-open" aria-hidden="true" />
                <p>No messages yet.</p>
              </div>
            )}
          </section>

          <section className="dash-panel">
            <header className="dash-panel-head">
              <div>
                <h2>Coming up</h2>
                <p>Events on the school calendar.</p>
              </div>
              <Link href="/admin/content/events">Manage</Link>
            </header>
            {upcoming.length ? (
              <ul className="dash-events">
                {upcoming.slice(0, 3).map((event) => {
                  const day = eventDay(event.starts_on!.slice(0, 10));
                  return (
                    <li key={event.id ?? event.slug}>
                      <span className="dash-date" aria-hidden="true">
                        <span>{day.month}</span>
                        <strong>{day.day}</strong>
                      </span>
                      <span className="dash-events-main">
                        <strong>{event.title}</strong>
                        <small>{[day.weekday, event.start_time?.slice(0, 5), event.location].filter(Boolean).join(" · ")}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="dash-empty">
                <i className="fa-regular fa-calendar" aria-hidden="true" />
                <p>No upcoming events. Add one so families can plan ahead.</p>
              </div>
            )}
          </section>

          <section className="dash-panel">
            <header className="dash-panel-head">
              <div>
                <h2>Website content</h2>
                <p>Jump straight to any section.</p>
              </div>
            </header>
            <div className="dash-library">
              {library.map((item) => (
                <Link key={item.label} href={item.href}>
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
