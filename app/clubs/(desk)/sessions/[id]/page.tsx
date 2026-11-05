import { redirect } from "next/navigation";
import { CLUBS_BASE } from "@/lib/clubs-nav";
import { isUuid } from "@/lib/students";
import { notFound } from "next/navigation";

export default async function ClubsSessionRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  redirect(`${CLUBS_BASE}/timetable/${id}`);
}
