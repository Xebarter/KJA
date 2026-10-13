import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlumniProfileView } from "@/components/site/AlumniViews";
import { alumniProfiles, toProfile } from "@/lib/alumni";
import { findBySlug, getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).alumni_profiles, (await params).slug);
  if (!item) return { title: "Alumni Profile" };
  const profile = toProfile(item);
  return {
    title: profile.classOf ? `${profile.name}, Class of ${profile.classOf}` : profile.name,
    description: item.seo_description || profile.summary || undefined,
  };
}

export default async function AlumniProfileDetail({ params }: Params) {
  const content = await getContent();
  const item = findBySlug(content.alumni_profiles, (await params).slug);
  if (!item) notFound();
  const profiles = alumniProfiles(content.alumni_profiles);
  return (
    <AlumniProfileView
      profile={toProfile(item)}
      others={profiles.filter((profile) => profile.slug !== item.slug)}
      email={content.settings.email}
    />
  );
}
