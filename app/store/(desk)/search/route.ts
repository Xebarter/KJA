import { NextResponse } from "next/server";
import { type StoreItemHit, type StoreRecipientHit } from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { everyWord, searchNeedle, searchWords } from "@/lib/students";

type SearchKind = "pupil" | "teacher" | "item";

function kindOf(raw: string | null): SearchKind {
  if (raw === "teacher" || raw === "item") return raw;
  return "pupil";
}

export async function GET(request: Request) {
  const auth = await requireStore();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error, rows: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const kind = kindOf(url.searchParams.get("kind"));
  const raw = (url.searchParams.get("q") || "").trim();
  const needle = searchNeedle(raw).slice(0, 60);
  const words = searchWords(raw);
  if (needle.length < 2 || !words.length) {
    return NextResponse.json({ rows: [] });
  }

  if (kind === "item") {
    const like = `%${needle}%`;
    const filter = [everyWord(words, ["name", "sku"]), `barcode.ilike.${like}`].join(",");
    const { data, error } = await auth.supabase
      .from("store_items")
      .select("id, sku, name, unit, qty_on_hand, unit_cost, unit_price, active")
      .eq("active", true)
      .or(filter)
      .order("name")
      .limit(12);
    if (error) return NextResponse.json({ error: error.message, rows: [] as StoreItemHit[] });
    const rows: StoreItemHit[] = (data || []).map((row) => ({
      id: String(row.id),
      sku: String(row.sku || ""),
      name: String(row.name || "Item"),
      meta: String(row.unit || "pcs"),
      qty_on_hand: Number(row.qty_on_hand || 0),
      unit_price: Number(row.unit_price || 0),
      unit_cost: Number(row.unit_cost || 0),
      unit: String(row.unit || "pcs"),
    }));
    return NextResponse.json({ rows });
  }

  if (kind === "teacher") {
    const like = `%${needle}%`;
    const filter = [everyWord(words, ["full_name"]), `email.ilike.${like}`].join(",");
    const { data, error } = await auth.supabase
      .from("teaching_staff")
      .select("id, full_name, email, photo_path")
      .eq("active", true)
      .or(filter)
      .order("full_name")
      .limit(12);
    if (error) return NextResponse.json({ error: error.message, rows: [] as StoreRecipientHit[] });
    const rows: StoreRecipientHit[] = (data || []).map((row) => ({
      id: String(row.id),
      kind: "teacher",
      name: String(row.full_name || "Teacher"),
      meta: String(row.email || "Teacher"),
      photo_path: (row.photo_path as string | null) || null,
    }));
    return NextResponse.json({ rows });
  }

  const like = `%${needle}%`;
  const filter = [
    everyWord(words, ["full_name", "preferred_name", "surname", "given_names"]),
    `student_number.ilike.${like}`,
  ].join(",");
  const { data, error } = await auth.supabase
    .from("students")
    .select("id, full_name, student_number, class_code, stream, photo_path, status")
    .eq("status", "active")
    .or(filter)
    .order("full_name")
    .limit(12);
  if (error) return NextResponse.json({ error: error.message, rows: [] as StoreRecipientHit[] });

  const rows: StoreRecipientHit[] = (data || []).map((row) => {
    const bits = [
      String(row.student_number || ""),
      row.class_code ? String(row.class_code) + (row.stream ? ` ${row.stream}` : "") : "",
    ].filter(Boolean);
    return {
      id: String(row.id),
      kind: "pupil",
      name: String(row.full_name || "Pupil"),
      meta: bits.join(" · ") || "Pupil",
      photo_path: (row.photo_path as string | null) || null,
    };
  });
  return NextResponse.json({ rows });
}
