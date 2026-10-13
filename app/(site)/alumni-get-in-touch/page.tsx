import { AlumniTouchView } from "@/components/site/AlumniViews";
import { getContent } from "@/lib/content";

export const metadata = {
  title: "Alumni: Get in Touch",
  description: "Share your Kampala Junior Academy story with the alumni network.",
};

export default async function AlumniContactPage() {
  const content = await getContent();
  return <AlumniTouchView email={content.settings.email} phone={content.settings.phone} />;
}
