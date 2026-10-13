import type { Metadata } from "next";
import { ProgrammePage } from "@/components/site/ProgrammePage";
import { getContent } from "@/lib/content";
import { composeProgramme } from "@/lib/info-pages";
import { SITE_URL } from "@/lib/newsroom";

export async function generateMetadata(): Promise<Metadata> {
  const { page, lede } = composeProgramme(await getContent(), "arts");
  const description = page?.seo_description || lede || "Music, drama, dance, visual arts and culture at Kampala Junior Academy.";
  return {
    title: "Arts & Culture",
    description,
    alternates: { canonical: `${SITE_URL}/arts` },
    openGraph: { title: "Arts & Culture | Kampala Junior Academy", description, type: "website", images: page?.image_url ? [{ url: page.image_url }] : undefined },
  };
}

export default async function ArtsPage() {
  const data = composeProgramme(await getContent(), "arts");

  return (
    <ProgrammePage
      data={data}
      config={{
        label: "Arts & Culture",
        icon: "fa-masks-theater",
        levels: [
          { icon: "fa-music", text: "Music" },
          { icon: "fa-masks-theater", text: "Drama" },
          { icon: "fa-drum", text: "Dance" },
          { icon: "fa-palette", text: "Visual arts" },
        ],
        badge: { value: "4", text: "Art forms to explore" },
        facts: [
          { value: "MDD", label: "Music, dance & drama" },
          { value: "Daycare–P7", label: "Every level takes part" },
          { value: "Studios", label: "Music & art rooms" },
          { value: "Festivals", label: "Cultural celebrations" },
        ],
        approach: {
          kicker: "Our approach",
          title: <>Where creativity <span>comes alive</span></>,
          checks: [
            "Music lessons from traditional songs to modern beats",
            "Acting, improvisation and school plays",
            "Dance from traditional African styles to ballet and contemporary",
            "Painting, drawing, sculpture and digital design",
          ],
          note: { icon: "fa-palette", title: "Every child's voice", text: "Expression, confidence and pride" },
        },
        itemsHead: {
          kicker: "Our programme",
          title: <>Many ways <span>to shine</span></>,
          intro: "From the music studio to the stage and the art room, every child finds a way to express themselves.",
        },
        itemIcons: [
          [/celebrat/i, "fa-star"],
          [/music/i, "fa-music"],
          [/drama/i, "fa-masks-theater"],
          [/dance/i, "fa-drum"],
          [/visual|art/i, "fa-palette"],
          [/culture/i, "fa-earth-africa"],
        ],
        statementKicker: "Creative, confident learners",
        close: {
          kicker: "Join the KJA family",
          title: <>Let your child <span>find their voice</span></>,
          text: "Apply online in minutes, or book a visit to see our learners perform, create and grow.",
        },
        fallbackImages: ["/images/kids-4.jpg", "/images/slider-66.jpg"],
      }}
    />
  );
}
