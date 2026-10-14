import { permanentRedirect } from "next/navigation";
import { renderOnFirstVisit } from "@/lib/site-cache";

export default async function AlumniStoryRedirect({ params }: { params: Promise<{ slug: string }> }) {
  permanentRedirect(`/alumni-story/${(await params).slug}`);
}

export const generateStaticParams = renderOnFirstVisit;
