import type { Metadata } from "next";
import { AboutView } from "@/components/site/AboutView";
import { composeAbout, FOUNDED } from "@/lib/about";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/newsroom";

const FALLBACK_DESCRIPTION =
  "Since 1993, Kampala Junior Academy has offered daycare, nursery and primary education across Kampala, nurturing confident, curious and caring learners.";

export async function generateMetadata(): Promise<Metadata> {
  const { page } = composeAbout(await getContent());
  const description = page?.seo_description || FALLBACK_DESCRIPTION;
  return {
    title: "About Us",
    description,
    alternates: { canonical: `${SITE_URL}/about-us` },
    openGraph: {
      title: "About Kampala Junior Academy",
      description,
      type: "website",
      images: [{ url: "/images/hero07.jpg" }],
    },
  };
}

export default async function AboutPage() {
  const content = await getContent();
  const data = composeAbout(content);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${SITE_URL}/about-us`,
    name: "About Kampala Junior Academy",
    description: data.page?.seo_description || FALLBACK_DESCRIPTION,
    mainEntity: {
      "@type": "School",
      name: "Kampala Junior Academy",
      alternateName: "KJA",
      url: SITE_URL,
      logo: `${SITE_URL}/images/kja-logo.png`,
      foundingDate: String(FOUNDED),
      founder: { "@type": "Person", name: "Mary Mulumba" },
      telephone: data.phone || undefined,
      email: data.email || undefined,
      address: data.address ? { "@type": "PostalAddress", streetAddress: data.address, addressLocality: "Kampala", addressCountry: "UG" } : undefined,
      sameAs: data.socials.map((social) => social.href).filter((href) => /^https?:/.test(href)),
      department: data.campuses.map((campus) => ({ "@type": "School", name: `Kampala Junior Academy – ${campus.title}`, url: `${SITE_URL}/branch/${campus.slug}` })),
    },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <AboutView data={data} />
    </>
  );
}
