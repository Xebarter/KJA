import { NextResponse } from "next/server";
import { EMPTY_ACADEMICS_BADGES, loadAcademicsBadges, loadAcademicsPerson } from "@/lib/academics-badges";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Lightweight badge + person payload for the academics shell. Does not block layout. */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ badges: EMPTY_ACADEMICS_BADGES, person: null, office: true });
  }
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ badges: EMPTY_ACADEMICS_BADGES, person: null, office: true }, { status: 401 });
  }
  const [badges, profile] = await Promise.all([
    loadAcademicsBadges(supabase, user.id),
    loadAcademicsPerson(supabase, user),
  ]);
  return NextResponse.json(
    { badges, person: profile.person, office: profile.office },
    { headers: { "Cache-Control": "private, max-age=15" } },
  );
}
