import { ContactForm } from "@/components/site/Forms";
import { Banner, Prose } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

export const metadata = { title: "Alumni get in touch" };

export default async function AlumniContactPage() {
  const intro = findBySlug((await getContent()).pages, "alumni-get-in-touch");
  return (
    <main>
      <Banner title={intro?.title || "Get in touch"} crumbs="Alumni" />
      <div className="container py-5">
        <div className="row g-4">
          <div className="col-lg-7"><Prose html={intro?.body} /></div>
          <div className="col-lg-5"><ContactForm subject="Alumni" heading="Alumni message" /></div>
        </div>
      </div>
    </main>
  );
}
