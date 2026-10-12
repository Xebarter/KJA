import { redirect } from "next/navigation";

export default async function AccountLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const query = new URLSearchParams({ login: "1" });
  if (next) query.set("next", next);
  redirect(`/?${query.toString()}`);
}
