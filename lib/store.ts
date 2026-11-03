import type { SupabaseClient } from "@supabase/supabase-js";

export type StoreSettings = {
  default_reorder_level: number;
  issue_prefix: string;
  issue_next: number;
  requisition_prefix: string;
  requisition_next: number;
  purchase_prefix: string;
  purchase_next: number;
  currency_label: string;
};

export type StoreCategory = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export type StoreItem = {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  unit: string;
  qty_on_hand: number;
  reorder_level: number;
  unit_cost: number;
  unit_price: number;
  barcode: string;
  notes: string;
  active: boolean;
};

export type StoreSupplier = {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
};

export type PaymentMethod = "complimentary" | "cash" | "mobile_money" | "bank" | "on_account";

export type RequisitionStatus = "draft" | "submitted";

export type StoreRecipientHit = {
  id: string;
  kind: "pupil" | "teacher";
  name: string;
  meta: string;
  photo_path: string | null;
};

export type StoreItemHit = {
  id: string;
  sku: string;
  name: string;
  meta: string;
  qty_on_hand: number;
  unit_price: number;
  unit_cost: number;
  unit: string;
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  complimentary: "Complimentary",
  cash: "Cash",
  mobile_money: "Mobile money",
  bank: "Bank",
  on_account: "On account",
};

export const REQ_STATUS_LABELS: Record<RequisitionStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
};

/** Map any legacy status onto draft | submitted. */
export function normalizeRequisitionStatus(status: string | null | undefined): RequisitionStatus {
  return status === "draft" ? "draft" : "submitted";
}

export function todayKampala() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function money(amount: number, currency = "UGX") {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: currency === "UGX" ? "UGX" : currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function qty(value: number, unit = "") {
  const n = Number(value) || 0;
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return unit ? `${text} ${unit}` : text;
}

/** Default requisition line note: "{Number}{Units} Left". */
export function stockLeftNote(qtyOnHand: number, unit = "pcs") {
  const n = Number(qtyOnHand) || 0;
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  const u = String(unit || "pcs").trim() || "pcs";
  return `${text}${u} Left`;
}

export function isLowStock(item: { active?: boolean; qty_on_hand: number; reorder_level: number }) {
  if (item.active === false) return false;
  return Number(item.qty_on_hand) <= Number(item.reorder_level);
}

export function qtyNeededForReorder(item: { qty_on_hand: number; reorder_level: number }, fallback = 5) {
  const onHand = Number(item.qty_on_hand) || 0;
  const reorder = Number(item.reorder_level) || fallback;
  const needed = Math.max(reorder - onHand, reorder > 0 ? reorder : fallback);
  return needed > 0 ? needed : fallback;
}

export function schemaHint(message: string | null | undefined) {
  if (!message) return null;
  if (/store_|relation .* does not exist|schema cache/i.test(message)) {
    return "Run supabase/0058_store.sql through 0060_store_requisition_statuses.sql before using the store desk.";
  }
  return null;
}

export async function loadSettings(supabase: SupabaseClient): Promise<StoreSettings> {
  const { data } = await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle();
  return {
    default_reorder_level: Number(data?.default_reorder_level ?? 5),
    issue_prefix: String(data?.issue_prefix ?? "ISS"),
    issue_next: Number(data?.issue_next ?? 1),
    requisition_prefix: String(data?.requisition_prefix ?? "REQ"),
    requisition_next: Number(data?.requisition_next ?? 1),
    purchase_prefix: String(data?.purchase_prefix ?? "GRN"),
    purchase_next: Number(data?.purchase_next ?? 1),
    currency_label: String(data?.currency_label ?? "UGX"),
  };
}

/** Create (or reuse) a catalogue item from a free-text requisition name. Stock starts at 0. */
export async function ensureStoreItemByName(
  supabase: SupabaseClient,
  rawName: string,
  options?: { defaultReorderLevel?: number; notes?: string },
): Promise<{ id: string; name: string; created: boolean; error?: string }> {
  const name = String(rawName || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (name.length < 2) return { id: "", name: "", created: false, error: "Item name is too short." };

  const { data: existing } = await supabase
    .from("store_items")
    .select("id, name")
    .ilike("name", name.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_"))
    .eq("active", true)
    .limit(20);
  const match = (existing || []).find((row) => String(row.name).toLowerCase() === name.toLowerCase());
  if (match?.id) return { id: match.id, name: String(match.name), created: false };

  const settings = options?.defaultReorderLevel == null ? await loadSettings(supabase) : null;
  const reorder_level = options?.defaultReorderLevel ?? settings?.default_reorder_level ?? 5;
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16);
  const sku = `${slug || "ITEM"}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const { data: created, error } = await supabase
    .from("store_items")
    .insert({
      sku,
      name,
      unit: "pcs",
      qty_on_hand: 0,
      reorder_level,
      unit_cost: 0,
      unit_price: 0,
      notes: options?.notes || "Added from requisition",
      active: true,
    })
    .select("id, name")
    .single();
  if (error || !created) return { id: "", name, created: false, error: error?.message || "Could not add item." };
  return { id: created.id, name: String(created.name), created: true };
}

export async function assertRecipient(
  supabase: SupabaseClient,
  kind: "pupil" | "teacher",
  id: string,
): Promise<{ error?: string; name?: string }> {
  if (kind === "pupil") {
    const { data } = await supabase.from("students").select("id, full_name, status").eq("id", id).maybeSingle();
    if (!data) return { error: "Pupil not found." };
    if (data.status !== "active") return { error: "Only registered active pupils may receive store issues." };
    return { name: data.full_name as string };
  }
  const { data } = await supabase.from("teaching_staff").select("id, full_name, active").eq("id", id).maybeSingle();
  if (!data) return { error: "Teacher not found." };
  if (!data.active) return { error: "Only active teachers may receive store issues." };
  return { name: data.full_name as string };
}

export async function nextStoreNumber(supabase: SupabaseClient, kind: "issue" | "requisition" | "purchase") {
  const { data, error } = await supabase.rpc("store_next_number", { p_kind: kind });
  if (error) return { error: error.message };
  return { number: String(data) };
}

export async function applyStock(
  supabase: SupabaseClient,
  itemId: string,
  qtyDelta: number,
  kind: "purchase" | "issue" | "adjust" | "return" | "void",
  refTable = "",
  refId: string | null = null,
  note = "",
) {
  const { data, error } = await supabase.rpc("store_apply_stock", {
    p_item_id: itemId,
    p_qty_delta: qtyDelta,
    p_kind: kind,
    p_ref_table: refTable,
    p_ref_id: refId,
    p_note: note,
  });
  if (error) return { error: error.message };
  return { balance: Number(data) };
}
