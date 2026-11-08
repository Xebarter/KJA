import { redirect } from "next/navigation";
import { CLUBS_BASE } from "@/lib/clubs-nav";

export default async function ClubsReceiptsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  const qs = query.toString();
  redirect(qs ? `${CLUBS_BASE}/accounts?${qs}` : `${CLUBS_BASE}/accounts`);
}
