import { redirect } from "next/navigation";

export default async function MessagesRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = Array.isArray(value) ? value[0] : value;
    if (text) query.set(key, text);
  }
  const suffix = query.toString();
  redirect(suffix ? `/admin/inbox/enquiries?${suffix}` : "/admin/inbox/enquiries");
}
