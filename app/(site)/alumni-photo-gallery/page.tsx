import { Banner, GalleryGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni Photo Gallery" };

export default async function AlumniGalleryPage() {
  const content = await getContent();
  return <main><Banner title="Alumni Photo Gallery" crumbs="Alumni" /><div className="container py-5"><GalleryGrid items={content.alumni_photos} /></div></main>;
}
