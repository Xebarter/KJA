import { Banner, PeopleGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Teachers" };

export default async function TeachersPage() {
  const content = await getContent();
  return <main><Banner title="Our Teachers" /><div className="container py-5"><PeopleGrid items={content.teachers} hrefBase="/teacher" /></div></main>;
}
