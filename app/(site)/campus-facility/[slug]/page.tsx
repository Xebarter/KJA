import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampusPostView } from "@/components/site/CampusPostView";
import { getCampusPost } from "@/lib/campus-pages";
import { getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const post = getCampusPost("campus-facility", (await params).slug);
  return { title: post?.title ?? "Facility" };
}

export default async function FacilityPage({ params }: Params) {
  const post = getCampusPost("campus-facility", (await params).slug);
  if (!post) notFound();
  const content = await getContent();
  return <CampusPostView post={post} news={content.news} events={content.events} />;
}
