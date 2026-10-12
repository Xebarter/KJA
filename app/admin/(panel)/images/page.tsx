import { ImageManager } from "@/components/admin/ImageManager";
import { catalogImages } from "@/lib/admin-images";
import { loadCampusData } from "@/lib/campus-pages";
import { getAdminContent } from "@/lib/content";

export default async function ImagesPage() {
  const content = await getAdminContent();
  const slots = catalogImages(content, loadCampusData());
  return (
    <div>
      <div className="admin-page-title">
        <div>
          <h1>Images</h1>
          <p>Replace photos and icons used across the website. Choose a page group, then upload a new file or paste a URL.</p>
        </div>
      </div>
      <ImageManager slots={slots} />
    </div>
  );
}
