import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampusView } from "@/components/site/CampusView";
import { composeCampus } from "@/lib/campus-profile";
import { findBySlug, getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/newsroom";
import { renderOnFirstVisit } from "@/lib/site-cache";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const content = await getContent();
  const campus = findBySlug(content.campuses, (await params).slug);
  if (!campus) return { title: "Campus" };
  const profile = composeCampus(campus, content);
  const title = `KJA ${profile.name} Campus`;
  const description = campus.seo_description || profile.summary || undefined;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/branch/${campus.slug}` },
    openGraph: {
      title: `${title} | Kampala Junior Academy`,
      description,
      type: "website",
      images: profile.heroImages[0] ? [{ url: profile.heroImages[0] }] : undefined,
    },
  };
}

export default async function CampusPage({ params }: Params) {
  const { slug } = await params;
  const content = await getContent();
  const campus = findBySlug(content.campuses, slug);
  if (!campus) notFound();

  const profile = composeCampus(campus, content);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "School",
    name: `Kampala Junior Academy – ${profile.name}`,
    url: `${SITE_URL}/branch/${slug}`,
    description: profile.summary || undefined,
    image: profile.heroImages.slice(0, 3),
    telephone: profile.phones[0] || undefined,
    email: profile.email || undefined,
    address: profile.address ? { "@type": "PostalAddress", streetAddress: profile.address, addressLocality: "Kampala", addressCountry: "UG" } : undefined,
    parentOrganization: { "@type": "School", name: "Kampala Junior Academy", url: SITE_URL },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <CampusView profile={profile} />
    </>
  );
}

export const generateStaticParams = renderOnFirstVisit;
