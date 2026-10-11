import { ContactForm } from "@/components/site/Forms";
import { Banner, Prose } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

export const metadata = { title: "Contact us" };

export default async function ContactPage() {
  const content = await getContent();
  const intro = findBySlug(content.pages, "contact-us");
  return (
    <main>
      <Banner title="Contact us" />
      <div className="container py-5">
        <div className="row g-4">
          <div className="col-lg-7">
            <p>{content.settings.address}</p>
            <p><a href={`mailto:${content.settings.email}`}>{content.settings.email}</a></p>
            <p><a href={`tel:${content.settings.phone.replace(/\s/g, "")}`}>{content.settings.phone}</a></p>
            <Prose html={intro?.body} />
          </div>
          <div className="col-lg-5"><ContactForm /></div>
        </div>
      </div>
    </main>
  );
}
