"use server";

import {
  applyStock,
  assertRecipient,
  ensureStoreItemByName,
  loadSettings,
  nextStoreNumber,
  qtyNeededForReorder,
  stockLeftNote,
  type RequisitionStatus,
} from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";
import { refreshStore } from "@/lib/store-refresh";

function text(form: FormData, key: string, max = 200) {
  return String(form.get(key) || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function num(form: FormData, key: string) {
  const value = Number(String(form.get(key) || "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : NaN;
}

function bool(form: FormData, key: string) {
  const value = String(form.get(key) || "");
  return value === "1" || value === "true" || value === "on";
}

export async function saveCategory(formData: FormData) {
  const auth = await requireStore("settings", "items");
  if ("error" in auth) return { error: auth.error };
  const id = text(formData, "id", 40);
  const name = text(formData, "name", 80);
  const sort_order = Math.round(num(formData, "sort_order") || 0);
  const active = bool(formData, "active") || !id;
  if (name.length < 2) return { error: "Enter a category name." };
  const row = { name, sort_order, active, updated_at: new Date().toISOString() };
  const { error } = id
    ? await auth.supabase.from("store_categories").update(row).eq("id", id)
    : await auth.supabase.from("store_categories").insert(row);
  if (error) return { error: error.message };
  refreshStore(`${STORE_BASE}/settings`, `${STORE_BASE}/items`);
  return { ok: id ? "Category updated." : "Category added." };
}

export async function saveItem(formData: FormData) {
  const auth = await requireStore("items");
  if ("error" in auth) return { error: auth.error };
  const id = text(formData, "id", 40);
  const name = text(formData, "name", 120);
  const category_id = text(formData, "category_id", 40) || null;
  const unit = text(formData, "unit", 20) || "pcs";
  const reorder_level = num(formData, "reorder_level");
  const qty_on_hand = num(formData, "qty_on_hand");
  const unit_price = num(formData, "unit_price");
  const notes = text(formData, "notes", 500);
  const active = formData.has("active") ? bool(formData, "active") : true;
  if (name.length < 2) return { error: "Enter an item name." };
  if (!(reorder_level >= 0)) return { error: "Reorder level must be zero or more." };
  if (!(qty_on_hand >= 0)) return { error: "Units present must be zero or more." };
  if (!(unit_price >= 0)) return { error: "Unit price must be zero or more." };

  const row = {
    name,
    category_id,
    unit,
    reorder_level,
    unit_price,
    notes,
    active,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { data: current } = await auth.supabase.from("store_items").select("qty_on_hand").eq("id", id).maybeSingle();
    if (!current) return { error: "Item not found." };
    const { error } = await auth.supabase.from("store_items").update(row).eq("id", id);
    if (error) return { error: error.message };
    const before = Number(current.qty_on_hand || 0);
    const delta = qty_on_hand - before;
    if (delta !== 0) {
      const stock = await applyStock(auth.supabase, id, delta, "adjust", "store_items", id, "Units present updated");
      if (stock.error) return { error: stock.error };
    }
    refreshStore(`${STORE_BASE}/items`, `${STORE_BASE}/stock`, STORE_BASE);
    return { ok: "Item updated.", href: `${STORE_BASE}/items` };
  }

  const settings = await loadSettings(auth.supabase);
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16);
  const sku = `${slug || "ITEM"}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const { data: created, error } = await auth.supabase
    .from("store_items")
    .insert({
      ...row,
      sku,
      unit_cost: 0,
      unit_price: Number.isFinite(unit_price) ? unit_price : 0,
      qty_on_hand: 0,
      reorder_level: Number.isFinite(reorder_level) ? reorder_level : settings.default_reorder_level,
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message || "Could not add item." };
  if (qty_on_hand > 0) {
    const stock = await applyStock(
      auth.supabase,
      created.id,
      qty_on_hand,
      "adjust",
      "store_items",
      created.id,
      "Opening units present",
    );
    if (stock.error) return { error: stock.error };
  }
  refreshStore(`${STORE_BASE}/items`, `${STORE_BASE}/stock`, STORE_BASE);
  return { ok: "Item added." };
}

export async function saveSupplier(formData: FormData) {
  const auth = await requireStore("suppliers");
  if ("error" in auth) return { error: auth.error };
  const id = text(formData, "id", 40);
  const name = text(formData, "name", 120);
  if (name.length < 2) return { error: "Enter the supplier name." };
  const row = {
    name,
    contact_name: text(formData, "contact_name", 120),
    phone: text(formData, "phone", 40),
    email: text(formData, "email", 120),
    address: text(formData, "address", 240),
    notes: text(formData, "notes", 500),
    active: formData.has("active") ? bool(formData, "active") : true,
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await auth.supabase.from("store_suppliers").update(row).eq("id", id)
    : await auth.supabase.from("store_suppliers").insert(row);
  if (error) return { error: error.message };
  refreshStore(`${STORE_BASE}/suppliers`);
  return { ok: id ? "Supplier updated." : "Supplier added.", href: `${STORE_BASE}/suppliers` };
}

export async function saveAdjustment(formData: FormData) {
  const auth = await requireStore("adjustments");
  if ("error" in auth) return { error: auth.error };
  const item_id = text(formData, "item_id", 40);
  const qty_delta = num(formData, "qty_delta");
  const reason = text(formData, "reason", 20) || "other";
  const notes = text(formData, "notes", 400);
  if (!item_id) return { error: "Choose an item." };
  if (!Number.isFinite(qty_delta) || qty_delta === 0) return { error: "Enter a non-zero quantity change." };
  if (!["damage", "count", "return_in", "other"].includes(reason)) return { error: "Choose a valid reason." };

  const { data: adj, error } = await auth.supabase
    .from("store_adjustments")
    .insert({
      item_id,
      qty_delta,
      reason,
      notes,
      adjusted_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error || !adj) return { error: error?.message || "Could not save adjustment." };

  const stock = await applyStock(auth.supabase, item_id, qty_delta, "adjust", "store_adjustments", adj.id, notes || reason);
  if (stock.error) {
    await auth.supabase.from("store_adjustments").delete().eq("id", adj.id);
    return { error: stock.error };
  }
  refreshStore(`${STORE_BASE}/adjustments`, `${STORE_BASE}/stock`, `${STORE_BASE}/items`, STORE_BASE);
  return { ok: "Stock adjusted.", href: `${STORE_BASE}/adjustments` };
}

export async function createIssue(formData: FormData) {
  const auth = await requireStore("issues");
  if ("error" in auth) return { error: auth.error };
  const kind = text(formData, "recipient_kind", 20) as "teacher" | "pupil";
  const recipient_id = text(formData, "recipient_id", 40);
  const notes = text(formData, "notes", 500);
  if (kind !== "teacher" && kind !== "pupil") return { error: "Choose teacher or pupil." };
  if (!recipient_id) return { error: "Select a recipient." };
  const recipient = await assertRecipient(auth.supabase, kind, recipient_id);
  if (recipient.error) return { error: recipient.error };

  const itemIds = formData.getAll("line_item_id").map(String);
  const qtys = formData.getAll("line_qty").map(String);
  const lines: { item_id: string; qty: number }[] = [];
  for (let i = 0; i < itemIds.length; i += 1) {
    const item_id = itemIds[i]?.trim();
    const qty = Number(qtys[i]);
    if (!item_id) continue;
    if (!(qty > 0)) return { error: "Each line needs a positive quantity." };
    lines.push({ item_id, qty });
  }
  if (!lines.length) return { error: "Add at least one item line." };

  const numbered = await nextStoreNumber(auth.supabase, "issue");
  if (numbered.error || !numbered.number) return { error: numbered.error || "Could not allocate issue number." };

  const { data: issue, error } = await auth.supabase
    .from("store_issues")
    .insert({
      number: numbered.number,
      recipient_kind: kind,
      student_id: kind === "pupil" ? recipient_id : null,
      teacher_id: kind === "teacher" ? recipient_id : null,
      payment_method: "complimentary",
      amount_paid: 0,
      notes,
      issued_by: auth.user.id,
    })
    .select("id, number")
    .single();
  if (error || !issue) return { error: error?.message || "Could not create issue." };

  const { error: lineError } = await auth.supabase.from("store_issue_lines").insert(
    lines.map((line) => ({
      issue_id: issue.id,
      item_id: line.item_id,
      qty: line.qty,
      unit_price: 0,
    })),
  );
  if (lineError) {
    await auth.supabase.from("store_issues").delete().eq("id", issue.id);
    return { error: lineError.message };
  }

  for (const line of lines) {
    const stock = await applyStock(
      auth.supabase,
      line.item_id,
      -line.qty,
      "issue",
      "store_issues",
      issue.id,
      `Issue ${issue.number}`,
    );
    if (stock.error) {
      // Best-effort reverse already-applied lines
      for (const done of lines) {
        if (done === line) break;
        await applyStock(auth.supabase, done.item_id, done.qty, "void", "store_issues", issue.id, "Rollback");
      }
      await auth.supabase.from("store_issues").update({ voided_at: new Date().toISOString() }).eq("id", issue.id);
      return { error: stock.error };
    }
  }

  refreshStore(`${STORE_BASE}/issues`, `${STORE_BASE}/stock`, `${STORE_BASE}/items`, STORE_BASE);
  return { ok: `Issued ${issue.number}.`, href: `${STORE_BASE}/issues` };
}

export async function voidIssue(formData: FormData) {
  const auth = await requireStore("issues");
  if ("error" in auth) return { error: auth.error };
  const id = text(formData, "id", 40);
  if (!id) return { error: "Missing issue." };
  const { data: issue } = await auth.supabase.from("store_issues").select("id, number, voided_at").eq("id", id).maybeSingle();
  if (!issue) return { error: "Issue not found." };
  if (issue.voided_at) return { error: "Already voided." };
  const { data: lines } = await auth.supabase.from("store_issue_lines").select("item_id, qty").eq("issue_id", id);
  for (const line of lines || []) {
    const stock = await applyStock(
      auth.supabase,
      String(line.item_id),
      Number(line.qty),
      "void",
      "store_issues",
      id,
      `Void ${issue.number}`,
    );
    if (stock.error) return { error: stock.error };
  }
  const { error } = await auth.supabase.from("store_issues").update({ voided_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  refreshStore(`${STORE_BASE}/issues`, `${STORE_BASE}/stock`, `${STORE_BASE}/items`, STORE_BASE);
  return { ok: `Voided ${issue.number}.` };
}

export async function createPurchase(formData: FormData) {
  const auth = await requireStore("purchases");
  if ("error" in auth) return { error: auth.error };
  const supplier_id = text(formData, "supplier_id", 40) || null;
  const requisition_id = text(formData, "requisition_id", 40) || null;
  const reference = text(formData, "reference", 80);
  const received_on = text(formData, "received_on", 12);
  const notes = text(formData, "notes", 500);
  const itemIds = formData.getAll("line_item_id").map(String);
  const qtys = formData.getAll("line_qty").map(String);
  const costs = formData.getAll("line_cost").map(String);
  const lines: { item_id: string; qty: number; unit_cost: number }[] = [];
  for (let i = 0; i < itemIds.length; i += 1) {
    const item_id = itemIds[i]?.trim();
    const qty = Number(qtys[i]);
    const unit_cost = Number(costs[i] || 0);
    if (!item_id) continue;
    if (!(qty > 0)) return { error: "Each line needs a positive quantity." };
    if (!(unit_cost >= 0)) return { error: "Unit costs must be zero or more." };
    lines.push({ item_id, qty, unit_cost });
  }
  if (!lines.length) return { error: "Add at least one purchase line." };

  const numbered = await nextStoreNumber(auth.supabase, "purchase");
  if (numbered.error || !numbered.number) return { error: numbered.error || "Could not allocate GRN number." };

  const { data: purchase, error } = await auth.supabase
    .from("store_purchases")
    .insert({
      number: numbered.number,
      supplier_id,
      requisition_id,
      reference,
      received_on: received_on || undefined,
      notes,
      received_by: auth.user.id,
    })
    .select("id, number")
    .single();
  if (error || !purchase) return { error: error?.message || "Could not save purchase." };

  const { error: lineError } = await auth.supabase.from("store_purchase_lines").insert(
    lines.map((line) => ({
      purchase_id: purchase.id,
      item_id: line.item_id,
      qty: line.qty,
      unit_cost: line.unit_cost,
    })),
  );
  if (lineError) {
    await auth.supabase.from("store_purchases").delete().eq("id", purchase.id);
    return { error: lineError.message };
  }

  for (const line of lines) {
    const stock = await applyStock(
      auth.supabase,
      line.item_id,
      line.qty,
      "purchase",
      "store_purchases",
      purchase.id,
      `GRN ${purchase.number}`,
    );
    if (stock.error) return { error: stock.error };
    await auth.supabase
      .from("store_items")
      .update({ unit_cost: line.unit_cost, updated_at: new Date().toISOString() })
      .eq("id", line.item_id);
  }

  refreshStore(`${STORE_BASE}/purchases`, `${STORE_BASE}/stock`, `${STORE_BASE}/items`, `${STORE_BASE}/requisitions`, STORE_BASE);
  return { ok: `Received ${purchase.number}.`, href: `${STORE_BASE}/purchases` };
}

export async function createRequisition(formData: FormData) {
  const auth = await requireStore("requisitions");
  if ("error" in auth) return { error: auth.error };
  const supplier_id = text(formData, "supplier_id", 40) || null;
  const notes = text(formData, "notes", 500);
  const intent = text(formData, "intent", 20);
  const asSubmitted = intent === "submit";
  const itemIds = formData.getAll("line_item_id").map(String);
  const descriptions = formData.getAll("line_description").map(String);
  const qtys = formData.getAll("line_qty").map(String);
  const prices = formData.getAll("line_unit_price").map(String);
  const lineNotes = formData.getAll("line_notes").map(String);

  const lines: {
    item_id: string | null;
    description: string;
    qty_requested: number;
    unit_price: number;
    notes: string;
  }[] = [];
  const max = Math.max(itemIds.length, descriptions.length, qtys.length);
  for (let i = 0; i < max; i += 1) {
    const item_id = itemIds[i]?.trim() || null;
    const description = String(descriptions[i] || "").trim();
    const qty_requested = Number(qtys[i]);
    const unit_price = Number(String(prices[i] || "0").replace(/,/g, ""));
    if (!item_id && !description) continue;
    if (!(qty_requested > 0)) return { error: "Each requisition line needs a positive quantity." };
    if (!(unit_price >= 0) || !Number.isFinite(unit_price)) return { error: "Unit prices must be zero or more." };
    lines.push({
      item_id,
      description,
      qty_requested,
      unit_price,
      notes: String(lineNotes[i] || "").trim(),
    });
  }
  if (!lines.length) return { error: "Add at least one requisition line." };

  const settings = await loadSettings(auth.supabase);
  const resolved: {
    item_id: string;
    description: string;
    qty_requested: number;
    unit_price: number;
    notes: string;
  }[] = [];
  for (const line of lines) {
    if (line.item_id) {
      let unit_price = line.unit_price;
      if (!(unit_price > 0)) {
        const { data: item } = await auth.supabase
          .from("store_items")
          .select("unit_price, unit, qty_on_hand")
          .eq("id", line.item_id)
          .maybeSingle();
        unit_price = Number(item?.unit_price || 0);
        if (!line.notes && item) {
          line.notes = stockLeftNote(Number(item.qty_on_hand || 0), String(item.unit || "pcs"));
        }
      }
      resolved.push({
        item_id: line.item_id,
        description: line.description || "",
        qty_requested: line.qty_requested,
        unit_price,
        notes: line.notes || stockLeftNote(0),
      });
      continue;
    }
    const ensured = await ensureStoreItemByName(auth.supabase, line.description, {
      defaultReorderLevel: settings.default_reorder_level,
      notes: "Added from requisition",
    });
    if (ensured.error || !ensured.id) return { error: ensured.error || `Could not add "${line.description}" to the catalogue.` };
    resolved.push({
      item_id: ensured.id,
      description: ensured.name,
      qty_requested: line.qty_requested,
      unit_price: line.unit_price,
      notes: line.notes || stockLeftNote(0),
    });
  }

  const numbered = await nextStoreNumber(auth.supabase, "requisition");
  if (numbered.error || !numbered.number) return { error: numbered.error || "Could not allocate requisition number." };

  const { data: req, error } = await auth.supabase
    .from("store_requisitions")
    .insert({
      number: numbered.number,
      status: asSubmitted ? "submitted" : "draft",
      source: "manual",
      supplier_id,
      notes,
      created_by: auth.user.id,
      submitted_at: asSubmitted ? new Date().toISOString() : null,
    })
    .select("id, number")
    .single();
  if (error || !req) return { error: error?.message || "Could not create requisition." };

  const { error: lineError } = await auth.supabase.from("store_requisition_lines").insert(
    resolved.map((line, index) => ({
      requisition_id: req.id,
      item_id: line.item_id,
      description: line.description,
      qty_requested: line.qty_requested,
      unit_price: line.unit_price,
      notes: line.notes,
      sort_order: index,
    })),
  );
  if (lineError) {
    await auth.supabase.from("store_requisitions").delete().eq("id", req.id);
    return { error: lineError.message };
  }

  refreshStore(`${STORE_BASE}/requisitions`, `${STORE_BASE}/items`, `${STORE_BASE}/stock`, STORE_BASE);
  const view = asSubmitted ? "submitted" : "draft";
  return {
    ok: asSubmitted ? `Submitted ${req.number}.` : `Saved draft ${req.number}.`,
    href: `${STORE_BASE}/requisitions?id=${req.id}&status=${view}`,
  };
}

export async function generateLowStockRequisition() {
  const auth = await requireStore("requisitions", "stock", "items");
  if ("error" in auth) return { error: auth.error };
  const settings = await loadSettings(auth.supabase);
  const { data: items, error } = await auth.supabase
    .from("store_items")
    .select("id, sku, name, qty_on_hand, reorder_level, unit, unit_price, active")
    .eq("active", true)
    .limit(2000);
  if (error) return { error: error.message };
  const low = (items || []).filter((row) => Number(row.qty_on_hand) <= Number(row.reorder_level));
  if (!low.length) return { error: "No low-stock items to requisition." };

  const numbered = await nextStoreNumber(auth.supabase, "requisition");
  if (numbered.error || !numbered.number) return { error: numbered.error || "Could not allocate requisition number." };

  const { data: req, error: reqError } = await auth.supabase
    .from("store_requisitions")
    .insert({
      number: numbered.number,
      status: "draft",
      source: "low_stock",
      notes: "Auto-generated from low stock.",
      created_by: auth.user.id,
    })
    .select("id, number")
    .single();
  if (reqError || !req) return { error: reqError?.message || "Could not create requisition." };

  const { error: lineError } = await auth.supabase.from("store_requisition_lines").insert(
    low.map((item, index) => ({
      requisition_id: req.id,
      item_id: item.id,
      description: `${item.sku} · ${item.name}`,
      qty_requested: qtyNeededForReorder(item, settings.default_reorder_level),
      unit_price: Number(item.unit_price || 0),
      notes: stockLeftNote(Number(item.qty_on_hand || 0), String(item.unit || "pcs")),
      sort_order: index,
    })),
  );
  if (lineError) {
    await auth.supabase.from("store_requisitions").delete().eq("id", req.id);
    return { error: lineError.message };
  }

  refreshStore(`${STORE_BASE}/requisitions`, `${STORE_BASE}/stock`, STORE_BASE);
  return {
    ok: `Draft ${req.number} ready with ${low.length} line${low.length === 1 ? "" : "s"}.`,
    href: `${STORE_BASE}/requisitions?id=${req.id}&status=draft`,
  };
}

export async function updateRequisitionStatus(formData: FormData) {
  const auth = await requireStore("requisitions");
  if ("error" in auth) return { error: auth.error };
  const id = text(formData, "id", 40);
  const status = text(formData, "status", 30) as RequisitionStatus;
  if (!id) return { error: "Missing requisition." };
  if (status !== "draft" && status !== "submitted") return { error: "Status must be draft or submitted." };
  const patch: Record<string, string | null> = { status, updated_at: new Date().toISOString() };
  if (status === "submitted") patch.submitted_at = new Date().toISOString();
  if (status === "draft") patch.submitted_at = null;
  const { error } = await auth.supabase.from("store_requisitions").update(patch).eq("id", id);
  if (error) return { error: error.message };
  refreshStore(`${STORE_BASE}/requisitions`, STORE_BASE);
  return {
    ok: status === "submitted" ? "Requisition submitted." : "Returned to draft.",
    href: `${STORE_BASE}/requisitions?id=${id}&status=${status}`,
  };
}

export async function deleteRequisition(formData: FormData) {
  const auth = await requireStore("requisitions");
  if ("error" in auth) return { error: auth.error };
  const id = text(formData, "id", 40);
  if (!id) return { error: "Missing requisition." };
  const { data: existing } = await auth.supabase.from("store_requisitions").select("id, number").eq("id", id).maybeSingle();
  if (!existing) return { error: "Requisition not found." };
  const { error } = await auth.supabase.from("store_requisitions").delete().eq("id", id);
  if (error) return { error: error.message };
  refreshStore(`${STORE_BASE}/requisitions`, STORE_BASE);
  return { ok: `${existing.number} deleted.`, href: `${STORE_BASE}/requisitions` };
}

export async function addRequisitionUnavailableLine(formData: FormData) {
  const auth = await requireStore("requisitions");
  if ("error" in auth) return { error: auth.error };
  const requisition_id = text(formData, "requisition_id", 40);
  const description = text(formData, "description", 200);
  const qty_requested = num(formData, "qty_requested");
  const notes = text(formData, "notes", 300);
  if (!requisition_id) return { error: "Missing requisition." };
  if (description.length < 2) return { error: "Describe the unavailable item." };
  if (!(qty_requested > 0)) return { error: "Enter a positive quantity." };

  const settings = await loadSettings(auth.supabase);
  const unit_price = num(formData, "unit_price");
  const ensured = await ensureStoreItemByName(auth.supabase, description, {
    defaultReorderLevel: settings.default_reorder_level,
    notes: "Added from requisition",
  });
  if (ensured.error || !ensured.id) return { error: ensured.error || "Could not add item to the catalogue." };

  const { data: reqRow } = await auth.supabase
    .from("store_requisitions")
    .select("id, status")
    .eq("id", requisition_id)
    .maybeSingle();
  if (!reqRow) return { error: "Requisition not found." };
  if (reqRow.status !== "draft") return { error: "Only draft requisitions can be edited. Return it to draft first." };

  let price = Number.isFinite(unit_price) && unit_price >= 0 ? unit_price : 0;
  if (!(price > 0)) {
    const { data: item } = await auth.supabase
      .from("store_items")
      .select("unit_price, qty_on_hand, unit")
      .eq("id", ensured.id)
      .maybeSingle();
    price = Number(item?.unit_price || 0);
  }

  const { count } = await auth.supabase
    .from("store_requisition_lines")
    .select("id", { count: "exact", head: true })
    .eq("requisition_id", requisition_id);
  const { error } = await auth.supabase.from("store_requisition_lines").insert({
    requisition_id,
    item_id: ensured.id,
    description: ensured.name,
    qty_requested,
    unit_price: price,
    notes: notes || stockLeftNote(0),
    sort_order: (count ?? 0) + 1,
  });
  if (error) return { error: error.message };
  refreshStore(`${STORE_BASE}/requisitions`, `${STORE_BASE}/items`, `${STORE_BASE}/stock`, STORE_BASE);
  return {
    ok: ensured.created
      ? `"${ensured.name}" added to the catalogue at 0 units and to this requisition.`
      : "Item added to requisition.",
  };
}

export async function saveSettings(formData: FormData) {
  const auth = await requireStore("settings");
  if ("error" in auth) return { error: auth.error };
  const default_reorder_level = num(formData, "default_reorder_level");
  const issue_prefix = text(formData, "issue_prefix", 12) || "ISS";
  const requisition_prefix = text(formData, "requisition_prefix", 12) || "REQ";
  const purchase_prefix = text(formData, "purchase_prefix", 12) || "GRN";
  const currency_label = text(formData, "currency_label", 8) || "UGX";
  if (!(default_reorder_level >= 0)) return { error: "Default reorder level must be zero or more." };
  const { error } = await auth.supabase
    .from("store_settings")
    .upsert({
      id: 1,
      default_reorder_level,
      issue_prefix,
      requisition_prefix,
      purchase_prefix,
      currency_label,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  refreshStore(`${STORE_BASE}/settings`);
  return { ok: "Settings saved." };
}
