import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TecDayView, TecListView, TecMonthView } from "@/components/site/tec/TecViews";
import { getContent } from "@/lib/content";
import { kampalaClock, resolveCalendarView, toCalEvents, type CalendarQuery } from "@/lib/events-calendar";

type Props = { params: Promise<{ view?: string[] }>; searchParams: Promise<CalendarQuery> };

async function loadView({ params, searchParams }: Props) {
  const [{ view: segments = [] }, query, content] = await Promise.all([params, searchParams, getContent()]);
  const clock = kampalaClock();
  return { clock, view: resolveCalendarView(segments, query, toCalEvents(content.events), clock) };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { view } = await loadView(props);
  return { title: view?.pageTitle || "Events" };
}

export default async function EventsCalendarPage(props: Props) {
  const { view, clock } = await loadView(props);
  if (!view) notFound();
  if (view.kind === "month") return <TecMonthView view={view} today={clock.today} />;
  if (view.kind === "day") return <TecDayView view={view} today={clock.today} />;
  return <TecListView view={view} today={clock.today} />;
}
