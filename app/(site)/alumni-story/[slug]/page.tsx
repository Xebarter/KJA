import { notFound } from "next/navigation";
import { StoryArticle } from "@/components/site/StoryArticle";
import { getStoryPage, storyMetadata } from "@/lib/story-page";
import { renderOnFirstVisit } from "@/lib/site-cache";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return storyMetadata("alumni_story", (await params).slug);
}

export default async function AlumniStoryDetail({ params }: Params) {
  const page = await getStoryPage("alumni_story", (await params).slug);
  if (!page) notFound();
  return <StoryArticle {...page} />;
}

export const generateStaticParams = renderOnFirstVisit;
