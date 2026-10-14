import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampusPostView } from "@/components/site/CampusPostView";
import { getCampusPost } from "@/lib/campus-pages";
import { getContent } from "@/lib/content";
import { renderOnFirstVisit } from "@/lib/site-cache";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const post = getCampusPost("campus-co-curricular", (await params).slug);
  return { title: post?.title ?? "Co-Curricular" };
}

export default async function CoCurricularPage({ params }: Params) {
  const post = getCampusPost("campus-co-curricular", (await params).slug);
  if (!post) notFound();
  const content = await getContent();
  return <CampusPostView post={post} news={content.news} events={content.events} />;
}

export const generateStaticParams = renderOnFirstVisit;
