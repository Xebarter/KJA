import "@/app/account/account.css";
import { AccountShell } from "@/components/account/Shell";
import { ClubsView } from "@/components/account/ClubsView";
import type { ChildRow, ClubRow, SignupRow } from "@/lib/account";

const kids = [
  { id: "a", user_id: "u", full_name: "Amara Nakato", campus: "Kitante", grade: "Primary 5", date_of_birth: null, student_code: null },
  { id: "b", user_id: "u", full_name: "Daniel Ssemanda", campus: "Kitante", grade: "Primary 2", date_of_birth: null, student_code: null },
] as ChildRow[];

const clubs = [
  ["c1", "Academic & Enrichment Clubs", "All campuses", "To be announced", "Reading, STEM and academic support."],
  ["c2", "Badminton", "Kitante & Najjanankumbi", "Tuesdays, 4:00pm", "Skill, teamwork and match play."],
  ["c3", "Creative & Performing Arts", "All campuses", "To be announced", "Music, drama, dance and visual arts."],
  ["c4", "Faith-Based Clubs", "All campuses", "To be announced", "Christian and faith formation groups."],
  ["c5", "Language Club", "All campuses", "To be announced", "English, Kiswahili and public speaking."],
  ["c6", "Leadership, Character & Life Skills", "All campuses", "To be announced", "Prefects, scouts and leadership."],
  ["c7", "Music & Dance", "All campuses", "Fridays, 3:30pm", "Choir, instruments and performance."],
  ["c8", "Sports & Physical Activities", "All campuses", "To be announced", "Football, swimming, athletics and more."],
].map(([id, title, campus, meeting, description]) => ({ id, title, campus, meeting, description })) as ClubRow[];

const signups = [
  { id: "s1", child_id: "a", club_id: "c7", status: "pending" },
  { id: "s2", child_id: "a", club_id: "c2", status: "approved" },
  { id: "s3", child_id: "b", club_id: "c8", status: "pending" },
] as SignupRow[];

const up = "https://kja.ug/wp-content/uploads/2025/08/";
const media = {
  c1: { image: `${up}1729770384619-7778.jpg`, href: "/campus-co-curricular/academic-enrichment-clubs" },
  c2: { image: `${up}IMG-20250814-WA0058-1.jpg` },
  c3: { image: `${up}IMG-20250814-WA0151.jpg`, href: "/campus-co-curricular/creative-performing-arts" },
  c4: { image: `${up}1748607795184-PXL_20240719_081458243.MP_.jpg`, href: "/campus-co-curricular/faith-based-clubs" },
  c5: {},
  c6: { image: `${up}IMG-20250814-WA0163.jpg`, href: "/campus-co-curricular/leadership-character-life-skills" },
  c7: { image: `${up}IMG-20250814-WA0151.jpg` },
  c8: { image: `${up}IMG-20250814-WA0058-1.jpg`, href: "/campus-co-curricular/sports-physical-activities" },
};

export default async function Preview({ searchParams }: { searchParams: Promise<{ one?: string; none?: string }> }) {
  const { one, none } = await searchParams;
  return (
    <div className="kja-account">
      <AccountShell name="Sarah Nakato" unread={2}>
        <ClubsView kids={none ? [] : one ? kids.slice(0, 1) : kids} clubs={clubs} signups={none ? [] : signups} media={media} />
      </AccountShell>
    </div>
  );
}
