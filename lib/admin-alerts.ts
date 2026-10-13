/*
 * Emails every admin on Admin → Team when an admission or job application comes in.
 * Sending happens after the response is sent, so a slow or failing mail service never
 * delays or breaks the parent's or applicant's form.
 */
import { after } from "next/server";
import { ageFrom, formatDate, formatDateTime, whatsappLink } from "@/lib/applications";
import { renderAlertEmail, type AlertEmail, type DetailRow, type EmailLink } from "@/lib/email/layout";
import { emailProvider, emailSetupProblem, sendEmail, type EmailAttachment } from "@/lib/email/send";
import { fileSize, jobReference, type JobDocument } from "@/lib/job-applications";
import { SITE_URL } from "@/lib/newsroom";
import type { PaymentRow } from "@/lib/payments/admission";
import { serviceClient } from "@/lib/supabase/service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A parent sending the form again for the same child within this window doesn't trigger another email. */
const REPEAT_WINDOW_MS = 12 * 3600 * 1000;
/** Stays under the 25 MB limit most mailboxes enforce once attachments are encoded. */
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const COVER_LETTER_PREVIEW = 1500;

type Recipient = { id: string; email: string; greeting: string };

type Alert = {
  key: string;
  subject: string;
  email: Omit<AlertEmail, "greeting" | "sentAt">;
  replyTo?: string | null;
  attachments?: EmailAttachment[];
};

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/+$/, "");
}

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || "";
const now = () => formatDateTime(new Date().toISOString());

function dateOnly(value: string | null | undefined) {
  return value ? formatDate(`${value.slice(0, 10)}T12:00:00Z`) : "";
}

function telHref(phone: string | null | undefined) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

function contactLinks(name: string, email: string | null | undefined, phone: string | null | undefined): EmailLink[] {
  const who = firstName(name) || "them";
  const links: EmailLink[] = [];
  const tel = telHref(phone);
  if (tel) links.push({ label: `Call ${who}`, href: tel });
  const chat = whatsappLink(phone);
  if (chat) links.push({ label: "WhatsApp", href: chat });
  if (email && EMAIL.test(email)) links.push({ label: `Email ${who}`, href: `mailto:${email}` });
  return links;
}

/** Everyone with admin access, which is exactly the list on Admin → Team. */
async function adminRecipients(): Promise<Recipient[]> {
  const db = serviceClient();
  if (!db) {
    console.warn("[admin-alerts] SUPABASE_SERVICE_ROLE_KEY is not set, so admins can't be looked up for email alerts.");
    return [];
  }
  const { data, error } = await db.from("profiles").select("id, full_name, email").eq("role", "admin");
  if (error) {
    console.error("[admin-alerts] could not load admins", error);
    return [];
  }
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const row of data ?? []) {
    const email = String(row.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ id: String(row.id), email, greeting: firstName(row.full_name) || "there" });
  }
  return recipients;
}

async function deliver(alert: Alert) {
  const problem = emailSetupProblem();
  if (problem) {
    console.warn(`[admin-alerts] ${alert.key} not emailed. ${problem}`);
    return;
  }
  const recipients = await adminRecipients();
  if (!recipients.length) {
    console.warn(`[admin-alerts] ${alert.key} not emailed: no admin has an email address on file.`);
    return;
  }
  const sentAt = now();
  let sent = 0;
  // One at a time keeps us inside mail service rate limits.
  for (const recipient of recipients) {
    const { html, text } = renderAlertEmail({ ...alert.email, greeting: recipient.greeting, sentAt }, siteUrl());
    try {
      await sendEmail({
        to: recipient.email,
        subject: alert.subject,
        html,
        text,
        replyTo: alert.replyTo,
        attachments: alert.attachments,
        idempotencyKey: `${alert.key}:${recipient.id}`,
      });
      sent += 1;
    } catch (error) {
      console.error(`[admin-alerts] could not email ${recipient.email} about ${alert.key}`, error);
    }
  }
  console.info(`[admin-alerts] ${alert.key}: emailed ${sent} of ${recipients.length} admins`);
}

function schedule(label: string, task: () => Promise<void>) {
  const run = () => task().catch((error) => console.error(`[admin-alerts] ${label} failed`, error));
  try {
    after(run);
  } catch {
    // Outside a request (scripts, tests) there is nothing to wait for, so send straight away.
    void run();
  }
}

/* ---------------------------------- Admissions ---------------------------------- */

function childRows(row: PaymentRow): DetailRow[] {
  const draft = row.application;
  const age = ageFrom(draft.child_dob);
  return [
    { label: "Full name", value: draft.child_name },
    { label: "Date of birth", value: dateOnly(draft.child_dob), note: age ? `Age ${age}` : null },
    { label: "Class applying for", value: draft.grade || "Not given" },
    { label: "Campus", value: row.campus },
  ];
}

function parentRows(row: PaymentRow): DetailRow[] {
  const draft = row.application;
  return [
    { label: "Name", value: draft.parent_name },
    { label: "Email", value: draft.email, href: draft.email ? `mailto:${draft.email}` : null },
    { label: "Phone", value: draft.phone, href: telHref(draft.phone) },
    { label: "Applied through", value: draft.user_id ? "Parent portal (signed in)" : "Website application form" },
  ];
}

async function isRepeatAttempt(row: PaymentRow) {
  const db = serviceClient();
  if (!db) return false;
  const since = new Date(Date.parse(row.created_at) - REPEAT_WINDOW_MS).toISOString();
  const { data } = await db
    .from("admission_payments")
    .select("payer_email, phone, child_name")
    .neq("id", row.id)
    .gte("created_at", since)
    .lte("created_at", row.created_at)
    .limit(200);
  const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
  const child = norm(row.child_name ?? row.application.child_name);
  const email = norm(row.payer_email);
  return (data ?? []).some(
    (other) => norm(other.child_name) === child && ((email && norm(other.payer_email) === email) || other.phone === row.phone),
  );
}

function admissionAlert(row: PaymentRow): Alert {
  const draft = row.application;
  const site = siteUrl();
  const age = ageFrom(draft.child_dob);
  const grade = draft.grade || "Class not given";

  return {
    key: `admission-application:${row.id}`,
    subject: `New admission application: ${draft.child_name} · ${grade} · ${row.campus} campus`,
    replyTo: draft.email,
    email: {
      kicker: "Admissions",
      preheader: `${draft.parent_name} has applied for ${draft.child_name} to join ${grade} at ${row.campus} campus.`,
      badge: { label: "New application", tone: "gold" },
      title: "New admission application",
      intro: `${draft.parent_name} has just sent in an admission application for ${draft.child_name} through the school website. The details are below.`,
      spotlight: {
        eyebrow: "Applying for admission",
        name: draft.child_name,
        meta: [age ? `Age ${age}` : "", draft.parent_name ? `Parent: ${draft.parent_name}` : ""],
        facts: [
          { label: "Class", value: grade },
          { label: "Campus", value: row.campus },
          { label: "Received", value: formatDateTime(row.created_at) },
        ],
      },
      sections: [
        { title: "Child", rows: childRows(row) },
        { title: "Parent or guardian", rows: parentRows(row) },
      ],
      quote: draft.message ? { title: "Message from the parent", body: draft.message } : null,
      primary: { label: "View applications", href: `${site}/admin/applications` },
      quickLinks: contactLinks(draft.parent_name, draft.email, draft.phone),
      steps: {
        title: "Suggested next steps",
        items: [
          "Review the child's details on the Applications page.",
          "Get in touch with the family within one working day.",
          "Book a school visit or assessment.",
        ],
      },
    },
  };
}

/** A parent has sent in the admission form. One email per application. */
export function notifyAdmissionApplication(row: PaymentRow) {
  schedule(`admission-application:${row.id}`, async () => {
    if (await isRepeatAttempt(row)) return;
    await deliver(admissionAlert(row));
  });
}

/* ------------------------------------ Careers ------------------------------------ */

export type JobAlertInput = {
  id: string;
  vacancyId: string | null;
  role: string;
  fullName: string;
  email: string;
  phone: string;
  location: string | null;
  currentPosition: string | null;
  qualification: string;
  experience: string;
  campus: string | null;
  availableFrom: string | null;
  coverLetter: string;
  documents: JobDocument[];
  files: File[];
};

async function attachmentsFor(input: JobAlertInput) {
  const attached: EmailAttachment[] = [];
  let total = 0;
  for (const [index, doc] of input.documents.entries()) {
    const file = input.files[index];
    if (!file || total + file.size > MAX_ATTACHMENT_BYTES) continue;
    attached.push({ filename: doc.name, content: Buffer.from(await file.arrayBuffer()), contentType: doc.type });
    total += file.size;
  }
  return attached;
}

function jobAlert(input: JobAlertInput, attachments: EmailAttachment[]): Alert {
  const site = siteUrl();
  const href = `${site}/admin/content/vacancies/applications/${input.id}`;
  const attachedNames = new Set(attachments.map((file) => file.filename));
  const letter = input.coverLetter.trim();
  const preview = letter.length > COVER_LETTER_PREVIEW ? `${letter.slice(0, COVER_LETTER_PREVIEW).trimEnd()}…` : letter;
  let supporting = 0;

  return {
    key: `job-application:${input.id}`,
    subject: `New job application: ${input.fullName} for ${input.role}`,
    replyTo: input.email,
    attachments,
    email: {
      kicker: "Careers",
      preheader: `${input.fullName} applied for ${input.role}. ${input.qualification}, ${input.experience.toLowerCase()} experience.`,
      badge: { label: "New applicant", tone: "navy" },
      title: "New job application",
      intro: input.vacancyId
        ? `${input.fullName} has applied for the ${input.role} position through the careers page.${attachments.length ? " Their documents are attached to this email." : ""}`
        : `${input.fullName} has sent a general application through the careers page, not tied to a specific vacancy.${attachments.length ? " Their documents are attached to this email." : ""}`,
      spotlight: {
        eyebrow: `Applying for ${input.role}`,
        name: input.fullName,
        meta: [input.currentPosition ?? "", input.location ?? ""],
        facts: [
          { label: "Qualification", value: input.qualification },
          { label: "Experience", value: input.experience },
          { label: "Available from", value: dateOnly(input.availableFrom) || "Not stated" },
        ],
      },
      sections: [
        {
          title: "Applicant",
          rows: [
            { label: "Full name", value: input.fullName },
            { label: "Email", value: input.email, href: `mailto:${input.email}` },
            { label: "Phone", value: input.phone, href: telHref(input.phone) },
            { label: "Location", value: input.location },
            { label: "Current position", value: input.currentPosition },
          ],
        },
        {
          title: "Role and experience",
          rows: [
            { label: "Applying for", value: input.role, note: input.vacancyId ? null : "General application" },
            { label: "Highest qualification", value: input.qualification },
            { label: "Experience", value: input.experience },
            { label: "Preferred campus", value: input.campus || "Any campus" },
            { label: "Available from", value: dateOnly(input.availableFrom) || "Not stated" },
          ],
        },
        {
          title: "Documents",
          rows: input.documents.map((doc) => ({
            label: doc.kind === "cv" ? "CV" : `Supporting document ${(supporting += 1)}`,
            value: doc.name,
            note: `${fileSize(doc.size)} · ${attachedNames.has(doc.name) ? "attached" : "too large to attach, open it in the dashboard"}`,
          })),
        },
      ],
      quote: preview ? { title: "Cover letter", body: preview, more: { label: "Read the full application", href } } : null,
      primary: { label: "Review the applicant", href },
      quickLinks: contactLinks(input.fullName, input.email, input.phone),
      steps: {
        title: "Suggested next steps",
        items: [
          "Read the CV and cover letter, then rate the applicant on their dashboard page.",
          "Move them to Reviewing or Shortlisted so the hiring board stays up to date.",
          "Use the ready-made replies on their page to acknowledge, invite to interview or decline.",
        ],
      },
      reference: jobReference(input.id),
    },
  };
}

/** Someone has applied through the careers page. CV and documents are attached when they fit. */
export function notifyJobApplication(input: JobAlertInput) {
  schedule(`job-application:${input.id}`, async () => deliver(jobAlert(input, await attachmentsFor(input))));
}

/* ------------------------------------- Setup ------------------------------------- */

export function emailAlertStatus() {
  const provider = emailProvider();
  return { provider: provider === "resend" ? "Resend" : provider === "smtp" ? "SMTP" : null, problem: emailSetupProblem() };
}

/** Sends a sample alert to one admin so the team can check delivery and the look of the emails. */
export async function sendTestAlert(to: { id: string; email: string; name: string | null }) {
  const problem = emailSetupProblem();
  if (problem) return { error: problem };
  if (!EMAIL.test(to.email)) return { error: "Your account doesn't have an email address on file." };
  const site = siteUrl();
  const recipients = await adminRecipients();
  const { html, text } = renderAlertEmail(
    {
      kicker: "Email alerts",
      preheader: "This is a test. Admins on the Team page will get an email like this for every new application.",
      badge: { label: "Test email", tone: "navy" },
      title: "Email alerts are working",
      greeting: firstName(to.name) || "there",
      intro: "You asked for a test from the Team page of the admin dashboard. If you can read this, email alerts are set up correctly. Every admin listed on the Team page gets an email like this when a new application comes in.",
      spotlight: {
        eyebrow: "Delivered to",
        name: to.email,
        meta: [`Sent through ${emailProvider() === "resend" ? "Resend" : "SMTP"}`],
        facts: [
          { label: "Admins emailed", value: String(recipients.length) },
          { label: "Admissions", value: "On" },
          { label: "Job applications", value: "On" },
        ],
      },
      sections: [
        {
          title: "You'll get an email when",
          rows: [
            { label: "Admission application received", value: "As soon as a parent sends in the form", note: "Reply to the email to write straight back to the parent" },
            { label: "Job application received", value: "With the CV and documents attached", note: "Reply to the email to write straight back to the applicant" },
          ],
        },
      ],
      primary: { label: "Open the Team page", href: `${site}/admin/team` },
      quickLinks: [
        { label: "Applications", href: `${site}/admin/applications` },
        { label: "Job applications", href: `${site}/admin/content/vacancies?view=applications` },
      ],
      sentAt: now(),
    },
    site,
  );
  try {
    await sendEmail({ to: to.email, subject: "Test: KJA email alerts are working", html, text });
    return { ok: `Test email sent to ${to.email}. Check your inbox (and spam folder) in a minute.` };
  } catch (error) {
    console.error("[admin-alerts] test email failed", error);
    return { error: `The email service refused the message: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}` };
  }
}
