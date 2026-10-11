import { ApplicationForm } from "@/components/site/Forms";
import { Banner, Prose } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

export const metadata = { title: "Apply to Enroll" };

export default async function ApplyPage() {
  const content = await getContent();
  const intro = findBySlug(content.pages, "apply");
  return (
    <main>
      <Banner title={intro?.title || "Apply to Enroll"} />
      <div className="container py-5">
        <div className="row g-4">
          <div className="col-lg-7"><Prose html={intro?.body} /></div>
          <div className="col-lg-5"><ApplicationForm campuses={content.campuses} /></div>
        </div>
      </div>
    </main>
  );
}
