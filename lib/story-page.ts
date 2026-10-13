import type { Metadata } from "next";
import { cache } from "react";
import { getContent } from "@/lib/content";
import {
  adjacentStories,
  buildStories,
  kampalaIso,
  prepareArticle,
  relatedStories,
  SITE_URL,
  STORY_SOURCES,
  toStory,
  type StorySource,
} from "@/lib/newsroom";
import type { Article, SiteContent } from "@/lib/types";

export { kampalaIso };

/** Builds everything the article template needs; also used for admin previews of drafts. */
export function composeStoryPage(content: SiteContent, item: Article, source: StorySource) {
  const stories = buildStories(content);
  const story = stories.find((entry) => entry.key === `${source}:${item.slug}`) ?? toStory(item, source);
  const { html, toc } = prepareArticle(item.body);
  return {
    story,
    html,
    toc,
    seoTitle: item.seo_title || null,
    seoDescription: item.seo_description || null,
    related: relatedStories(stories, story),
    latest: stories.filter((entry) => entry.key !== story.key).slice(0, 3),
    ...adjacentStories(stories, story),
    email: content.settings.email,
  };
}

export const getStoryPage = cache(async (source: StorySource, slug: string) => {
  const content = await getContent();
  const item = content[STORY_SOURCES[source].contentKey].find((entry) => entry.slug === slug);
  return item ? composeStoryPage(content, item, source) : null;
});

export type StoryPageData = ReturnType<typeof composeStoryPage>;

export async function storyMetadata(source: StorySource, slug: string): Promise<Metadata> {
  const page = await getStoryPage(source, slug);
  if (!page) return { title: STORY_SOURCES[source].singular };
  const { story } = page;
  const title = page.seoTitle || story.title;
  const description = page.seoDescription || story.excerpt || undefined;
  const url = `${SITE_URL}${story.href}`;
  const images = story.image ? [{ url: story.image }] : undefined;
  return {
    title: page.seoTitle ? { absolute: page.seoTitle } : story.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      siteName: "Kampala Junior Academy",
      images,
      publishedTime: kampalaIso(story.date),
      modifiedTime: kampalaIso(story.updated),
      authors: [story.author],
      section: story.topic,
      tags: story.tags,
    },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: story.image ? [story.image] : undefined },
  };
}
