import { requireClubs } from "@/lib/clubs-access";
import { loadCrest, pdfResponse } from "@/lib/accounts-pdf";
import { loadClubTimetable } from "@/lib/club-timetable";
import { buildClubTimetablePdf } from "@/lib/club-timetable-pdf";
import { getContent } from "@/lib/content";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";

function chosenClubs(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!params.has("clubs") && !params.has("club")) return null;
  const raw = [...params.getAll("clubs"), ...params.getAll("club")]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(isUuid);
  return [...new Set(raw)];
}

export async function GET(request: Request) {
  const auth = await requireClubs("timetable", "sessions");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const clubIds = chosenClubs(request);
  if (clubIds && !clubIds.length) return new Response("Choose a club to print.", { status: 400 });
  const campus = new URL(request.url).searchParams.get("campus")?.trim() || null;
  try {
    const pack = await loadClubTimetable(auth.supabase, clubIds, campus);
    const { settings } = await getContent();
    const bytes = await buildClubTimetablePdf(pack, settings, await loadCrest(request.url));
    const club = pack.clubs.length === 1 ? `${pack.clubs[0].title}-` : "";
    const site = campus ? `${campus}-` : "";
    return pdfResponse(bytes, `KJA-club-timetable-${site}${club}${pack.generatedOn}.pdf`, true);
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "Couldn't build the club timetable.";
    return new Response(message, { status: 500 });
  }
}
