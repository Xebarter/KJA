"use server";

import { ACCOUNTS_BASE, logAccounts, refreshAccounts, requireAccounts } from "@/lib/accounts";
import { day, kampalaToday, overdueText, ugx, type BalanceRow } from "@/lib/accounts-format";
import { renderAlertEmail } from "@/lib/email/layout";
import { emailSetupProblem, sendEmail } from "@/lib/email/send";
import { SITE_URL } from "@/lib/newsroom";
import { getContent } from "@/lib/content";
import { EMAIL, type ActionResult } from "@/lib/office-forms";
import { className, isUuid } from "@/lib/students";

const MAX_FAMILIES = 150;

/** Emails each family once with what every one of their children owes. */
export async function sendReminders(studentIds: string[], message: string): Promise<ActionResult> {
  const auth = await requireAccounts("debtors");
  if ("error" in auth) return { error: auth.error };
  const problem = emailSetupProblem();
  if (problem) return { error: problem };
  const ids = [...new Set(studentIds.filter(isUuid))];
  if (!ids.length) return { error: "Choose who to remind." };
  const { supabase, user } = auth;

  const { data, error } = await supabase.from("student_balances").select("*").in("student_id", ids).gt("balance", 0);
  if (error) return { error: error.message };
  const rows = (data || []) as BalanceRow[];
  if (!rows.length) return { error: "None of the chosen pupils owe anything now." };

  const groups = new Map<string, BalanceRow[]>();
  for (const row of rows) {
    const key = row.family_id ?? `pupil:${row.student_id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  if (groups.size > MAX_FAMILIES) return { error: `That's ${groups.size} families. Send at most ${MAX_FAMILIES} at a time.` };

  const familyIds = [...groups.keys()].filter(isUuid);
  const emails = new Map<string, string[]>();
  if (familyIds.length) {
    const { data: guardians } = await supabase
      .from("guardians")
      .select("family_id, email, is_primary")
      .in("family_id", familyIds)
      .not("email", "is", null)
      .order("is_primary", { ascending: false });
    for (const guardian of guardians || []) {
      const email = String(guardian.email).trim().toLowerCase();
      if (!EMAIL.test(email)) continue;
      const list = emails.get(guardian.family_id) ?? [];
      if (!list.includes(email) && list.length < 2) list.push(email);
      emails.set(guardian.family_id, list);
    }
  }

  const { settings } = await getContent();
  const note = message.replace(/\r\n/g, "\n").trim().slice(0, 1200);
  const today = kampalaToday();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const log: { student_id: string; family_id: string | null; sent_to: string; amount: number; status: string; error: string | null; sent_by: string }[] = [];

  for (const [key, children] of groups) {
    const familyId = isUuid(key) ? key : null;
    const to = familyId ? emails.get(familyId) ?? [] : [];
    const fallback = children[0].contact_email?.trim().toLowerCase();
    if (!to.length && fallback && EMAIL.test(fallback)) to.push(fallback);
    if (!to.length) {
      skipped += 1;
      continue;
    }
    const total = children.reduce((sum, child) => sum + Number(child.balance), 0);
    const oldest = children.map((child) => child.oldest_due).filter(Boolean).sort()[0] ?? null;
    const first = children[0];
    const family = first.mailing_name || first.contact_name || "Parent";
    const email = renderAlertEmail(
      {
        kicker: "Accounts",
        preheader: `School fees balance of ${ugx(total)} for ${children.map((child) => child.full_name).join(", ")}.`,
        badge: { label: oldest && oldest < today ? "Payment overdue" : "Fees reminder", tone: oldest && oldest < today ? "red" : "gold" },
        title: "School fees reminder",
        greeting: `Dear ${first.contact_name || family},`,
        intro: note || `This is a friendly reminder that school fees of ${ugx(total)} are outstanding. Please clear the balance or speak to the accounts office about a payment plan.`,
        spotlight: {
          eyebrow: "Balance due",
          name: ugx(total),
          meta: [family, first.family_code ? `Family ${first.family_code}` : ""],
          facts: [
            { label: "Children", value: String(children.length) },
            { label: "Oldest due", value: oldest ? day(oldest) : "Now" },
            { label: "Status", value: oldest ? overdueText(oldest, today) : "Due" },
          ],
        },
        sections: [
          {
            title: "What's owed",
            rows: children.map((child) => ({
              label: child.full_name,
              value: ugx(Number(child.balance)),
              note: `${className(child.class_code)} · ${child.student_number}`,
            })),
          },
          {
            title: "How to pay",
            rows: [
              { label: "Bank, mobile money or SchoolPay", value: "Quote the pupil's name and student number as the reference" },
              { label: "In person", value: "Accounts office, during school hours" },
              { label: "Questions", value: [settings.phone, settings.email].filter(Boolean).join(" · ") },
            ],
          },
        ],
        primary: { label: "View fees in the parent portal", href: `${SITE_URL}/account/fees` },
        reference: first.family_code ? `FAM-${first.family_code}` : first.student_number,
        sentAt: new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Kampala" }),
        footer: [
          "You're receiving this because you're listed as a parent or guardian at Kampala Junior Academy.",
          "If you've already paid, thank you, and please ignore this message. Payments can take a day or two to show.",
        ],
      },
      SITE_URL,
    );
    let status = "sent";
    let failure: string | null = null;
    for (const address of to) {
      try {
        await sendEmail({
          to: address,
          subject: `School fees reminder: ${ugx(total)} due`,
          html: email.html,
          text: email.text,
          replyTo: settings.email || null,
          idempotencyKey: `fee-reminder-${key}-${address}-${today}-${total}`,
        });
      } catch (sendError) {
        status = "failed";
        failure = sendError instanceof Error ? sendError.message.slice(0, 300) : "Send failed";
      }
    }
    if (status === "sent") sent += 1;
    else failed += 1;
    for (const child of children) {
      log.push({ student_id: child.student_id, family_id: child.family_id, sent_to: to.join(", "), amount: Number(child.balance), status, error: failure, sent_by: user.id });
    }
  }

  if (log.length) await supabase.from("fee_reminders").insert(log);
  await logAccounts(supabase, user.id, {
    kind: "reminder",
    body: `Sent fee reminders to ${sent} famil${sent === 1 ? "y" : "ies"}${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} without an email address` : ""}`,
  });
  refreshAccounts(`${ACCOUNTS_BASE}/debtors`);
  if (!sent && failed) return { error: `No reminders could be sent. ${log.find((row) => row.error)?.error ?? ""}`.trim() };
  if (!sent && skipped) return { error: `None of the ${skipped} famil${skipped === 1 ? "y has" : "ies have"} an email address on record.` };
  return {
    ok: `Reminders sent to ${sent} famil${sent === 1 ? "y" : "ies"}.`,
    warning: failed || skipped
      ? [failed ? `${failed} failed to send` : "", skipped ? `${skipped} ha${skipped === 1 ? "s" : "ve"} no email address, so call them instead` : ""].filter(Boolean).join("; ") + "."
      : undefined,
  };
}
