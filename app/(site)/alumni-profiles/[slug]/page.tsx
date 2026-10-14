import { permanentRedirect } from "next/navigation";
import { renderOnFirstVisit } from "@/lib/site-cache";

export default async function AlumniProfileRedirect({ params }: { params: Promise<{ slug: string }> }) {
  permanentRedirect(`/alumni-profile/${(await params).slug}`);
}

export const generateStaticParams = renderOnFirstVisit;
