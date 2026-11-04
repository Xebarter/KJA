import { redirect } from "next/navigation";
import { ACCOUNTS_BASE } from "@/lib/accounts";
import { pick } from "@/lib/students";

/** Old /payments/new URL. Recording now lives on the Payments page. */
export default async function NewPaymentRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  next.set("record", "1");
  const student = pick(params, "student");
  const family = pick(params, "family");
  const term = pick(params, "term");
  if (student) next.set("student", student);
  if (family) next.set("family", family);
  if (term) next.set("term", term);
  redirect(`${ACCOUNTS_BASE}/payments?${next.toString()}`);
}
