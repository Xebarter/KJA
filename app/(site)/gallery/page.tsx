import { Banner, GalleryGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Gallery" };

export default async function GalleryPage() {
  const content = await getContent();
  return <main><Banner title="Gallery" /><div className="container py-5"><GalleryGrid items={content.gallery} /></div></main>;
}
