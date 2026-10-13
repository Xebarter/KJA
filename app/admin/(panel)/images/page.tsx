import { ImageManager } from "@/components/admin/ImageManager";
import { catalogImages } from "@/lib/admin-images";
import { loadCampusData } from "@/lib/campus-pages";
import { getAdminContent } from "@/lib/content";
import "./images.css";

export const metadata = { title: "Images" };

export default async function ImagesPage() {
  const content = await getAdminContent();
  const slots = catalogImages(content, loadCampusData());
  return (
    <div className="dash img-page">
      <ImageManager slots={slots} />
    </div>
  );
}
