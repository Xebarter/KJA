import { NextResponse } from "next/server";
import { EMPTY_OFFICE_BADGES, loadOfficeBadges, loadOfficePerson } from "@/lib/office-badges";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Lightweight badge + person payload for the admissions shell. Does not block layout. */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ badges: EMPTY_OFFICE_BADGES, person: null });
  }
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ badges: EMPTY_OFFICE_BADGES, person: null }, { status: 401 });
  }
  const [badges, person] = await Promise.all([
    loadOfficeBadges(supabase, user.id),
    loadOfficePerson(supabase, user),
  ]);
  return NextResponse.json(
    { badges, person },
    { headers: { "Cache-Control": "private, max-age=15" } },
  );
}
