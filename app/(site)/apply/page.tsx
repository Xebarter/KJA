import { notFound } from "next/navigation";
import { ApplyForm } from "@/components/site/Cf7Forms";
import { WpPageView } from "@/components/site/WpPageView";
import { findBySlug, getContent } from "@/lib/content";

export const metadata = { title: "Apply to Enroll" };

export default async function ApplyPage() {
  const content = await getContent();
  const page = findBySlug(content.pages, "apply");
  if (!page) notFound();
  return <WpPageView page={page} news={content.news} events={content.events} form={<ApplyForm />} />;
}
