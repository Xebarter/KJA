import { notFound, redirect } from "next/navigation";

export default async function InboxPage({ params }: { params: Promise<{ box: string }> }) {
  const { box } = await params;
  if (box === "applications") redirect("/admin/applications");
  notFound();
}
