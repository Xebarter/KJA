/*
 * Outgoing email. Server only.
 * Uses Resend when RESEND_API_KEY is set, otherwise any SMTP server (Google Workspace, Microsoft 365, Zoho...).
 */
import nodemailer, { type Transporter } from "nodemailer";

export type EmailAttachment = { filename: string; content: Buffer; contentType?: string };

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  attachments?: EmailAttachment[];
  /** Resend drops repeats of the same key for 24 hours, so a retried event can't email twice. */
  idempotencyKey?: string;
};

export type EmailProvider = "resend" | "smtp";

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 20_000;
const DEFAULT_NAME = "Kampala Junior Academy";

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

export function emailProvider(): EmailProvider | null {
  if (env("RESEND_API_KEY")) return "resend";
  if (env("SMTP_HOST")) return "smtp";
  return null;
}

function sender() {
  const from = env("EMAIL_FROM");
  if (from) return from;
  const user = env("SMTP_USER");
  return emailProvider() === "smtp" && user?.includes("@") ? `${DEFAULT_NAME} <${user}>` : null;
}

/** Why email can't be sent yet, in words an admin can act on. Null when everything is in place. */
export function emailSetupProblem() {
  const provider = emailProvider();
  if (!provider) return "No email service is connected. Add RESEND_API_KEY, or SMTP_HOST, SMTP_USER and SMTP_PASS, to the server environment.";
  if (!sender()) return "Set EMAIL_FROM to the address emails should come from, for example \"Kampala Junior Academy <admissions@kja.ug>\".";
  return null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendWithResend(message: EmailMessage, from: string) {
  const body = JSON.stringify({
    from,
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    reply_to: message.replyTo || undefined,
    attachments: message.attachments?.map((file) => ({
      filename: file.filename,
      content: file.content.toString("base64"),
      content_type: file.contentType,
    })),
  });
  const headers: Record<string, string> = { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" };
  if (message.idempotencyKey) headers["Idempotency-Key"] = message.idempotencyKey.slice(0, 256);

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(RESEND_URL, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) return;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= 3) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const delay = Number(response.headers.get("retry-after"));
    await wait(Number.isFinite(delay) && delay > 0 ? Math.min(delay, 5) * 1000 : attempt * 1000);
  }
}

let transport: Transporter | null = null;

function smtp() {
  if (transport) return transport;
  const port = Number(env("SMTP_PORT")) || 587;
  const user = env("SMTP_USER");
  transport = nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port,
    secure: env("SMTP_SECURE") ? env("SMTP_SECURE") === "true" : port === 465,
    auth: user ? { user, pass: env("SMTP_PASS") } : undefined,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  return transport;
}

async function sendWithSmtp(message: EmailMessage, from: string) {
  await smtp().sendMail({
    from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo || undefined,
    attachments: message.attachments?.map((file) => ({ filename: file.filename, content: file.content, contentType: file.contentType })),
  });
}

export async function sendEmail(message: EmailMessage) {
  const problem = emailSetupProblem();
  if (problem) throw new Error(problem);
  const from = sender() as string;
  if (emailProvider() === "resend") await sendWithResend(message, from);
  else await sendWithSmtp(message, from);
}
