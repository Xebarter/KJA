import { notFound } from "next/navigation";
import { ContactUsForm } from "@/components/site/Cf7Forms";
import { WpPageView } from "@/components/site/WpPageView";
import { findBySlug, getContent } from "@/lib/content";

export const metadata = { title: "Contact us" };

export default async function ContactPage() {
  const content = await getContent();
  const page = findBySlug(content.pages, "contact-us");
  if (!page) notFound();
  return <WpPageView page={page} news={content.news} events={content.events} form={<ContactUsForm />} />;
}
