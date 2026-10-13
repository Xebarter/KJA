import { ClubsView, type ClubMedia } from "@/components/account/ClubsView";
import type { ClubRow } from "@/lib/account";
import { loadCampusData } from "@/lib/campus-pages";
import { getPortal } from "@/lib/portal";

const RELATED: [RegExp, string][] = [
  [/swim/i, "swimming"],
  [/ballet/i, "ballet"],
  [/chess/i, "chess"],
  [/music|dance|art|drama|perform/i, "creative-performing-arts"],
  [/sport|football|badminton|athlet|physical/i, "sports-physical-activities"],
  [/faith|christian/i, "faith-based-clubs"],
  [/academic|stem|reading|language|enrich/i, "academic-enrichment-clubs"],
  [/leader|character|scout/i, "leadership-character-life-skills"],
];

const normalise = (value: string) =>
  value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function clubMedia(clubs: ClubRow[]): ClubMedia {
  let posts: [string, { title: string; image_url: string | null }][] = [];
  try {
    posts = Object.entries(loadCampusData()["campus-co-curricular"]);
  } catch {
    return {};
  }
  return Object.fromEntries(
    clubs.map((club) => {
      const key = normalise(club.title);
      const exact = posts.find(([slug, post]) => slug === key || normalise(post.title) === key);
      if (exact) return [club.id, { image: exact[1].image_url || undefined, href: `/campus-co-curricular/${exact[0]}` }];
      const slug = RELATED.find(([pattern]) => pattern.test(club.title))?.[1];
      const related = posts.find(([postSlug]) => postSlug === slug);
      return [club.id, { image: related?.[1].image_url || undefined }];
    }),
  );
}

export default async function ClubsPage() {
  const { children, clubs, signups } = await getPortal();
  return <ClubsView kids={children} clubs={clubs} signups={signups} media={clubMedia(clubs)} />;
}
