import type { Metadata } from "next";
import { ProgrammePage } from "@/components/site/ProgrammePage";
import { getContent } from "@/lib/content";
import { composeProgramme } from "@/lib/info-pages";
import { SITE_URL } from "@/lib/newsroom";

export async function generateMetadata(): Promise<Metadata> {
  const { page, lede } = composeProgramme(await getContent(), "academics");
  const description = page?.seo_description || lede || "Academics at Kampala Junior Academy: a broad, national curriculum from daycare to Primary Seven.";
  return {
    title: "Academics",
    description,
    alternates: { canonical: `${SITE_URL}/academics` },
    openGraph: { title: "Academics | Kampala Junior Academy", description, type: "website", images: page?.image_url ? [{ url: page.image_url }] : undefined },
  };
}

export default async function AcademicsPage() {
  const data = composeProgramme(await getContent(), "academics");
  const languagesText = data.items.find((item) => /language/i.test(item.title))?.paragraphs[0] || "";
  const languages = (languagesText.match(/including\s+([^.]+)/i)?.[1] || "")
    .split(/,|\band\b/i)
    .map((name) => name.trim())
    .filter(Boolean);

  return (
    <ProgrammePage
      data={data}
      config={{
        label: "Academics",
        icon: "fa-book-open",
        levels: [
          { icon: "fa-baby", text: "Daycare" },
          { icon: "fa-shapes", text: "Nursery" },
          { icon: "fa-book-open", text: "Primary · P1–P7" },
        ],
        badge: { value: String(data.items.length), text: "Subject areas" },
        facts: [
          { value: "Daycare–P7", label: "Levels taught" },
          { value: "NCDC", label: "Approved curriculum" },
          ...(languages.length ? [{ value: String(languages.length), label: "Foreign languages" }] : []),
          { value: "Certified", label: "Experienced teachers" },
        ],
        approach: {
          kicker: "Our approach",
          title: <>A complete, <span>holistic education</span></>,
          checks: [
            "Hands-on experiments, research projects and interactive lessons",
            "Reading, writing and speaking skills built from the earliest years",
            "Digital literacy introduced early through our ICT programme",
            ...(languages.length ? [`Extra languages: ${languages.join(", ")}`] : []),
          ],
          note: { icon: "fa-award", title: "National standards", text: "A curriculum families can trust" },
        },
        itemsHead: {
          kicker: "What your child learns",
          title: <>Subjects that <span>spark curiosity</span></>,
          intro: "A broad range of subjects, taught with care and hands-on learning from nursery through primary school.",
        },
        itemIcons: [
          [/science/i, "fa-flask"],
          [/math/i, "fa-square-root-variable"],
          [/social/i, "fa-earth-africa"],
          [/religio/i, "fa-hands-praying"],
          [/english|literacy/i, "fa-book-open-reader"],
          [/ict|technology|computer/i, "fa-laptop-code"],
          [/language/i, "fa-language"],
        ],
        statementKicker: "Learning for life",
        close: {
          kicker: "Join the KJA family",
          title: <>Give your child <span>strong foundations</span></>,
          text: "Apply online in minutes, or visit a campus to see our classrooms and meet our teachers.",
        },
        fallbackImages: ["/images/kids-4.jpg", "/images/slider-66.jpg"],
      }}
    />
  );
}
