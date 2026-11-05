import { redirect } from "next/navigation";
import { CLUBS_BASE } from "@/lib/clubs-nav";

export default async function ClubsSessionsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const params = await searchParams;
  const query = params.club ? `?club=${encodeURIComponent(params.club)}` : "";
  redirect(`${CLUBS_BASE}/timetable${query}`);
}
