import type { Metadata } from "next";
import { ClubPage } from "@/components/site/ClubPage";
import { composeClubPage } from "@/lib/club-pages";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/newsroom";

export async function generateMetadata(): Promise<Metadata> {
  const { page, title, lede, hero } = composeClubPage(await getContent(), "music");
  const description = page?.seo_description || lede;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/music` },
    openGraph: { title: `${title} | Kampala Junior Academy`, description, type: "website", images: hero ? [{ url: hero }] : undefined },
  };
}

export default async function MusicPage() {
  return <ClubPage data={composeClubPage(await getContent(), "music")} />;
}
