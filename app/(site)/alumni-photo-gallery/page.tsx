import { AlumniGalleryView } from "@/components/site/AlumniViews";
import { alumniPhotos } from "@/lib/alumni";
import { getContent } from "@/lib/content";

export const metadata = {
  title: "Alumni Photo Gallery",
  description: "Photos of Kampala Junior Academy alumni: reunions, visits and milestones.",
};

export default async function AlumniGalleryPage() {
  const content = await getContent();
  return <AlumniGalleryView photos={alumniPhotos(content.alumni_photos)} email={content.settings.email} />;
}
