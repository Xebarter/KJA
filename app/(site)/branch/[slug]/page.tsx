import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampusView } from "@/components/site/CampusView";
import { Banner, Detail, SectionList } from "@/components/site/Views";
import { getCampusPage } from "@/lib/campus-pages";
import { findBySlug, getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const campus = findBySlug((await getContent()).campuses, (await params).slug);
  return { title: campus?.title ?? "Campus", description: campus?.excerpt || undefined };
}

export default async function CampusPage({ params }: Params) {
  const { slug } = await params;
  const content = await getContent();
  const campus = findBySlug(content.campuses, slug);
  if (!campus) notFound();

  const page = getCampusPage(slug);
  if (page) {
    const slideTitle = content.settings.hero_slides[0]?.title ?? "Kampala Junior Academy, Choose the right School for your child";
    return <CampusView page={page} slideTitle={slideTitle} />;
  }

  const sections = content.campus_sections.filter((section) => !section.campus_slug || section.campus_slug === slug);
  return (
    <main>
      <Banner title={campus.title} crumbs="Campuses" />
      <Detail item={campus} />
      <div className="container pb-5"><SectionList sections={sections} /></div>
    </main>
  );
}
