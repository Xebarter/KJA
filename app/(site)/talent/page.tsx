import type { Metadata } from "next";
import { TalentPage } from "@/components/site/TalentPage";
import { composeClubPage } from "@/lib/club-pages";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/newsroom";

export async function generateMetadata(): Promise<Metadata> {
  const { page, title, lede, hero } = composeClubPage(await getContent(), "talent");
  const stored = page?.seo_description || "";
  const description = stored && !/hellip|\[\.\.\.\]/i.test(stored) ? stored : lede;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/talent` },
    openGraph: { title: `${title} | Kampala Junior Academy`, description, type: "website", images: hero ? [{ url: hero }] : undefined },
  };
}

export default async function TalentRoute() {
  return <TalentPage data={composeClubPage(await getContent(), "talent")} />;
}
