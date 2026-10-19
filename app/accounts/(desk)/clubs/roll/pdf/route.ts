import { requireAccounts } from "@/lib/accounts";
import { loadCrest, pdfResponse } from "@/lib/accounts-pdf";
import { loadClubRoll } from "@/lib/club-roll";
import { buildClubRollPdf } from "@/lib/club-roll-pdf";
import { getContent } from "@/lib/content";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";

function chosenClubs(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!params.has("clubs")) return null;
  const ids = [...new Set(params.getAll("clubs").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(isUuid))];
  return ids;
}

export async function GET(request: Request) {
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const clubIds = chosenClubs(request);
  if (clubIds && !clubIds.length) return new Response("Choose a club to print.", { status: 400 });
  try {
    const roll = await loadClubRoll(auth.supabase, clubIds);
    const { settings } = await getContent();
    const bytes = await buildClubRollPdf(roll, settings, await loadCrest(request.url));
    const club = roll.clubs.length === 1 ? `${roll.clubs[0].title}-` : "";
    return pdfResponse(bytes, `KJA-club-roll-${club}${roll.termLabel}.pdf`, true);
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "Couldn't build the club roll.";
    const status = /current term/i.test(message) ? 400 : 500;
    return new Response(message, { status });
  }
}
