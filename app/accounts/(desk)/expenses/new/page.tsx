import { redirect } from "next/navigation";
import { ACCOUNTS_BASE } from "@/lib/accounts";
import { pick } from "@/lib/students";

/** Old /expenses/new URL. Adding now lives on the Expenses page. */
export default async function NewExpenseRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  next.set("add", "1");
  const edit = pick(params, "edit");
  if (edit) next.set("edit", edit);
  redirect(`${ACCOUNTS_BASE}/expenses?${next.toString()}`);
}
