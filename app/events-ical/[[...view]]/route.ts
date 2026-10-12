import { getContent } from "@/lib/content";
import { kampalaClock, resolveCalendarView, toCalEvents, viewEvents } from "@/lib/events-calendar";
import { icalResponse } from "@/lib/events-ical";

export const dynamic = "force-dynamic";

/* Target of the /events/...?ical=1 and ?outlook-ical=1 rewrites in next.config.ts. */
export async function GET(request: Request, { params }: { params: Promise<{ view?: string[] }> }) {
  const [{ view: segments = [] }, content] = await Promise.all([params, getContent()]);
  const url = new URL(request.url);
  const view = resolveCalendarView(segments, Object.fromEntries(url.searchParams), toCalEvents(content.events), kampalaClock());
  if (!view) return new Response("Not found", { status: 404 });
  return icalResponse(viewEvents(view), url.toString(), url.searchParams.has("outlook-ical"));
}
