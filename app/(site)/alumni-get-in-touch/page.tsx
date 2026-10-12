import { notFound } from "next/navigation";
import { AlumniTouchForm } from "@/components/site/Cf7Forms";
import { WpPageView } from "@/components/site/WpPageView";
import { findBySlug, getContent } from "@/lib/content";

export const metadata = { title: "alumni get in touch" };

export default async function AlumniContactPage() {
  const content = await getContent();
  const page = findBySlug(content.pages, "alumni-get-in-touch");
  if (!page) notFound();
  return <WpPageView page={page} news={content.news} events={content.events} form={<AlumniTouchForm />} />;
}
