import type { ClubChoice, ClubChild } from "@/components/account/club-model";
import { ClubsView } from "@/components/account/ClubsView";
import { clubFits } from "@/lib/clubs";
import { paymentsConfigured } from "@/lib/payments/gateway";
import { getPortal, getSessionUser } from "@/lib/portal";

export const metadata = { title: "Clubs" };

type Catalogue = { id: string; title: string; category: string | null; fee_amount: number | null; section: string | null; active: boolean | null };
type Consent = { id: string; student_id: string; club_id: string };
type Payment = { student_id: string; club_id: string; receipt_no: string | null };
type Waiting = { id: string; student_id: string; club_id: string };
type WaitingItem = { collection_id: string; club_id: string };

export default async function ClubsPage() {
  const [portal, session] = await Promise.all([getPortal(), getSessionUser()]);
  const { user, supabase } = session;
  if (!user || !supabase) {
    return <ClubsView family={[]} phone="" online={false} termLabel={null} />;
  }

  const pupils = portal.pupils;
  const ids = pupils.map((child) => child.id);
  const [clubsQuery, termQuery] = await Promise.all([
    supabase.from("clubs").select("id, title, category, fee_amount, section, active").eq("active", true).eq("published", true).order("sort_order"),
    supabase.from("fee_terms").select("id, label").eq("is_current", true).maybeSingle(),
  ]);
  const clubs = (clubsQuery.data || []) as Catalogue[];
  const term = termQuery.data;
  const [consentsQuery, paymentsQuery, waitingQuery] = ids.length
    ? await Promise.all([
        supabase.from("club_consents").select("id, student_id, club_id").is("withdrawn_at", null).in("student_id", ids),
        term ? supabase.from("club_payments").select("student_id, club_id, receipt_no").eq("term_id", term.id).is("voided_at", null).in("student_id", ids) : Promise.resolve({ data: [] as Payment[] }),
        term ? supabase.from("club_collections").select("id, student_id, club_id").eq("user_id", user.id).eq("term_id", term.id).in("status", ["pending", "initiated"]).in("student_id", ids) : Promise.resolve({ data: [] as Waiting[] }),
      ])
    : [{ data: [] as Consent[] }, { data: [] as Payment[] }, { data: [] as Waiting[] }];

  const waitingRows = (waitingQuery.data || []) as Waiting[];
  let waitingItems: WaitingItem[] = [];
  if (waitingRows.length) {
    const itemsQuery = await supabase.from("club_collection_items").select("collection_id, club_id").in("collection_id", waitingRows.map((row) => row.id));
    if (!itemsQuery.error) waitingItems = (itemsQuery.data || []) as WaitingItem[];
  }
  const consents = new Map(((consentsQuery.data || []) as Consent[]).map((row) => [`${row.student_id}:${row.club_id}`, row.id]));
  const receipts = new Map(((paymentsQuery.data || []) as Payment[]).map((row) => [`${row.student_id}:${row.club_id}`, row.receipt_no]));
  const waiting = new Map(waitingRows.map((row) => [`${row.student_id}:${row.club_id}`, row.id]));
  const studentByCollection = new Map(waitingRows.map((row) => [row.id, row.student_id]));
  for (const item of waitingItems) {
    const studentId = studentByCollection.get(item.collection_id);
    if (studentId) waiting.set(`${studentId}:${item.club_id}`, item.collection_id);
  }

  const children: ClubChild[] = pupils.map((child) => {
    const choices: ClubChoice[] = clubs
      .filter((club) => clubFits(club.section, child.class_code))
      .map((club) => {
        const key = `${child.id}:${club.id}`;
        const consentId = consents.get(key) ?? null;
        const receiptNo = receipts.get(key) ?? null;
        const collectionId = waiting.get(key) ?? null;
        const state: ClubChoice["state"] = receipts.has(key) ? "paid" : collectionId ? "waiting" : consentId ? "consented" : "open";
        return {
          id: club.id,
          title: club.title,
          category: club.category || "Other",
          fee: Number(club.fee_amount) || 0,
          state,
          consentId,
          receiptNo,
          collectionId,
        };
      });
    return {
      id: child.id,
      name: child.full_name,
      detail: [child.grade, child.campus ? `${child.campus} campus` : ""].filter(Boolean).join(" · ") || "On the school register",
      clubs: choices,
    };
  });

  return (
    <ClubsView
      family={children}
      phone={portal.profile?.phone || ""}
      online={paymentsConfigured()}
      termLabel={term?.label ?? null}
    />
  );
}
