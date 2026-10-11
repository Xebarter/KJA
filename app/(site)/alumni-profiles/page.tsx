import { Banner, PeopleGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni Profiles" };

export default async function AlumniProfilesPage() {
  const content = await getContent();
  return <main><Banner title="Alumni Profiles" crumbs="Alumni" /><div className="container py-5"><PeopleGrid items={content.alumni_profiles} hrefBase="/alumni-profiles" /></div></main>;
}
