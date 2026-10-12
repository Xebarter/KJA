import { findBySlug, getContent } from "@/lib/content";
import { toCalEvents } from "@/lib/events-calendar";
import { icalResponse } from "@/lib/events-ical";

export const dynamic = "force-dynamic";

/* Target of the /event/:slug?ical=1 and ?outlook-ical=1 rewrites in next.config.ts. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, content] = await Promise.all([params, getContent()]);
  const item = findBySlug(content.events, slug);
  const event = item ? toCalEvents([item])[0] : undefined;
  if (!event) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  return icalResponse([event], url.toString(), url.searchParams.has("outlook-ical"));
}
