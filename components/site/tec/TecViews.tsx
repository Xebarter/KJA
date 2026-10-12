import { Fragment } from "react";
import {
  formatCompact,
  formatDate,
  formatDateAuto,
  formatHm,
  formatTime,
  MONTHS,
  MONTHS_SHORT,
  parseYmd,
  roundToHalfHour,
  scheduleDetails,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  type CalEvent,
  type DayView,
  type ListView,
  type Message,
  type MonthDay,
  type MonthView,
} from "@/lib/events-calendar";
import type { EventSingle } from "@/lib/events-single";
import { TecContainer, TecDatepicker, TecSubscribeScope, type DatepickerLabels } from "./TecClient";
import {
  CalExportIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  DayIcon,
  DotIcon,
  ListIcon,
  MessagesNotFoundIcon,
  MonthIcon,
  SearchIcon,
} from "./TecIcons";

type View = ListView | MonthView | DayView;

const AFTER_HTML = "\n<!--\nThis calendar is powered by The Events Calendar.\nhttp://evnt.is/18wn\n-->\n";
const SUBSCRIBE_NAME = "Kampala+Junior+Academy+Events+Archive+-+Kampala+Junior+Academy";

function postClasses(event: CalEvent) {
  return `post-${event.id} tribe_events type-tribe_events status-publish${event.image ? " has-post-thumbnail" : ""} hentry`;
}

function Schedule({ event, today }: { event: CalEvent; today: string }) {
  const parts = scheduleDetails(event, today);
  return (
    <>
      <span className="tribe-event-date-start">{parts.start}</span>
      {parts.end ? (
        <>
          {parts.separator}
          <span className={parts.endClass}>{parts.end}</span>
        </>
      ) : null}
    </>
  );
}

function EventLink({ event, className }: { event: CalEvent; className: string }) {
  return (
    <a href={event.href} title={event.title} rel="bookmark" className={className}>
      {event.title}
    </a>
  );
}

/* ---------- Header ---------- */

function Messages({ messages, extraClass }: { messages: Message[]; extraClass: string }) {
  return (
    <div className={`tribe-events-header__messages tribe-events-c-messages tribe-common-b2 ${extraClass}`}>
      {messages.map((message) => (
        <div key={message.key} className="tribe-events-c-messages__message tribe-events-c-messages__message--notice" tabIndex={0} role="alert" aria-live="assertive">
          {message.icon ? (
            <>
              <MessagesNotFoundIcon />
              <span className="tribe-common-a11y-visual-hide">Notice</span>
            </>
          ) : null}
          <div data-key={message.key} dangerouslySetInnerHTML={{ __html: message.html }} />
        </div>
      ))}
    </div>
  );
}

const VIEW_LINKS = [
  { slug: "list", label: "List", href: "/events/list", aria: "Display Events in List View" },
  { slug: "month", label: "Month", href: "/events/month", aria: "Display Events in Month View" },
  { slug: "day", label: "Day", href: "/events/today", aria: "Display Events in Day View" },
] as const;

function ViewIcon({ slug, className, clipId }: { slug: View["kind"]; className: string; clipId: string }) {
  if (slug === "list") return <ListIcon className={className} clipId={clipId} />;
  if (slug === "month") return <MonthIcon className={className} />;
  return <DayIcon className={className} />;
}

function EventsBar({ view }: { view: View }) {
  const current = VIEW_LINKS.find((link) => link.slug === view.kind)!;
  return (
    <div className="tribe-events-header__events-bar tribe-events-c-events-bar tribe-events-c-events-bar--border" data-js="tribe-events-events-bar">
      <h2 className="tribe-common-a11y-visual-hide">Events Search and Views Navigation</h2>
      <button className="tribe-events-c-events-bar__search-button" aria-controls="tribe-events-search-container" aria-expanded="false" data-js="tribe-events-search-button">
        <SearchIcon className="tribe-events-c-events-bar__search-button-icon-svg" />
        <span className="tribe-events-c-events-bar__search-button-text tribe-common-a11y-visual-hide">Search</span>
      </button>
      <div className="tribe-events-c-events-bar__search-container" id="tribe-events-search-container" data-js="tribe-events-search-container">
        <div className="tribe-events-c-events-bar__search" id="tribe-events-events-bar-search" data-js="tribe-events-events-bar-search">
          <form className="tribe-events-c-search tribe-events-c-events-bar__search-form" method="get" data-js="tribe-events-view-form" role="search">
            <input type="hidden" name="tribe-events-views[url]" value={view.url} />
            <div className="tribe-events-c-search__input-group">
              <div className="tribe-common-form-control-text tribe-events-c-search__input-control tribe-events-c-search__input-control--keyword" data-js="tribe-events-events-bar-input-control">
                <label className="tribe-common-form-control-text__label" htmlFor="tribe-events-events-bar-keyword">Enter Keyword. Search for Events by Keyword.</label>
                <input
                  className="tribe-common-form-control-text__input tribe-events-c-search__input"
                  data-js="tribe-events-events-bar-input-control-input"
                  type="text"
                  id="tribe-events-events-bar-keyword"
                  name="tribe-events-views[tribe-bar-search]"
                  defaultValue={view.keyword}
                  placeholder="Search for events"
                  aria-label="Enter Keyword. Search for events by Keyword."
                />
                <SearchIcon className="tribe-events-c-search__input-control-icon-svg" />
              </div>
            </div>
            <button className="tribe-common-c-btn tribe-events-c-search__button" type="submit" name="submit-bar">Find Events</button>
          </form>
        </div>
      </div>
      <div className="tribe-events-c-events-bar__views">
        <h3 className="tribe-common-a11y-visual-hide">Event Views Navigation</h3>
        <div className="tribe-events-c-view-selector tribe-events-c-view-selector--labels tribe-events-c-view-selector--tabs" data-js="tribe-events-view-selector">
          <button className="tribe-events-c-view-selector__button tribe-common-c-btn__clear" data-js="tribe-events-view-selector-button" aria-current="true" aria-description="Select Calendar View">
            <span className="tribe-events-c-view-selector__button-icon">
              <ViewIcon slug={current.slug} className="tribe-events-c-view-selector__button-icon-svg" clipId="tribe-events-c-view-selector__button-icon-svg" />
            </span>
            <span className="tribe-events-c-view-selector__button-text tribe-common-a11y-visual-hide">{current.label}</span>
            <CaretDownIcon className="tribe-events-c-view-selector__button-icon-caret-svg" />
          </button>
          <div className="tribe-events-c-view-selector__content" id="tribe-events-view-selector-content" data-js="tribe-events-view-selector-list-container">
            <ul className="tribe-events-c-view-selector__list">
              {VIEW_LINKS.map((link) => {
                const active = link.slug === view.kind;
                return (
                  <li key={link.slug} className={`tribe-events-c-view-selector__list-item tribe-events-c-view-selector__list-item--${link.slug}${active ? " tribe-events-c-view-selector__list-item--active" : ""}`}>
                    <a href={link.href} className="tribe-events-c-view-selector__list-item-link" data-js="tribe-events-view-link" aria-label={link.aria} aria-current={active ? "true" : undefined}>
                      <span className="tribe-events-c-view-selector__list-item-icon">
                        <ViewIcon slug={link.slug} className="tribe-events-c-view-selector__list-item-icon-svg" clipId="tribe-events-c-view-selector__list-item-icon-svg" />
                      </span>
                      <span className="tribe-events-c-view-selector__list-item-text">{link.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const NAV_ICON_CLASS = "tribe-common-c-btn-icon__icon-svg tribe-events-c-top-bar__nav-link-icon-svg";

function TopBarNavItem({ dir, url, label, noindex }: { dir: "prev" | "next"; url: string; label: string; noindex?: boolean }) {
  const caret = dir === "prev" ? "left" : "right";
  const className = `tribe-common-c-btn-icon tribe-common-c-btn-icon--caret-${caret} tribe-events-c-top-bar__nav-link tribe-events-c-top-bar__nav-link--${dir}`;
  const icon = dir === "prev" ? <CaretLeftIcon className={NAV_ICON_CLASS} /> : <CaretRightIcon className={NAV_ICON_CLASS} />;
  return (
    <li className="tribe-events-c-top-bar__nav-list-item">
      {url ? (
        <a href={url} className={className} aria-label={label} title={label} data-js="tribe-events-view-link" rel={noindex ? "noindex" : undefined}>
          {icon}
        </a>
      ) : (
        <button className={className} aria-label={label} title={label} disabled>
          {icon}
        </button>
      )}
    </li>
  );
}

function TopBar({ view, labels, inputValue, selectedDate, today }: { view: View; labels: DatepickerLabels; inputValue: string; selectedDate: string; today: string }) {
  const month = view.kind === "month";
  const day = view.kind === "day";
  const navLabel = month ? "Events Pagination" : "Top events list pagination";
  const prevLabel = month ? "Previous month" : day ? "Previous day" : "Previous Events";
  const nextLabel = month ? "Next month" : day ? "Next day" : "Next Events";
  return (
    <div className="tribe-events-c-top-bar tribe-events-header__top-bar">
      <nav className="tribe-events-c-top-bar__nav tribe-common-a11y-hidden" aria-label={navLabel}>
        <ul className="tribe-events-c-top-bar__nav-list">
          <TopBarNavItem dir="prev" url={view.prevUrl} label={prevLabel} noindex={day} />
          <TopBarNavItem dir="next" url={view.nextUrl} label={nextLabel} noindex={day} />
        </ul>
      </nav>
      <a
        href={view.todayUrl}
        className="tribe-common-c-btn-border-small tribe-events-c-top-bar__today-button tribe-common-a11y-hidden"
        data-js="tribe-events-view-link"
        aria-description={month ? "Click to select the current month" : "Click to select today's date"}
      >
        {month ? "This Month" : "Today"}
      </a>
      <TecDatepicker kind={view.kind} keyword={view.keyword} labels={labels} inputValue={inputValue} selectedDate={selectedDate} today={today} />
      <div className="tribe-events-c-top-bar__actions tribe-common-a11y-hidden"></div>
    </div>
  );
}

function ViewHeader({ view, title, labels, inputValue, selectedDate, today, messages }: { view: View; title: string | null; labels: DatepickerLabels; inputValue: string; selectedDate: string; today: string; messages: Message[] }) {
  return (
    <header className="tribe-events-header tribe-events-header--has-event-search">
      {title ? (
        <div className="tribe-events-header__content-title">
          <h1 className="screen-reader-text tec-a11y-title-hidden">{title}</h1>
        </div>
      ) : null}
      {messages.length ? (
        <>
          <Messages messages={messages} extraClass="tribe-common-c-loader__dot tribe-common-c-loader__dot--third" />
          <Messages messages={messages} extraClass="tribe-events-header__messages--mobile" />
        </>
      ) : null}
      <EventsBar view={view} />
      <TopBar view={view} labels={labels} inputValue={inputValue} selectedDate={selectedDate} today={today} />
    </header>
  );
}

/* ---------- Shared footer pieces ---------- */

function BottomNav({ className, ariaLabel, prev, today, next }: {
  className: string;
  ariaLabel?: string;
  prev: { url: string; label: string; content: React.ReactNode; extraClass?: string };
  today?: { url: string; label: string; text: string };
  next: { url: string; label: string; content: React.ReactNode; extraClass?: string };
}) {
  const prevClass = `tribe-events-c-nav__prev tribe-common-b2${prev.extraClass || ""}`;
  const nextClass = `tribe-events-c-nav__next tribe-common-b2${next.extraClass || ""}`;
  return (
    <nav className={`${className} tribe-events-c-nav`} aria-label={ariaLabel}>
      <ul className="tribe-events-c-nav__list">
        <li className="tribe-events-c-nav__list-item tribe-events-c-nav__list-item--prev">
          {prev.url ? (
            <a href={prev.url} rel="prev" className={prevClass} data-js="tribe-events-view-link" aria-label={prev.label} title={prev.label}>
              {prev.content}
            </a>
          ) : (
            <button className={prevClass} aria-label={prev.label} title={prev.label} disabled>
              {prev.content}
            </button>
          )}
        </li>
        {today ? (
          <li className="tribe-events-c-nav__list-item tribe-events-c-nav__list-item--today">
            <a href={today.url} className="tribe-events-c-nav__today tribe-common-b2" data-js="tribe-events-view-link" aria-label={today.label} title={today.label}>
              {today.text}
            </a>
          </li>
        ) : null}
        <li className="tribe-events-c-nav__list-item tribe-events-c-nav__list-item--next">
          {next.url ? (
            <a href={next.url} rel="next" className={nextClass} data-js="tribe-events-view-link" aria-label={next.label} title={next.label}>
              {next.content}
            </a>
          ) : (
            <button className={nextClass} aria-label={next.label} title={next.label} disabled>
              {next.content}
            </button>
          )}
        </li>
      </ul>
    </nav>
  );
}

function SubscribeDropdown({ view }: { view: View }) {
  const exportUrl = view.url;
  const outlookIcs = `${exportUrl}${exportUrl.includes("?") ? "&" : "?"}outlook-ical=1`;
  const ics = `${exportUrl}${exportUrl.includes("?") ? "&" : "?"}ical=1`;
  const feedDate = view.kind === "list" ? view.barDate : view.kind === "day" ? view.feedDate : null;
  const webcal = `webcal://kja.ug/?post_type=tribe_events${feedDate ? `&tribe-bar-date=${feedDate}` : ""}&ical=1&eventDisplay=list`;
  const feed = encodeURIComponent(webcal);
  const links = [
    { key: "gcal", label: "Google Calendar", href: `https://www.google.com/calendar/render?cid=${feed}` },
    { key: "ical", label: "iCalendar", href: webcal },
    { key: "outlook-365", label: "Outlook 365", href: `https://outlook.office.com/owa?path=/calendar/action/compose&rru=addsubscription&url=${feed}&name=${SUBSCRIBE_NAME}` },
    { key: "outlook-live", label: "Outlook Live", href: `https://outlook.live.com/owa?path=/calendar/action/compose&rru=addsubscription&url=${feed}&name=${SUBSCRIBE_NAME}` },
    { key: "ics", label: "Export .ics file", href: ics },
    { key: "outlook-ics", label: "Export Outlook .ics file", href: outlookIcs },
  ];
  return (
    <div className="tribe-events-c-subscribe-dropdown__container">
      <div className="tribe-events-c-subscribe-dropdown">
        <div className="tribe-common-c-btn-border tribe-events-c-subscribe-dropdown__button">
          <button className="tribe-events-c-subscribe-dropdown__button-text tribe-common-c-btn--clear" aria-expanded="false" aria-controls="tribe-events-subscribe-dropdown-content" aria-label="">
            Subscribe to calendar
          </button>
          <CaretDownIcon className="tribe-events-c-subscribe-dropdown__button-icon" />
        </div>
        <div id="tribe-events-c-subscribe-dropdown-content" className="tribe-events-c-subscribe-dropdown__content">
          <ul className="tribe-events-c-subscribe-dropdown__list">
            {links.map((link) => (
              <li key={link.key} className={`tribe-events-c-subscribe-dropdown__list-item tribe-events-c-subscribe-dropdown__list-item--${link.key}`}>
                <a href={link.href} className="tribe-events-c-subscribe-dropdown__list-item-link" target="_blank" rel="noopener noreferrer nofollow noindex">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ViewShell({ view, count, header, children }: { view: View; count: number; header: React.ReactNode; children: React.ReactNode }) {
  return (
    <TecContainer kind={view.kind} key={view.url}>
      <section className="tribe-common-l-container tribe-events-l-container">
        <div className="tribe-events-view-loader tribe-common-a11y-hidden" role="alert" aria-live="polite">
          <span className="tribe-events-view-loader__text tribe-common-a11y-visual-hide">{count} {count === 1 ? "event" : "events"} found.</span>
          <div className="tribe-events-view-loader__dots tribe-common-c-loader">
            <DotIcon which="first" />
            <DotIcon which="second" />
            <DotIcon which="third" />
          </div>
        </div>
        {header}
        {children}
        <div className="tribe-events-after-html" dangerouslySetInnerHTML={{ __html: AFTER_HTML }} />
      </section>
    </TecContainer>
  );
}

/* ---------- List view ---------- */

function FeaturedImage({ event, wrapperClass, imgClass, alt, link }: { event: CalEvent; wrapperClass: string; imgClass: string; alt?: string; link?: string }) {
  if (!event.image) return null;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={event.image} alt={alt ?? ""} title={alt === undefined ? event.imageTitle : undefined} className={imgClass} />
  );
  return (
    <div className={wrapperClass}>
      {link ? (
        <a href={event.href} title={event.title} rel="bookmark" className={link} tabIndex={-1} aria-hidden="true">
          {img}
        </a>
      ) : (
        img
      )}
    </div>
  );
}

function Description({ event, className }: { event: CalEvent; className: string }) {
  if (!event.description) return null;
  return (
    <div className={className}>
      <p>{event.description}</p>
    </div>
  );
}

function ListEventRow({ event, today }: { event: CalEvent; today: string }) {
  const { d } = parseYmd(event.startDate);
  return (
    <li className="tribe-common-g-row tribe-events-calendar-list__event-row">
      <div className={`tribe-events-calendar-list__event-date-tag tribe-common-g-col ${postClasses(event)}`}>
        <time className="tribe-events-calendar-list__event-date-tag-datetime" dateTime={event.startDate} aria-hidden="true">
          <span className="tribe-events-calendar-list__event-date-tag-weekday">{WEEKDAYS_SHORT[new Date(`${event.startDate}T00:00:00Z`).getUTCDay()]}</span>
          <span className="tribe-events-calendar-list__event-date-tag-daynum tribe-common-h5 tribe-common-h4--min-medium">{d}</span>
        </time>
      </div>
      <div className="tribe-events-calendar-list__event-wrapper tribe-common-g-col">
        <article className={`tribe-events-calendar-list__event tribe-common-g-row tribe-common-g-row--gutters ${postClasses(event)}`}>
          <FeaturedImage event={event} wrapperClass="tribe-events-calendar-list__event-featured-image-wrapper tribe-common-g-col" imgClass="tribe-events-calendar-list__event-featured-image" />
          <div className="tribe-events-calendar-list__event-details tribe-common-g-col">
            <header className="tribe-events-calendar-list__event-header">
              <h4 className="tribe-events-calendar-list__event-title tribe-common-h6 tribe-common-h4--min-medium">
                <EventLink event={event} className="tribe-events-calendar-list__event-title-link tribe-common-anchor-thin" />
              </h4>
              <div className="tribe-events-calendar-list__event-datetime-wrapper tribe-common-b2">
                <time className="tribe-events-calendar-list__event-datetime" dateTime={event.startDate}>
                  <Schedule event={event} today={today} />
                </time>
              </div>
            </header>
            <Description event={event} className="tribe-events-calendar-list__event-description tribe-common-b2 tribe-common-a11y-hidden" />
          </div>
        </article>
      </div>
    </li>
  );
}

function LatestPastRow({ event, today }: { event: CalEvent; today: string }) {
  const { y, m, d } = parseYmd(event.startDate);
  return (
    <div className="tribe-common-g-row tribe-events-calendar-latest-past__event-row">
      <div className="tribe-events-calendar-latest-past__event-date-tag tribe-common-g-col">
        <time className="tribe-events-calendar-latest-past__event-date-tag-datetime" dateTime={event.startDate} aria-hidden="true">
          <span className="tribe-events-calendar-latest-past__event-date-tag-month">{MONTHS_SHORT[m - 1]}</span>
          <span className="tribe-events-calendar-latest-past__event-date-tag-daynum tribe-common-h5 tribe-common-h4--min-medium">{d}</span>
          <span className="tribe-events-calendar-latest-past__event-date-tag-year">{y}</span>
        </time>
      </div>
      <div className="tribe-events-calendar-latest-past__event-wrapper tribe-common-g-col">
        <article className={`tribe-events-calendar-latest-past__event tribe-common-g-row tribe-common-g-row--gutters ${postClasses(event)}`}>
          <FeaturedImage
            event={event}
            wrapperClass="tribe-events-calendar-latest-past__event-featured-image-wrapper tribe-common-g-col"
            imgClass="tribe-events-calendar-latest-past__event-featured-image"
            link="tribe-events-calendar-latest-past__event-featured-image-link"
          />
          <div className="tribe-events-calendar-latest-past__event-details tribe-common-g-col">
            <header className="tribe-events-calendar-latest-past__event-header">
              <div className="tribe-events-calendar-latest-past__event-datetime-wrapper tribe-common-b2">
                <time className="tribe-events-calendar-latest-past__event-datetime" dateTime={event.startDate}>
                  <Schedule event={event} today={today} />
                </time>
              </div>
              <h3 className="tribe-events-calendar-latest-past__event-title tribe-common-h6 tribe-common-h4--min-medium">
                <EventLink event={event} className="tribe-events-calendar-latest-past__event-title-link tribe-common-anchor-thin" />
              </h3>
            </header>
            <Description event={event} className="tribe-events-calendar-latest-past__event-description tribe-common-b2 tribe-common-a11y-hidden" />
          </div>
        </article>
      </div>
    </div>
  );
}

export function TecListView({ view, today }: { view: ListView; today: string }) {
  const dp = view.datepicker;
  const labels: DatepickerLabels = dp.showNow
    ? { datetime: dp.startDatetime, mobile: dp.nowLabelMobile, desktop: dp.nowLabel }
    : { datetime: dp.startDatetime, mobile: dp.startMobile, desktop: dp.startLabel };
  if (dp.showEnd) labels.end = { datetime: dp.endDatetime, mobile: dp.endMobile, desktop: dp.endLabel };
  const hasEvents = view.events.length > 0;
  const showTitle = !view.latestPast.length;
  let lastMonth = "";
  const prevContent = (
    <>
      <CaretLeftIcon className="tribe-events-c-nav__prev-icon-svg" />
      <span className="tribe-events-c-nav__prev-label">
        Previous <span className="tribe-events-c-nav__prev-label-plural tribe-common-a11y-visual-hide">Events</span>
      </span>
    </>
  );
  const nextContent = (
    <>
      <span className="tribe-events-c-nav__next-label">
        Next <span className="tribe-events-c-nav__next-label-plural tribe-common-a11y-visual-hide">Events</span>
      </span>
      <CaretRightIcon className="tribe-events-c-nav__next-icon-svg" />
    </>
  );
  const showFooter = !view.latestPast.length;
  return (
    <ViewShell
      view={view}
      count={view.events.length}
      header={<ViewHeader view={view} title={showTitle ? "Events" : null} labels={labels} inputValue={dp.inputValue} selectedDate={dp.startDatetime} today={today} messages={view.messages} />}
    >
      <ul className="tribe-events-calendar-list" aria-label="List of Events">
        {view.events.map((event) => {
          const month = event.startDate.slice(0, 7);
          const separator = month !== lastMonth;
          lastMonth = month;
          const { y, m } = parseYmd(event.startDate);
          return (
            <Fragment key={event.id}>
              {separator ? (
                <li className="tribe-events-calendar-list__month-separator">
                  <h3>
                    <time className="tribe-events-calendar-list__month-separator-text tribe-common-h7 tribe-common-h6--min-medium tribe-common-h--alt">
                      {MONTHS[m - 1]} {y}
                    </time>
                  </h3>
                </li>
              ) : null}
              <ListEventRow event={event} today={today} />
            </Fragment>
          );
        })}
      </ul>
      {view.latestPast.length ? (
        <div className="tribe-events-calendar-latest-past">
          <h2 className="tribe-events-calendar-latest-past__heading tribe-common-h5 tribe-common-h3--min-medium">Latest Past Events</h2>
          {view.latestPast.map((event) => (
            <LatestPastRow key={event.id} event={event} today={today} />
          ))}
        </div>
      ) : null}
      {showFooter ? (
        <>
          <BottomNav
            className="tribe-events-calendar-list-nav"
            ariaLabel="Bottom events list pagination"
            prev={{ url: view.prevUrl, label: "Previous Events", content: prevContent, extraClass: " tribe-common-b1--min-medium" }}
            today={{ url: view.todayUrl, label: "Click to select today's date", text: "Today" }}
            next={{ url: view.nextUrl, label: "Next Events", content: nextContent, extraClass: " tribe-common-b1--min-medium" }}
          />
          <SubscribeDropdown view={view} />
        </>
      ) : null}
    </ViewShell>
  );
}

/* ---------- Month view ---------- */

function TooltipTemplate({ event, today }: { event: CalEvent; today: string }) {
  return (
    <div className="tribe-events-calendar-month__calendar-event-tooltip-template tribe-common-a11y-hidden">
      <div className="tribe-events-calendar-month__calendar-event-tooltip" id={`tribe-events-tooltip-content-${event.id}`} role="tooltip">
        {event.image ? (
          <div className="tribe-events-calendar-month__calendar-event-tooltip-featured-image-wrapper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tribe-events-calendar-month__calendar-event-tooltip-featured-image" src={event.image} alt="" />
          </div>
        ) : null}
        <div className="tribe-events-calendar-month__calendar-event-tooltip-datetime">
          <time dateTime={event.startDate}>
            <Schedule event={event} today={today} />
          </time>
        </div>
        <div className="tribe-events-calendar-month__calendar-event-tooltip-title tribe-common-h7">
          <EventLink event={event} className="tribe-events-calendar-month__calendar-event-tooltip-title-link tribe-common-anchor-thin" />
        </div>
        <Description event={event} className="tribe-events-calendar-month__calendar-event-tooltip-description tribe-common-b3" />
      </div>
    </div>
  );
}

function MultidayEvent({ event, day, today }: { event: CalEvent; day: MonthDay; today: string }) {
  const weekStart = (new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7 === 0;
  const starts = event.startDate === day.date;
  const display = starts || weekStart;
  const remainingWeek = 7 - ((new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7);
  const span = Math.min(remainingWeek, Math.round((Date.parse(`${event.endDate}T00:00:00Z`) - Date.parse(`${day.date}T00:00:00Z`)) / 86_400_000) + 1);
  const classes = [
    "tribe-events-calendar-month__multiday-event",
    postClasses(event),
    `tribe-events-calendar-month__multiday-event--width-${Math.max(1, span)}`,
    display ? "tribe-events-calendar-month__multiday-event--display" : "",
    starts ? "tribe-events-calendar-month__multiday-event--start" : "",
    event.endDate <= addDaysLocal(day.date, remainingWeek - 1) ? "tribe-events-calendar-month__multiday-event--end" : "",
    event.endDate < today ? "tribe-events-calendar-month__multiday-event--past" : "",
  ].filter(Boolean);
  const tooltipId = `tribe-events-tooltip-content-${event.id}`;
  return (
    <div className="tribe-events-calendar-month__multiday-event-wrapper">
      <article className={classes.join(" ")} data-event-id={event.id}>
        <div className="tribe-events-calendar-month__multiday-event-hidden">
          <time dateTime={event.startDate} className="tribe-common-a11y-visual-hide">{event.startDate}</time>
          <a href={event.href} className="tribe-events-calendar-month__multiday-event-hidden-link" data-js="tribe-events-tooltip" data-tooltip-content={`#${tooltipId}`} aria-describedby={tooltipId}>
            <div className="tribe-events-calendar-month__multiday-event-hidden-title tribe-common-h8">{event.title}</div>
          </a>
        </div>
        {display ? (
          <div className="tribe-events-calendar-month__multiday-event-bar">
            <div className="tribe-events-calendar-month__multiday-event-bar-inner">
              <div className="tribe-events-calendar-month__multiday-event-bar-title tribe-common-h8">{event.title}</div>
            </div>
          </div>
        ) : null}
        <TooltipTemplate event={event} today={today} />
      </article>
    </div>
  );
}

function addDaysLocal(ymd: string, days: number) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function CalendarEvent({ event, today }: { event: CalEvent; today: string }) {
  const tooltipId = `tribe-events-tooltip-content-${event.id}`;
  return (
    <article className={`tribe-events-calendar-month__calendar-event ${postClasses(event)}`}>
      <div className="tribe-events-calendar-month__calendar-event-details">
        <div className="tribe-events-calendar-month__calendar-event-datetime">
          <time dateTime={formatHm(event.startMinutes)}>{formatTime(event.startMinutes)}</time>
          {event.endMinutes !== event.startMinutes ? (
            <>
              <span className="tribe-events-calendar-month__calendar-event-datetime-separator"> - </span>
              <time dateTime={formatHm(event.endMinutes)}>{formatTime(event.endMinutes)}</time>
            </>
          ) : null}
        </div>
        <div className="tribe-events-calendar-month__calendar-event-title tribe-common-h8 tribe-common-h--alt">
          <a
            href={event.href}
            title={event.title}
            rel="bookmark"
            className="tribe-events-calendar-month__calendar-event-title-link tribe-common-anchor-thin"
            data-js="tribe-events-tooltip"
            data-tooltip-content={`#${tooltipId}`}
            aria-describedby={tooltipId}
          >
            {event.title}
          </a>
        </div>
        <TooltipTemplate event={event} today={today} />
      </div>
    </article>
  );
}

function mobileDayId(date: string) {
  const { y, m, d } = parseYmd(date);
  return `tribe-events-calendar-mobile-day-${y}-${String(m).padStart(2, "0")}-${d}`;
}

function MonthCell({ day, today }: { day: MonthDay; today: string }) {
  const { m } = parseYmd(day.date);
  const has = day.count > 0;
  const countText = `${day.count} ${day.count === 1 ? "event" : "events"}`;
  const status = day.current ? "today" : day.past ? "past day" : "upcoming day";
  const classes = [
    "tribe-events-calendar-month__day",
    day.past ? "tribe-events-calendar-month__day--past" : "",
    day.current ? "tribe-events-calendar-month__day--current" : "",
    day.otherMonth ? "tribe-events-calendar-month__day--other-month" : "",
    day.pastMonth ? "tribe-events-calendar-month__day--past-month" : "",
    day.nextMonth ? "tribe-events-calendar-month__day--next-month" : "",
  ].filter(Boolean);
  const MobileDate = has ? "h3" : "div";
  const DesktopDate = has ? "h3" : "div";
  return (
    <td className={classes.join(" ")} aria-labelledby={`tribe-events-calendar-day-${day.date}`} data-js="tribe-events-month-grid-cell">
      <button
        aria-expanded={day.current ? "true" : "false"}
        aria-controls={mobileDayId(day.date)}
        aria-label={`${MONTHS[m - 1]} ${day.dayNumber}, ${countText}, ${status}`}
        className={`tribe-events-calendar-month__day-cell tribe-events-calendar-month__day-cell--mobile${day.current ? " tribe-events-calendar-month__day-cell--selected" : ""}`}
        data-js="tribe-events-calendar-month-day-cell-mobile"
      >
        <MobileDate className="tribe-events-calendar-month__day-date tribe-common-h6 tribe-common-h--alt">
          <span className="tribe-common-a11y-visual-hide">{countText}</span>
          <time className="tribe-events-calendar-month__day-date-daynum" dateTime={day.date}>{day.dayNumber}</time>
        </MobileDate>
        {has ? <span className="tribe-events-calendar-month__mobile-events-icon tribe-events-calendar-month__mobile-events-icon--event"></span> : null}
      </button>
      <div id={`tribe-events-calendar-day-${day.date}`} className="tribe-events-calendar-month__day-cell tribe-events-calendar-month__day-cell--desktop tribe-common-a11y-hidden">
        <DesktopDate className="tribe-events-calendar-month__day-date tribe-common-h4">
          <span className="tribe-common-a11y-visual-hide">{countText}, </span>
          <time className="tribe-events-calendar-month__day-date-daynum" dateTime={day.date}>
            {has ? (
              <a href={`/events/${day.date}`} className="tribe-events-calendar-month__day-date-link" data-js="tribe-events-view-link" aria-label={formatDate(day.date, false)}>
                {day.dayNumber}
              </a>
            ) : (
              day.dayNumber
            )}
          </time>
        </DesktopDate>
        <div className="tribe-events-calendar-month__events">
          {day.allDay.map((event) => (
            <MultidayEvent key={event.id} event={event} day={day} today={today} />
          ))}
          {day.timed.map((event) => (
            <CalendarEvent key={event.id} event={event} today={today} />
          ))}
        </div>
        {day.more > 0 ? (
          <div className="tribe-events-calendar-month__more-events">
            <a href={`/events/${day.date}`} className="tribe-events-calendar-month__more-events-link tribe-common-h8 tribe-common-h--alt tribe-common-anchor-thin" data-js="tribe-events-view-link">
              + {day.more} More
            </a>
          </div>
        ) : null}
      </div>
    </td>
  );
}

function MobileDay({ day, today }: { day: MonthDay; today: string }) {
  const events = [...day.allDay, ...day.timed];
  return (
    <div className={`tribe-events-calendar-month-mobile-events__mobile-day${day.current ? " tribe-events-calendar-month-mobile-events__mobile-day--show" : ""}`} id={mobileDayId(day.date)}>
      {events.length ? (
        <>
          <div className="tribe-events-c-day-marker tribe-events-calendar-month-mobile-events__day-marker">
            <time className="tribe-events-c-day-marker__date tribe-common-h7 tribe-common-h--alt" dateTime={day.date}>
              {formatDateAuto(day.date, today)}
            </time>
          </div>
          {events.map((event) => (
            <article key={event.id} className={`tribe-events-calendar-month-mobile-events__mobile-event ${postClasses(event)}`}>
              <div className="tribe-events-calendar-month-mobile-events__mobile-event-details">
                <div className="tribe-events-calendar-month-mobile-events__mobile-event-datetime tribe-common-b2">
                  <time dateTime={event.startDate}>{event.allDay ? "All day" : <Schedule event={event} today={today} />}</time>
                </div>
                <h3 className="tribe-events-calendar-month-mobile-events__mobile-event-title tribe-common-h7">
                  <EventLink event={event} className="tribe-events-calendar-month-mobile-events__mobile-event-title-link tribe-common-anchor" />
                </h3>
              </div>
            </article>
          ))}
          {day.more > 0 ? (
            <div className="tribe-events-c-small-cta tribe-common-b3 tribe-events-calendar-month-mobile-events__more-events">
              <a href={`/events/${day.date}`} className="tribe-events-c-small-cta__link tribe-common-cta tribe-common-cta--thin-alt">
                + {day.more} More
              </a>
            </div>
          ) : null}
        </>
      ) : (
        <Messages messages={[{ key: "no-events-in-day", icon: true, html: "There are no events on this day." }]} extraClass="tribe-events-header__messages--mobile tribe-events-header__messages--day" />
      )}
    </div>
  );
}

export function TecMonthView({ view, today }: { view: MonthView; today: string }) {
  const labels: DatepickerLabels = { datetime: view.ym, mobile: view.labelMobile, desktop: view.label };
  const days = view.weeks.flat();
  const prevLabel = `Previous month, ${view.prevLabel}`;
  const nextLabel = `Next month, ${view.nextLabel}`;
  return (
    <ViewShell
      view={view}
      count={days.reduce((total, day) => total + (day.otherMonth ? 0 : day.count), 0)}
      header={<ViewHeader view={view} title="Events" labels={labels} inputValue={view.inputValue} selectedDate={`${view.ym}-01`} today={today} messages={view.messages} />}
    >
      <h2 className="tribe-common-a11y-visual-hide" id="tribe-events-calendar-header">Calendar of Events</h2>
      <table className="tribe-events-calendar-month" data-js="tribe-events-month-grid">
        <thead className="tribe-events-calendar-month__header">
          <tr>
            {[1, 2, 3, 4, 5, 6, 0].map((index) => (
              <th key={index} className="tribe-events-calendar-month__header-column" scope="col" abbr={WEEKDAYS_SHORT[index]}>
                <div className="tribe-events-calendar-month__header-column-title tribe-common-b3">
                  <span aria-hidden="true">{WEEKDAYS[index][0]}</span>
                  <span className="screen-reader-text">{WEEKDAYS[index]}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tribe-events-calendar-month__body">
          {view.weeks.map((week) => (
            <tr key={week[0].date} className="tribe-events-calendar-month__week" data-js="tribe-events-month-grid-row">
              {week.map((day) => (
                <MonthCell key={day.date} day={day} today={today} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <section className="tribe-events-calendar-month-mobile-events" data-js="tribe-events-calendar-month-mobile-events">
        {days.map((day) => (
          <MobileDay key={day.date} day={day} today={today} />
        ))}
        <BottomNav
          className="tribe-events-calendar-month-nav"
          prev={{ url: view.prevUrl, label: prevLabel, content: <><CaretLeftIcon className="tribe-events-c-nav__prev-icon-svg" />{view.prevLabel}</> }}
          today={{ url: view.todayUrl, label: "Click to select the current month", text: "This Month" }}
          next={{ url: view.nextUrl, label: nextLabel, content: <>{view.nextLabel} <CaretRightIcon className="tribe-events-c-nav__next-icon-svg" /></> }}
        />
      </section>
      <SubscribeDropdown view={view} />
    </ViewShell>
  );
}

/* ---------- Day view ---------- */

function DayEvent({ event, today }: { event: CalEvent; today: string }) {
  return (
    <article className={`tribe-common-g-row tribe-common-g-row--gutters tribe-events-calendar-day__event ${postClasses(event)}`}>
      <div className="tribe-events-calendar-day__event-content tribe-common-g-col">
        {event.image ? (
          <div className="tribe-events-calendar-day__event-featured-image-wrapper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tribe-events-calendar-day__event-featured-image" src={event.image} alt={event.imageTitle} />
          </div>
        ) : null}
        <div className="tribe-events-calendar-day__event-details">
          <header className="tribe-events-calendar-day__event-header">
            <h3 className="tribe-events-calendar-day__event-title tribe-common-h6 tribe-common-h4--min-medium">
              <EventLink event={event} className="tribe-events-calendar-day__event-title-link tribe-common-anchor-thin" />
            </h3>
            <div className="tribe-events-calendar-day__event-datetime-wrapper tribe-common-b2">
              <time className="tribe-events-calendar-day__event-datetime" dateTime={event.startDate}>
                <Schedule event={event} today={today} />
              </time>
            </div>
          </header>
          <Description event={event} className="tribe-events-calendar-day__event-description tribe-common-b2 tribe-common-a11y-hidden" />
        </div>
      </div>
    </article>
  );
}

function TypeSeparator({ text }: { text: string }) {
  return (
    <div className="tribe-events-calendar-day__type-separator">
      <span className="tribe-events-calendar-day__type-separator-text tribe-common-h7 tribe-common-h6--min-medium tribe-common-h--alt">{text}</span>
    </div>
  );
}

export function TecDayView({ view, today }: { view: DayView; today: string }) {
  const labels: DatepickerLabels = { datetime: view.date, mobile: view.labelMobile, desktop: view.label };
  let lastSlot = -1;
  const prevContent = (
    <>
      <CaretLeftIcon className="tribe-events-c-nav__prev-icon-svg" />
      Previous Day
    </>
  );
  const nextContent = (
    <>
      Next Day <CaretRightIcon className="tribe-events-c-nav__next-icon-svg" />
    </>
  );
  return (
    <ViewShell
      view={view}
      count={view.allDay.length + view.ongoing.length + view.timed.length}
      header={<ViewHeader view={view} title={`Events for ${view.label}`} labels={labels} inputValue={formatCompact(view.date)} selectedDate={view.date} today={today} messages={view.messages} />}
    >
      <div className="tribe-events-calendar-day">
        {view.allDay.length ? <TypeSeparator text="All Day" /> : null}
        {view.allDay.map((event) => (
          <DayEvent key={event.id} event={event} today={today} />
        ))}
        {view.ongoing.length ? <TypeSeparator text="Ongoing" /> : null}
        {view.ongoing.map((event) => (
          <DayEvent key={event.id} event={event} today={today} />
        ))}
        {view.timed.map((event) => {
          const slot = roundToHalfHour(event.startMinutes);
          const separator = slot !== lastSlot;
          lastSlot = slot;
          return (
            <Fragment key={event.id}>
              {separator ? (
                <div className="tribe-events-calendar-day__time-separator">
                  <time className="tribe-events-calendar-day__time-separator-text tribe-common-h7 tribe-common-h6--min-medium tribe-common-h--alt" dateTime={formatHm(slot % 1440)}>
                    {formatTime(slot % 1440)}
                  </time>
                </div>
              ) : null}
              <DayEvent event={event} today={today} />
            </Fragment>
          );
        })}
      </div>
      <BottomNav
        className="tribe-events-calendar-day-nav"
        ariaLabel="Bottom events list pagination"
        prev={{ url: view.prevUrl, label: "Previous Day", content: prevContent, extraClass: " tribe-common-b1--min-medium" }}
        next={{ url: view.nextUrl, label: "Next Day", content: nextContent, extraClass: " tribe-common-b1--min-medium" }}
      />
      <SubscribeDropdown view={view} />
    </ViewShell>
  );
}

/* ---------- Single event (single-event.php) ---------- */

const LOADING_GIF = "https://kja.ug/wp-content/plugins/the-events-calendar/src/resources/images/tribe-loading.gif";

function SingleEventNav({ single }: { single: EventSingle }) {
  return (
    <nav className="tribe-events-nav-pagination" aria-label="Event Navigation">
      <ul className="tribe-events-sub-nav">
        <li className="tribe-events-nav-previous">
          {single.prev ? <a href={single.prev.href}><span>&laquo;</span> {single.prev.title}</a> : null}
        </li>
        <li className="tribe-events-nav-next">
          {single.next ? <a href={single.next.href}>{single.next.title} <span>&raquo;</span></a> : null}
        </li>
      </ul>
    </nav>
  );
}

export function TecSingleEvent({ single, body, documentTitle, today }: { single: EventSingle; body: string; documentTitle: string; today: string }) {
  const { event } = single;
  return (
    <section id="tribe-events-pg-template" className="tribe-events-pg-template" role="main">
      <div className="tribe-events-before-html" />
      <span className="tribe-events-ajax-loading">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="tribe-events-spinner-medium" src={LOADING_GIF} alt="Loading Events" />
      </span>
      <div id="tribe-events-content" className="tribe-events-single">
        <p className="tribe-events-back">
          <a href="/events"> &laquo; All Events</a>
        </p>
        {single.passed ? (
          <div className="tribe-events-notices"><ul><li>This event has passed.</li></ul></div>
        ) : null}
        <h1 className="tribe-events-single-event-title">{event.title}</h1>
        <div className="tribe-events-schedule tribe-clearfix">
          <div><Schedule event={event} today={today} /></div>
        </div>
        <div id="tribe-events-header" data-title={documentTitle} data-viewtitle={event.title}>
          <SingleEventNav single={single} />
        </div>
        <div id={`post-${event.id}`} className={postClasses(event)}>
          {event.image ? (
            <div className="tribe-events-event-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.image} className="attachment-full size-full wp-post-image" alt="" decoding="async" fetchPriority="high" />
            </div>
          ) : null}
          <div className="tribe-events-single-event-description tribe-events-content" dangerouslySetInnerHTML={{ __html: body }} />
          <TecSubscribeScope>
            <div className="tribe-events-c-subscribe-dropdown__container">
              <div className="tribe-events-c-subscribe-dropdown">
                <div className="tribe-common-c-btn-border tribe-events-c-subscribe-dropdown__button">
                  <CalExportIcon className="tribe-events-c-subscribe-dropdown__export-icon" />
                  <button className="tribe-events-c-subscribe-dropdown__button-text" aria-expanded="false" aria-controls="tribe-events-subscribe-dropdown-content" aria-label="View links to add events to your calendar">
                    Add to calendar
                  </button>
                  <CaretDownIcon className="tribe-events-c-subscribe-dropdown__button-icon" />
                </div>
                <div id="tribe-events-subscribe-dropdown-content" className="tribe-events-c-subscribe-dropdown__content">
                  <ul className="tribe-events-c-subscribe-dropdown__list">
                    {single.links.map((link) => (
                      <li key={link.key} className={`tribe-events-c-subscribe-dropdown__list-item tribe-events-c-subscribe-dropdown__list-item--${link.key}`}>
                        <a href={link.href} className="tribe-events-c-subscribe-dropdown__list-item-link" target="_blank" rel="noopener noreferrer nofollow noindex">
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </TecSubscribeScope>
          <div className="tribe-events-single-section tribe-events-event-meta primary tribe-clearfix">
            <div className="tribe-events-meta-group tribe-events-meta-group-details">
              <h2 className="tribe-events-single-section-title"> Details </h2>
              <ul className="tribe-events-meta-list">
                {single.meta.map((item) => (
                  <li className="tribe-events-meta-item" key={item.label}>
                    <span className={`${item.labelClass} tribe-events-meta-label`}>{item.label}</span>
                    <span className="tribe-events-meta-value">
                      {item.time ? (
                        <div className={`tribe-events-abbr ${item.abbrClass}`} title={item.title}>{item.value}</div>
                      ) : (
                        <abbr className={`tribe-events-abbr ${item.abbrClass}`} title={item.title}> {item.value} </abbr>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div id="tribe-events-footer">
          <SingleEventNav single={single} />
        </div>
      </div>
      <div className="tribe-events-after-html" dangerouslySetInnerHTML={{ __html: AFTER_HTML }} />
    </section>
  );
}