import { permanentRedirect } from "next/navigation";

export default async function AlumniProfileRedirect({ params }: { params: Promise<{ slug: string }> }) {
  permanentRedirect(`/alumni-profile/${(await params).slug}`);
}
