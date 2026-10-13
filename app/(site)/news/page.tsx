import type { Metadata } from "next";
import { Newsroom } from "@/components/site/Newsroom";
import { getContent } from "@/lib/content";
import { buildStories, leadStory, newsroomEvents, newsroomPhotos, SITE_URL } from "@/lib/newsroom";

const DESCRIPTION = "News, results, trips and celebrations from across Kampala Junior Academy's campuses.";

export async function generateMetadata(): Promise<Metadata> {
  const lead = leadStory(buildStories(await getContent()));
  return {
    title: "News & Stories",
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/news` },
    openGraph: {
      title: "News & Stories | Kampala Junior Academy",
      description: DESCRIPTION,
      type: "website",
      images: lead?.image ? [{ url: lead.image }] : undefined,
    },
  };
}

export default async function NewsPage() {
  const content = await getContent();
  const stories = buildStories(content);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "News & Stories",
    description: DESCRIPTION,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: stories.slice(0, 20).map((story, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}${story.href}`,
        name: story.title,
      })),
    },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Newsroom
        stories={stories}
        events={newsroomEvents(content.events)}
        photos={newsroomPhotos(content.gallery)}
        campusCount={content.campuses.length}
        email={content.settings.email}
      />
    </>
  );
}
