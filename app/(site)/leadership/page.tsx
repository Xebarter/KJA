import type { Metadata } from "next";
import { ProgrammePage } from "@/components/site/ProgrammePage";
import { getContent } from "@/lib/content";
import { composeProgramme } from "@/lib/info-pages";
import { SITE_URL } from "@/lib/newsroom";

export async function generateMetadata(): Promise<Metadata> {
  const { page, lede } = composeProgramme(await getContent(), "leadership");
  const description = page?.seo_description || lede || "Prefects, student council, club leaders and class monitors at Kampala Junior Academy.";
  return {
    title: "Leadership & Service",
    description,
    alternates: { canonical: `${SITE_URL}/leadership` },
    openGraph: { title: "Leadership & Service | Kampala Junior Academy", description, type: "website", images: page?.image_url ? [{ url: page.image_url }] : undefined },
  };
}

export default async function LeadershipPage() {
  const data = composeProgramme(await getContent(), "leadership");

  return (
    <ProgrammePage
      data={data}
      config={{
        label: "Leadership & Service",
        icon: "fa-people-group",
        levels: [
          { icon: "fa-user-shield", text: "Prefects" },
          { icon: "fa-landmark", text: "Student council" },
          { icon: "fa-flag", text: "Club leaders" },
          { icon: "fa-clipboard-check", text: "Class monitors" },
        ],
        badge: { value: "KJA", text: "For future leaders" },
        facts: [
          { value: String(data.items.length), label: "Leadership roles" },
          { value: "Elected", label: "Prefects & council" },
          { value: "Student-led", label: "Clubs" },
          { value: "Service", label: "The heart of leadership" },
        ],
        approach: {
          kicker: "Our approach",
          title: <>Leadership grounded <span>in service</span></>,
          checks: [
            "Prefects chosen through democratic elections by peers and teachers",
            "An elected Student Council that gives learners a voice",
            "Club leaders who take initiative and inspire others",
            "Class monitors who help keep classrooms caring and organised",
          ],
          note: { icon: "fa-hand-holding-heart", title: "Lead by serving", text: "Compassion and integrity first" },
        },
        itemsHead: {
          kicker: "Leadership roles",
          title: <>Many ways <span>to lead</span></>,
          intro: "From the classroom to the student council, learners practise leadership every day with guidance from their teachers.",
        },
        itemIcons: [
          [/prefect/i, "fa-user-shield"],
          [/club/i, "fa-flag"],
          [/council/i, "fa-landmark"],
          [/monitor/i, "fa-clipboard-check"],
        ],
        statementKicker: "For future leaders",
        close: {
          kicker: "Join the KJA family",
          title: <>Raise a <span>leader of tomorrow</span></>,
          text: "Apply online in minutes, or book a visit to see how our learners lead and serve.",
        },
        fallbackImages: ["/images/kids-4.jpg", "/images/slider-66.jpg"],
      }}
    />
  );
}
