import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { PaymentRow } from "@/lib/payments/admission";
import { displayMsisdn } from "@/lib/payments/mobile";

type School = { phone: string; email: string; address: string };

const NAVY = rgb(0.098, 0.137, 0.169);
const NAVY_SOFT = rgb(0.16, 0.21, 0.25);
const RED = rgb(0.894, 0.141, 0.208);
const GOLD = rgb(0.992, 0.639, 0.106);
const GOLD_DEEP = rgb(0.769, 0.463, 0.016);
const INK = rgb(0.098, 0.137, 0.169);
const MUTED = rgb(0.435, 0.396, 0.353);
const LINE = rgb(0.91, 0.87, 0.79);
const TINT = rgb(0.992, 0.976, 0.945);
const GOLD_TINT = rgb(1, 0.957, 0.882);
const GREEN = rgb(0.09, 0.502, 0.239);
const GREEN_TINT = rgb(0.89, 0.961, 0.91);
const WHITE = rgb(1, 1, 1);
const SOFT_WHITE = rgb(0.78, 0.8, 0.82);

/** Standard PDF fonts only cover Latin-1. */
function latin(text: string | null | undefined) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function hundreds(n: number) {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
  const rest = n % 100;
  if (rest) {
    const tail = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
    parts.push(n >= 100 ? `and ${tail}` : tail);
  }
  return parts.join(" ");
}

export function amountInWords(value: number) {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const scales: [number, string][] = [[1_000_000_000, "billion"], [1_000_000, "million"], [1_000, "thousand"], [1, ""]];
  let rest = n;
  const parts: string[] = [];
  for (const [size, label] of scales) {
    const chunk = Math.floor(rest / size);
    rest %= size;
    if (chunk) parts.push(`${hundreds(chunk)}${label ? ` ${label}` : ""}`);
  }
  const text = parts.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function kampalaDate(iso: string | null, withTime = true) {
  const date = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

function fit(text: string, font: PDFFont, size: number, width: number) {
  let value = latin(text);
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > width) value = value.slice(0, -1);
  return `${value.trimEnd()}...`;
}

/** SVG path for a rounded rectangle whose origin is its top-left corner. */
function rounded(w: number, h: number, r: number) {
  return `M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`;
}

async function embed(pdf: PDFDocument, bytes: Uint8Array | null) {
  if (!bytes) return null;
  try {
    return bytes[0] === 0x89 && bytes[1] === 0x50 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function buildReceiptPdf(row: PaymentRow, school: School, crestBytes: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Admission fee receipt ${row.receipt_no ?? ""}`.trim());
  pdf.setAuthor("Kampala Junior Academy");
  pdf.setSubject("Admission fee receipt");
  pdf.setCreator("Kampala Junior Academy");
  pdf.setProducer("Kampala Junior Academy");

  const page = pdf.addPage([595.28, 841.89]);
  const { width: W, height: H } = page.getSize();
  const M = 48;
  const CW = W - 2 * M;
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const crest: PDFImage | null = await embed(pdf, crestBytes);
  const app = row.application;
  const child = row.child_name ?? app.child_name;
  const paid = `UGX ${row.amount.toLocaleString("en-US")}`;

  const text = (value: string, x: number, y: number, size: number, font: PDFFont, color: RGB = INK) =>
    page.drawText(latin(value), { x, y, size, font, color });
  const right = (value: string, xRight: number, y: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = latin(value);
    page.drawText(clean, { x: xRight - font.widthOfTextAtSize(clean, size), y, size, font, color });
  };
  const centered = (value: string, cx: number, y: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = latin(value);
    page.drawText(clean, { x: cx - font.widthOfTextAtSize(clean, size) / 2, y, size, font, color });
  };
  const spacedWidth = (value: string, size: number, font: PDFFont, gap: number) =>
    font.widthOfTextAtSize(value, size) + gap * Math.max(0, value.length - 1);
  const spaced = (value: string, x: number, y: number, size: number, font: PDFFont, color: RGB, gap: number) => {
    let cursor = x;
    for (const char of latin(value)) {
      page.drawText(char, { x: cursor, y, size, font, color });
      cursor += font.widthOfTextAtSize(char, size) + gap;
    }
  };
  const label = (value: string, x: number, y: number, color: RGB = MUTED) => spaced(value.toUpperCase(), x, y, 7, bold, color, 0.9);
  const box = (x: number, top: number, w: number, h: number, options: { fill?: RGB; border?: RGB; radius?: number; borderWidth?: number }) =>
    page.drawSvgPath(rounded(w, h, options.radius ?? 10), {
      x,
      y: top,
      color: options.fill,
      borderColor: options.border,
      borderWidth: options.border ? options.borderWidth ?? 1 : 0,
    });

  // Watermark
  if (crest) {
    const size = 330;
    page.drawImage(crest, { x: (W - size) / 2, y: H / 2 - size / 2 - 60, width: size, height: size, opacity: 0.035 });
  }

  // Header band
  const bandH = 132;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: NAVY });
  page.drawRectangle({ x: W - 210, y: H - bandH, width: 210, height: bandH, color: NAVY_SOFT });
  page.drawRectangle({ x: 0, y: H - bandH - 4, width: W, height: 4, color: GOLD });
  page.drawRectangle({ x: 0, y: H - bandH - 5.5, width: W, height: 1.5, color: RED });

  const crestCx = M + 42;
  const crestCy = H - bandH / 2;
  page.drawCircle({ x: crestCx, y: crestCy, size: 45, color: WHITE, borderColor: GOLD, borderWidth: 2.5 });
  if (crest) page.drawImage(crest, { x: crestCx - 31, y: crestCy - 31, width: 62, height: 62 });

  const nameX = M + 102;
  spaced("KAMPALA JUNIOR ACADEMY", nameX, H - 56, 14, bold, WHITE, 1.1);
  text("Admissions Office", nameX, H - 74, 9.5, bold, GOLD);
  text(fit(school.address, regular, 8.5, 220), nameX, H - 89, 8.5, regular, SOFT_WHITE);
  text(fit(`${school.phone}  |  ${school.email}`, regular, 8.5, 220), nameX, H - 102, 8.5, regular, SOFT_WHITE);

  const tag = "OFFICIAL RECEIPT";
  spaced(tag, W - M - spacedWidth(tag, 8.5, bold, 1.6), H - 52, 8.5, bold, GOLD, 1.6);
  right(row.receipt_no ?? "-", W - M, H - 72, 12.5, bold, WHITE);
  right(`Issued ${kampalaDate(row.paid_at)}`, W - M, H - 88, 8.5, regular, SOFT_WHITE);

  // Title
  let top = H - bandH - 44;
  text("Admission Fee Receipt", M, top, 21, bold, INK);
  text(fit(`Thank you. We have received your payment for ${child}'s application to ${row.campus} campus.`, regular, 9.5, CW), M, top - 18, 9.5, regular, MUTED);
  const pillW = 98;
  box(W - M - pillW, top + 14, pillW, 26, { fill: GREEN_TINT, border: GREEN, radius: 13, borderWidth: 0.8 });
  page.drawCircle({ x: W - M - pillW + 16, y: top + 1, size: 3.2, color: GREEN });
  spaced("PAID IN FULL", W - M - pillW + 25, top - 2, 8, bold, GREEN, 0.7);

  // Amount panel
  top -= 42;
  const amountH = 98;
  box(M, top, CW, amountH, { fill: TINT, border: LINE });
  page.drawRectangle({ x: M, y: top - amountH + 12, width: 3.5, height: amountH - 24, color: GOLD });
  label("Amount received", M + 24, top - 26);
  text(paid, M + 24, top - 60, 30, bold, RED);
  text(fit(`${amountInWords(row.amount)} Uganda shillings only`, italic, 9, CW * 0.55 - 40), M + 24, top - 80, 9, italic, MUTED);
  const splitX = M + CW * 0.58;
  page.drawLine({ start: { x: splitX, y: top - 16 }, end: { x: splitX, y: top - amountH + 16 }, thickness: 1, color: LINE });
  const facts: [string, string][] = [
    ["Date paid", kampalaDate(row.paid_at)],
    ["Payment method", row.network ?? "Mobile money"],
    ["Paid from", displayMsisdn(row.phone)],
  ];
  facts.forEach(([name, value], index) => {
    const y = top - 28 - index * 22;
    text(name, splitX + 20, y, 8.5, regular, MUTED);
    right(fit(value, bold, 9.5, CW - (splitX - M) - 110), W - M - 20, y, 9.5, bold, INK);
  });

  // Payer and application
  top -= amountH + 20;
  const cardH = 106;
  const half = (CW - 16) / 2;
  const cards: [string, RGB, [string, string][]][] = [
    ["Received from", RED, [["Name", row.payer_name ?? app.parent_name], ["Email", row.payer_email ?? app.email], ["Phone", app.phone ?? displayMsisdn(row.phone)]]],
    ["Application", GOLD_DEEP, [["Child", child], ["Campus", `${row.campus} campus`], ["Class", app.grade ?? "To be confirmed"]]],
  ];
  cards.forEach(([title, accent, rows], index) => {
    const x = M + index * (half + 16);
    box(x, top, half, cardH, { border: LINE });
    page.drawCircle({ x: x + 20, y: top - 22, size: 3.5, color: accent });
    text(title, x + 30, top - 25.5, 10.5, bold, INK);
    page.drawLine({ start: { x: x + 16, y: top - 36 }, end: { x: x + half - 16, y: top - 36 }, thickness: 0.6, color: LINE });
    rows.forEach(([name, value], line) => {
      const y = top - 56 - line * 19;
      text(name, x + 16, y, 8.5, regular, MUTED);
      text(fit(value, bold, 9.5, half - 86), x + 70, y, 9.5, bold, INK);
    });
  });

  // Payment summary
  top -= cardH + 24;
  page.drawSvgPath(`M8,0 H${CW - 8} Q${CW},0 ${CW},8 V26 H0 V8 Q0,0 8,0 Z`, { x: M, y: top, color: NAVY });
  spaced("DESCRIPTION", M + 16, top - 17, 7.5, bold, WHITE, 1);
  const amountHead = "AMOUNT (UGX)";
  spaced(amountHead, W - M - 16 - spacedWidth(amountHead, 7.5, bold, 1), top - 17, 7.5, bold, WHITE, 1);

  text(fit(`Admission fee - ${row.campus} campus`, bold, 10.5, CW - 160), M + 16, top - 46, 10.5, bold, INK);
  text(fit(`One-time admission fee for ${child}`, regular, 8.5, CW - 160), M + 16, top - 60, 8.5, regular, MUTED);
  right(row.amount.toLocaleString("en-US"), W - M - 16, top - 46, 10.5, bold, INK);
  page.drawLine({ start: { x: M, y: top - 74 }, end: { x: W - M, y: top - 74 }, thickness: 0.8, color: LINE });

  const totalsW = 236;
  const totalsX = W - M - totalsW;
  text("Subtotal", totalsX + 14, top - 93, 9, regular, MUTED);
  right(paid, W - M - 14, top - 93, 9, regular, INK);
  box(totalsX, top - 104, totalsW, 32, { fill: GOLD_TINT, border: GOLD, radius: 8, borderWidth: 0.8 });
  spaced("TOTAL PAID", totalsX + 14, top - 124, 8.5, bold, INK, 1);
  right(paid, W - M - 14, top - 124.5, 13.5, bold, RED);

  label("Transaction ID", M + 16, top - 93);
  text(fit(row.transaction_ref ?? row.id, regular, 8.5, totalsX - M - 40), M + 16, top - 107, 8.5, regular, INK);
  label("Payment reference", M + 16, top - 124);
  text(row.id.replace(/-/g, "").slice(0, 12).toUpperCase(), M + 16, top - 138, 8.5, regular, INK);

  // Next steps and seal
  top -= 168;
  const noteW = CW - 128;
  box(M, top, noteW, 74, { fill: TINT, border: LINE });
  text("What happens next", M + 18, top - 23, 10.5, bold, INK);
  text(fit("Our admissions team will contact you to arrange a school visit and assessment.", regular, 8.5, noteW - 36), M + 18, top - 41, 8.5, regular, MUTED);
  text(fit("Please keep this receipt. You may be asked to present it during admission.", regular, 8.5, noteW - 36), M + 18, top - 55, 8.5, regular, MUTED);

  const sealX = W - M - 50;
  const sealY = top - 37;
  page.drawCircle({ x: sealX, y: sealY, size: 44, borderColor: GREEN, borderWidth: 2.2, borderOpacity: 0.9 });
  page.drawCircle({ x: sealX, y: sealY, size: 38, borderColor: GREEN, borderWidth: 0.8, borderOpacity: 0.9 });
  const sealTop = "KJA ADMISSIONS";
  spaced(sealTop, sealX - spacedWidth(sealTop, 5.5, bold, 0.8) / 2, sealY + 15, 5.5, bold, GREEN, 0.8);
  centered("PAID", sealX, sealY - 5, 19, bold, GREEN);
  centered(kampalaDate(row.paid_at, false).toUpperCase(), sealX, sealY - 19, 6, bold, GREEN);

  // Footer
  const footH = 46;
  text("This is a computer-generated receipt and is valid without a signature.", M, footH + 22, 8, italic, MUTED);
  right(`Receipt ${row.receipt_no ?? ""}`, W - M, footH + 22, 8, bold, MUTED);
  page.drawRectangle({ x: 0, y: footH, width: W, height: 2.5, color: GOLD });
  page.drawRectangle({ x: 0, y: 0, width: W, height: footH, color: NAVY });
  centered(`${school.phone}   |   ${school.email}   |   kja.ug`, W / 2, 26, 8.5, bold, WHITE);
  centered(fit(school.address, regular, 7.5, CW), W / 2, 13, 7.5, regular, SOFT_WHITE);

  return pdf.save();
}
