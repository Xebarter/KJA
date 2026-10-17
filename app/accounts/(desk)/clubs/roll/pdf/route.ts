import { requireAccounts } from "@/lib/accounts";
import { loadCrest, pdfResponse } from "@/lib/accounts-pdf";
import { loadClubRoll } from "@/lib/club-roll";
import { buildClubRollPdf } from "@/lib/club-roll-pdf";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  try {
    const roll = await loadClubRoll(auth.supabase);
    const { settings } = await getContent();
    const bytes = await buildClubRollPdf(roll, settings, await loadCrest(request.url));
    return pdfResponse(bytes, `KJA-club-roll-${roll.termLabel}.pdf`, true);
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "Couldn't build the club roll.";
    const status = /current term/i.test(message) ? 400 : 500;
    return new Response(message, { status });
  }
}
