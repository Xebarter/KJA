import { HomeView } from "@/components/site/HomeView";
import { getContent } from "@/lib/content";

export default async function HomePage() {
  const content = await getContent();
  return <HomeView content={content} />;
}
