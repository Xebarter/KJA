/*
 * Branded layout for staff alert emails. Table-based with inline styles so it renders the
 * same in Gmail, Outlook and Apple Mail, and every value is escaped before it reaches the HTML.
 */

export type Tone = "gold" | "green" | "navy" | "red";
export type EmailLink = { label: string; href: string };
export type DetailRow = { label: string; value: string | null | undefined; href?: string | null; note?: string | null };
export type DetailSection = { title: string; rows: DetailRow[] };

export type AlertEmail = {
  /** Small label beside the logo, e.g. "Admissions". */
  kicker: string;
  /** Inbox preview line. */
  preheader: string;
  badge: { label: string; tone: Tone };
  title: string;
  greeting: string;
  intro: string;
  spotlight: { eyebrow: string; name: string; meta: string[]; facts: { label: string; value: string }[] };
  sections: DetailSection[];
  quote?: { title: string; body: string; more?: EmailLink | null } | null;
  primary: EmailLink;
  quickLinks?: EmailLink[];
  steps?: { title: string; items: string[] } | null;
  reference?: string | null;
  sentAt: string;
  /** Replaces the admin notice under the card, for emails that go to parents. */
  footer?: string[];
};

const C = {
  navy: "#19232b",
  navySoft: "#24323d",
  body: "#3c4650",
  muted: "#6b747c",
  faint: "#98a1a9",
  line: "#ece6db",
  canvas: "#f3efe8",
  panel: "#faf7f1",
  red: "#e42435",
  redDeep: "#a3111e",
  gold: "#fda31b",
  goldDeep: "#a86400",
};

const TONES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  gold: { bg: "#fff3dc", fg: "#8a5300", dot: C.gold },
  green: { bg: "#e5f4eb", fg: "#14663a", dot: "#1b854a" },
  navy: { bg: "#e8edf2", fg: C.navy, dot: C.navy },
  red: { bg: "#fdebed", fg: C.redDeep, dot: C.red },
};

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',Times,serif";

export function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const paragraphs = (value: string) => esc(value.trim()).replace(/\r?\n/g, "<br>");
const filled = (rows: DetailRow[]) => rows.filter((row) => row.value && row.value.trim());

function badge({ label, tone }: AlertEmail["badge"]) {
  const t = TONES[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background:${t.bg};border-radius:999px;padding:6px 14px 6px 12px;font-family:${SANS};font-size:12px;line-height:16px;font-weight:700;letter-spacing:.4px;color:${t.fg};">
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.dot};margin-right:7px;vertical-align:1px;"></span>${esc(label)}</td>
</tr></table>`;
}

function spotlight(data: AlertEmail["spotlight"]) {
  const width = Math.floor(100 / Math.max(1, data.facts.length));
  const facts = data.facts
    .map(
      (fact, index) => `<td class="kja-fact" width="${width}%" valign="top" style="padding:16px ${index === data.facts.length - 1 ? 0 : 12}px 0 0;">
<div style="font-family:${SANS};font-size:11px;line-height:14px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#9fb0bf;">${esc(fact.label)}</div>
<div style="font-family:${SANS};font-size:15px;line-height:21px;font-weight:700;color:#ffffff;padding-top:4px;">${esc(fact.value)}</div></td>`,
    )
    .join("");
  const meta = data.meta.filter(Boolean).map(esc).join(`<span style="color:${C.gold};">&nbsp;&nbsp;&bull;&nbsp;&nbsp;</span>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.navy};border-radius:14px;">
<tr><td style="height:4px;line-height:4px;font-size:0;border-radius:14px 14px 0 0;background:${C.gold};background-image:linear-gradient(90deg,${C.red},${C.gold});">&nbsp;</td></tr>
<tr><td class="kja-pad-sm" style="padding:22px 26px 24px;">
<div style="font-family:${SANS};font-size:11px;line-height:14px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${C.gold};">${esc(data.eyebrow)}</div>
<div class="kja-name" style="font-family:${SERIF};font-size:26px;line-height:32px;color:#ffffff;padding-top:8px;">${esc(data.name)}</div>
${meta ? `<div style="font-family:${SANS};font-size:14px;line-height:21px;color:#c9d2da;padding-top:6px;">${meta}</div>` : ""}
${facts ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:1px solid #33434f;"><tr>${facts}</tr></table>` : ""}
</td></tr></table>`;
}

function section(data: DetailSection) {
  const rows = filled(data.rows);
  if (!rows.length) return "";
  const body = rows
    .map((row, index) => {
      const value = esc(String(row.value).trim());
      const shown = row.href
        ? `<a href="${esc(row.href)}" style="color:${C.redDeep};text-decoration:none;font-weight:600;">${value}</a>`
        : value;
      const note = row.note ? `<div style="font-size:12px;line-height:17px;font-weight:400;color:${C.muted};padding-top:2px;">${esc(row.note)}</div>` : "";
      const border = index === 0 ? "" : `border-top:1px solid ${C.line};`;
      return `<tr>
<td class="kja-label" width="38%" valign="top" style="${border}padding:11px 12px 11px 0;font-family:${SANS};font-size:13px;line-height:19px;color:${C.muted};">${esc(row.label)}</td>
<td class="kja-value" valign="top" style="${border}padding:11px 0;font-family:${SANS};font-size:14px;line-height:20px;font-weight:600;color:${C.navy};">${shown}${note}</td>
</tr>`;
    })
    .join("");
  return `<tr><td class="kja-pad" style="padding:30px 40px 0;">
<div style="font-family:${SANS};font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:${C.navy};">${esc(data.title)}</div>
<div style="width:28px;height:2px;line-height:2px;font-size:0;background:${C.gold};margin:8px 0 6px;">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
</td></tr>`;
}

function quote(data: NonNullable<AlertEmail["quote"]>) {
  const more = data.more
    ? `<div style="padding-top:12px;font-family:${SANS};font-size:13px;line-height:18px;"><a href="${esc(data.more.href)}" style="color:${C.redDeep};font-weight:700;text-decoration:none;">${esc(data.more.label)} &rarr;</a></div>`
    : "";
  return `<tr><td class="kja-pad" style="padding:30px 40px 0;">
<div style="font-family:${SANS};font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:${C.navy};">${esc(data.title)}</div>
<div style="width:28px;height:2px;line-height:2px;font-size:0;background:${C.gold};margin:8px 0 14px;">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background:${C.panel};border-left:3px solid ${C.gold};border-radius:0 10px 10px 0;padding:18px 20px;font-family:${SANS};font-size:15px;line-height:24px;color:${C.body};">${paragraphs(data.body)}${more}</td>
</tr></table>
</td></tr>`;
}

function button(link: EmailLink) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td align="center" bgcolor="${C.red}" style="border-radius:10px;background:${C.red};box-shadow:0 6px 16px rgba(228,36,53,.25);">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(link.href)}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="20%" stroke="f" fillcolor="${C.red}"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${esc(link.label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${esc(link.href)}" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(link.label)}&nbsp;&nbsp;&rarr;</a><!--<![endif]-->
</td></tr></table>`;
}

function quickLinks(links: EmailLink[]) {
  if (!links.length) return "";
  const items = links
    .map((link) => `<a href="${esc(link.href)}" style="color:${C.navy};font-weight:600;text-decoration:none;border-bottom:1px solid ${C.gold};">${esc(link.label)}</a>`)
    .join(`<span style="color:${C.faint};">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>`);
  return `<div style="padding-top:18px;font-family:${SANS};font-size:13px;line-height:22px;color:${C.muted};text-align:center;">${items}</div>`;
}

function steps(data: NonNullable<AlertEmail["steps"]>) {
  const items = data.items
    .map(
      (item, index) => `<tr>
<td width="34" valign="top" style="padding:6px 0;"><div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:${C.navy};color:${C.gold};text-align:center;font-family:${SANS};font-size:12px;font-weight:800;">${index + 1}</div></td>
<td valign="top" style="padding:8px 0 6px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.body};">${esc(item)}</td>
</tr>`,
    )
    .join("");
  return `<tr><td class="kja-pad" style="padding:32px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.panel};border:1px solid ${C.line};border-radius:12px;"><tr><td style="padding:18px 20px 14px;">
<div style="font-family:${SANS};font-size:14px;line-height:20px;font-weight:800;color:${C.navy};padding-bottom:6px;">${esc(data.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
</td></tr></table>
</td></tr>`;
}

export function renderAlertEmail(email: AlertEmail, siteUrl: string) {
  const site = siteUrl.replace(/\/+$/, "");
  const reference = email.reference
    ? `<div style="padding-top:22px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.faint};text-align:center;">Reference&nbsp; <span style="font-family:Menlo,Consolas,monospace;color:${C.muted};letter-spacing:.5px;">${esc(email.reference)}</span></div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(email.title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { color:${C.redDeep}; }
  @media only screen and (max-width:620px) {
    .kja-card { width:100% !important; border-radius:0 !important; }
    .kja-outer { padding:0 !important; }
    .kja-pad { padding-left:22px !important; padding-right:22px !important; }
    .kja-pad-sm { padding-left:20px !important; padding-right:20px !important; }
    .kja-title { font-size:26px !important; line-height:32px !important; }
    .kja-name { font-size:23px !important; line-height:29px !important; }
    .kja-fact { display:block !important; width:100% !important; padding:12px 0 0 !important; }
    .kja-label, .kja-value { display:block !important; width:100% !important; }
    .kja-label { padding-bottom:0 !important; }
    .kja-value { border-top:0 !important; padding-top:2px !important; }
    .kja-kicker { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.canvas};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.canvas};opacity:0;">${esc(email.preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas};">
<tr><td class="kja-outer" align="center" style="padding:32px 12px 40px;">

<table role="presentation" class="kja-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 18px 40px rgba(25,35,43,.08);">
<tr><td style="height:5px;line-height:5px;font-size:0;background:${C.red};background-image:linear-gradient(90deg,${C.red} 0%,${C.red} 55%,${C.gold} 55%,${C.gold} 100%);">&nbsp;</td></tr>

<tr><td class="kja-pad" style="padding:26px 40px 22px;border-bottom:1px solid ${C.line};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><a href="${esc(site)}" style="text-decoration:none;"><img src="${esc(site)}/images/kja-logo.png" width="190" height="46" alt="Kampala Junior Academy" style="display:block;width:190px;height:auto;max-width:190px;font-family:${SERIF};font-size:18px;font-weight:bold;color:${C.navy};"></a></td>
<td class="kja-kicker" valign="middle" align="right" style="font-family:${SANS};font-size:11px;line-height:14px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${C.goldDeep};white-space:nowrap;">${esc(email.kicker)}</td>
</tr></table>
</td></tr>

<tr><td class="kja-pad" style="padding:34px 40px 0;">
${badge(email.badge)}
<h1 class="kja-title" style="margin:16px 0 0;font-family:${SERIF};font-size:30px;line-height:37px;font-weight:normal;color:${C.navy};">${esc(email.title)}</h1>
<p style="margin:16px 0 0;font-family:${SANS};font-size:16px;line-height:25px;color:${C.body};">Hi ${esc(email.greeting)},</p>
<p style="margin:10px 0 0;font-family:${SANS};font-size:16px;line-height:25px;color:${C.body};">${paragraphs(email.intro)}</p>
</td></tr>

<tr><td class="kja-pad" style="padding:26px 40px 0;">${spotlight(email.spotlight)}</td></tr>

${email.sections.map(section).join("\n")}
${email.quote?.body.trim() ? quote(email.quote) : ""}

<tr><td class="kja-pad" align="center" style="padding:36px 40px 0;">
${button(email.primary)}
${quickLinks(email.quickLinks ?? [])}
</td></tr>

${email.steps?.items.length ? steps(email.steps) : ""}

<tr><td class="kja-pad" style="padding:0 40px 34px;">${reference}</td></tr>
</table>

<table role="presentation" class="kja-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td class="kja-pad" align="center" style="padding:26px 40px 0;font-family:${SANS};font-size:12px;line-height:19px;color:${C.muted};">
<strong style="color:${C.navy};letter-spacing:.3px;">Kampala Junior Academy</strong><br>
${email.footer
    ? email.footer.map(esc).join("<br>")
    : `You're receiving this because you're an admin on the school website dashboard.<br>
Admins are managed on the <a href="${esc(site)}/admin/team" style="color:${C.navy};font-weight:600;">Team page</a>. Sent automatically on ${esc(email.sentAt)} (Kampala time).`}
</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;

  return { html, text: renderText(email) };
}

function renderText(email: AlertEmail) {
  const lines: string[] = [`${email.badge.label.toUpperCase()} · ${email.kicker}`, "", email.title, "=".repeat(email.title.length), ""];
  lines.push(`Hi ${email.greeting},`, "", email.intro.trim(), "");
  lines.push(`${email.spotlight.eyebrow}: ${email.spotlight.name}`);
  if (email.spotlight.meta.length) lines.push(email.spotlight.meta.filter(Boolean).join(" · "));
  for (const fact of email.spotlight.facts) lines.push(`${fact.label}: ${fact.value}`);
  for (const data of email.sections) {
    const rows = filled(data.rows);
    if (!rows.length) continue;
    lines.push("", data.title.toUpperCase(), "-".repeat(data.title.length));
    for (const row of rows) lines.push(`${row.label}: ${String(row.value).trim()}${row.note ? ` (${row.note})` : ""}`);
  }
  if (email.quote?.body.trim()) {
    lines.push("", email.quote.title.toUpperCase(), "-".repeat(email.quote.title.length), email.quote.body.trim());
    if (email.quote.more) lines.push(`${email.quote.more.label}: ${email.quote.more.href}`);
  }
  lines.push("", `${email.primary.label}: ${email.primary.href}`);
  for (const link of email.quickLinks ?? []) lines.push(`${link.label}: ${link.href}`);
  if (email.steps?.items.length) {
    lines.push("", email.steps.title);
    email.steps.items.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }
  if (email.reference) lines.push("", `Reference: ${email.reference}`);
  lines.push(
    "",
    "—",
    "Kampala Junior Academy",
    ...(email.footer ?? ["You're receiving this because you're an admin on the school website dashboard.", `Sent automatically on ${email.sentAt} (Kampala time).`]),
  );
  return lines.join("\n");
}
