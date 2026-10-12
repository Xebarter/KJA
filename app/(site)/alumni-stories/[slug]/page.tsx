import { permanentRedirect } from "next/navigation";

export default async function AlumniStoryRedirect({ params }: { params: Promise<{ slug: string }> }) {
  permanentRedirect(`/alumni-story/${(await params).slug}`);
}
