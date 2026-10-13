import type { Metadata } from "next";
import { ClubPage } from "@/components/site/ClubPage";
import { composeClubPage } from "@/lib/club-pages";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/newsroom";

export async function generateMetadata(): Promise<Metadata> {
  const { page, title, lede, hero } = composeClubPage(await getContent(), "sports");
  const description = page?.seo_description || lede;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/sports` },
    openGraph: { title: `${title} | Kampala Junior Academy`, description, type: "website", images: hero ? [{ url: hero }] : undefined },
  };
}

export default async function SportsClubsPage() {
  return <ClubPage data={composeClubPage(await getContent(), "sports")} />;
}
