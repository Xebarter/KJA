import { notFound } from "next/navigation";
import { StoryArticle } from "@/components/site/StoryArticle";
import { getStoryPage, storyMetadata } from "@/lib/story-page";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return storyMetadata("alumni", (await params).slug);
}

export default async function AlumniNewsDetail({ params }: Params) {
  const page = await getStoryPage("alumni", (await params).slug);
  if (!page) notFound();
  return <StoryArticle {...page} />;
}
