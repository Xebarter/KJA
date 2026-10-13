import type { Metadata } from "next";
import { ProgrammePage } from "@/components/site/ProgrammePage";
import { getContent } from "@/lib/content";
import { composeProgramme } from "@/lib/info-pages";
import { SITE_URL } from "@/lib/newsroom";

export async function generateMetadata(): Promise<Metadata> {
  const { page, lede } = composeProgramme(await getContent(), "sport");
  const description = page?.seo_description || lede || "Swimming, football, athletics and net games at Kampala Junior Academy.";
  return {
    title: "Sports",
    description,
    alternates: { canonical: `${SITE_URL}/sport` },
    openGraph: { title: "Sports | Kampala Junior Academy", description, type: "website", images: page?.image_url ? [{ url: page.image_url }] : undefined },
  };
}

export default async function SportPage() {
  const data = composeProgramme(await getContent(), "sport");

  return (
    <ProgrammePage
      data={data}
      config={{
        label: "Sports",
        icon: "fa-futbol",
        levels: [
          { icon: "fa-baby", text: "Daycare" },
          { icon: "fa-shapes", text: "Nursery" },
          { icon: "fa-book-open", text: "Primary · P1–P7" },
        ],
        badge: { value: String(data.items.length), text: "Core sports" },
        facts: [
          { value: "Certified", label: "Coaches" },
          { value: "FUFA", label: "Registered football partner" },
          { value: "All levels", label: "Swimming from daycare" },
          { value: "National", label: "School competitions" },
        ],
        approach: {
          kicker: "Our approach",
          title: <>More than <span>just games</span></>,
          checks: [
            "Swimming for daycare, preschool and primary learners",
            "Football with Talent Xtra Sports Club, registered under FUFA Youth Football",
            "Track and field events that build stamina and resilience",
            "Badminton coaching that sharpens coordination and fair play",
          ],
          note: { icon: "fa-medal", title: "Certified coaches", text: "Expert guidance in every sport" },
        },
        itemsHead: {
          kicker: "Our sports",
          title: <>Find a sport <span>to love</span></>,
          intro: "Every learner finds a space to thrive, with coaching that builds skill, teamwork and confidence.",
        },
        itemIcons: [
          [/swim/i, "fa-person-swimming"],
          [/football|soccer/i, "fa-futbol"],
          [/athletic|track/i, "fa-person-running"],
          [/net|badminton|tennis/i, "fa-table-tennis-paddle-ball"],
        ],
        statementKicker: "Strong bodies, bright minds",
        close: {
          kicker: "Join the KJA family",
          title: <>Ready to <span>join the team?</span></>,
          text: "Apply online in minutes, or book a visit to see our learners in action.",
        },
        fallbackImages: ["/images/kids-4.jpg", "/images/slider-66.jpg"],
      }}
    />
  );
}
