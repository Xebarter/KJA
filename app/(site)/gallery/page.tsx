import type { Metadata } from "next";
import { GalleryView } from "@/components/site/GalleryView";
import { getContent } from "@/lib/content";
import { galleryPhotos } from "@/lib/gallery";
import "../gallery.css";

export const metadata: Metadata = {
  title: "Photo Gallery",
  description: "Photos of sports days, trips, fairs, celebrations and classroom life across Kampala Junior Academy campuses.",
};

export default async function GalleryPage() {
  const content = await getContent();
  return (
    <GalleryView
      photos={galleryPhotos(content.gallery)}
      campusCount={content.campuses.length}
      socials={content.settings.socials}
      email={content.settings.email}
    />
  );
}
