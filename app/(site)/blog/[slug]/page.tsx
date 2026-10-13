import { notFound } from "next/navigation";
import { StoryArticle } from "@/components/site/StoryArticle";
import { getStoryPage, storyMetadata } from "@/lib/story-page";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return storyMetadata("blog", (await params).slug);
}

export default async function BlogDetail({ params }: Params) {
  const page = await getStoryPage("blog", (await params).slug);
  if (!page) notFound();
  return <StoryArticle {...page} />;
}
