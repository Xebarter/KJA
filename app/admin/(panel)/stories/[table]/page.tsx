import { redirect } from "next/navigation";
import { sourceForTable } from "@/lib/newsroom";

export default async function StoryTypeRedirect({ params }: { params: Promise<{ table: string }> }) {
  const source = sourceForTable((await params).table);
  redirect(source ? `/admin/stories?type=${source}` : "/admin/stories");
}
