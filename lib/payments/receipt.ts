import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PaymentRow } from "@/lib/payments/admission";
import { displayMsisdn } from "@/lib/payments/mobile";

type School = { phone: string; email: string; address: string };

const RED = rgb(0.894, 0.141, 0.208);
const GOLD = rgb(0.992, 0.639, 0.106);
const INK = rgb(0.098, 0.137, 0.169);
const MUTED = rgb(0.435, 0.396, 0.353);
const LINE = rgb(0.933, 0.89, 0.812);
const TINT = rgb(0.988, 0.969, 0.933);
const GREEN = rgb(0.106, 0.522, 0.29);

/** Standard PDF fonts only cover Latin-1. */
function latin(text: string | null | undefined) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00B7/g, "-")
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

function kampalaDate(iso: string | null) {
  const date = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function fit(text: string, font: PDFFont, size: number, width: number) {
  let value = latin(text);
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > width) value = value.slice(0, -1);
  return `${value.trimEnd()}...`;
}

export async function buildReceiptPdf(row: PaymentRow, school: School, logo: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Receipt ${row.receipt_no ?? ""}`.trim());
  pdf.setAuthor("Kampala Junior Academy");
  pdf.setSubject("Admission fee receipt");
  pdf.setCreator("Kampala Junior Academy");
  pdf.setProducer("Kampala Junior Academy");

  const page = pdf.addPage([595.28, 841.89]);
  const { width: W, height: H } = page.getSize();
  const M = 56;
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const text = (p: PDFPage, value: string, x: number, y: number, size: number, font: PDFFont, color = INK) => p.drawText(latin(value), { x, y, size, font, color });
  const right = (p: PDFPage, value: string, xRight: number, y: number, size: number, font: PDFFont, color = INK) => {
    const clean = latin(value);
    p.drawText(clean, { x: xRight - font.widthOfTextAtSize(clean, size), y, size, font, color });
  };
  const label = (value: string, x: number, y: number) => text(page, value.toUpperCase(), x, y, 7.5, bold, MUTED);

  page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: RED });
  page.drawRectangle({ x: 0, y: H - 13, width: W, height: 3, color: GOLD });

  let top = H - 48;
  let drewLogo = false;
  if (logo) {
    try {
      const isPng = logo[0] === 0x89 && logo[1] === 0x50;
      const image = isPng ? await pdf.embedPng(logo) : await pdf.embedJpg(logo);
      const scaled = image.scaleToFit(200, 48);
      page.drawImage(image, { x: M - 4, y: top - scaled.height + 4, width: scaled.width, height: scaled.height });
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }
  if (!drewLogo) text(page, "KAMPALA JUNIOR ACADEMY", M, top - 20, 16, bold);
  text(page, "Admissions Office", M, top - 60, 9.5, bold, INK);
  text(page, fit(school.address, regular, 8.5, 260), M, top - 73, 8.5, regular, MUTED);

  right(page, "RECEIPT", W - M, top - 24, 26, bold, RED);
  right(page, "Admission fee", W - M, top - 40, 10, regular, MUTED);

  top -= 92;
  page.drawLine({ start: { x: M, y: top }, end: { x: W - M, y: top }, thickness: 1, color: LINE });

  top -= 30;
  const col = (W - 2 * M) / 3;
  const meta: [string, string][] = [
    ["Receipt no.", row.receipt_no ?? "-"],
    ["Date paid", kampalaDate(row.paid_at)],
    ["Payment method", row.network ?? "Mobile money"],
  ];
  meta.forEach(([name, value], index) => {
    label(name, M + col * index, top);
    text(page, fit(value, bold, 11, col - 12), M + col * index, top - 16, 11, bold);
  });

  top -= 48;
  const half = (W - 2 * M - 16) / 2;
  const boxHeight = 112;
  const app = row.application;
  const boxes: [string, [string, string][]][] = [
    ["Received from", [["Name", row.payer_name ?? app.parent_name], ["Email", row.payer_email ?? app.email], ["Paid from", displayMsisdn(row.phone)]]],
    ["Application for", [["Child", row.child_name ?? app.child_name], ["Campus", row.campus], ["Class", app.grade ?? "To be confirmed"]]],
  ];
  boxes.forEach(([title, rows], index) => {
    const x = M + index * (half + 16);
    page.drawRectangle({ x, y: top - boxHeight, width: half, height: boxHeight, color: TINT, borderColor: LINE, borderWidth: 1 });
    page.drawRectangle({ x, y: top - boxHeight, width: 3, height: boxHeight, color: index ? GOLD : RED });
    text(page, title, x + 16, top - 22, 10.5, bold);
    rows.forEach(([name, value], line) => {
      const y = top - 44 - line * 20;
      text(page, name, x + 16, y, 8.5, regular, MUTED);
      text(page, fit(value, bold, 9.5, half - 90), x + 78, y, 9.5, bold);
    });
  });

  top -= boxHeight + 34;
  const tableW = W - 2 * M;
  page.drawRectangle({ x: M, y: top - 8, width: tableW, height: 26, color: INK });
  text(page, "DESCRIPTION", M + 14, top + 1, 8, bold, rgb(1, 1, 1));
  right(page, "AMOUNT (UGX)", W - M - 14, top + 1, 8, bold, rgb(1, 1, 1));

  top -= 34;
  text(page, fit(`Admission fee - ${row.campus} campus`, bold, 10.5, tableW - 160), M + 14, top, 10.5, bold);
  text(page, `One-time admission fee for ${fit(row.child_name ?? app.child_name, regular, 9, 220)}`, M + 14, top - 15, 9, regular, MUTED);
  right(page, row.amount.toLocaleString("en-US"), W - M - 14, top, 10.5, bold);

  top -= 32;
  page.drawLine({ start: { x: M, y: top }, end: { x: W - M, y: top }, thickness: 1, color: LINE });
  top -= 28;
  text(page, "Total paid", M + 14, top, 12, bold);
  right(page, `UGX ${row.amount.toLocaleString("en-US")}`, W - M - 14, top, 16, bold, RED);
  top -= 22;
  text(page, `${amountInWords(row.amount)} Uganda shillings only.`, M + 14, top, 9.5, italic, MUTED);

  top -= 20;
  page.drawLine({ start: { x: M, y: top }, end: { x: W - M, y: top }, thickness: 1, color: LINE });

  top -= 28;
  label("Transaction reference", M, top);
  text(page, fit(row.transaction_ref ?? row.id, regular, 9.5, tableW / 2), M, top - 15, 9.5, regular);
  label("Status", M + tableW / 2 + 20, top);
  text(page, "Paid in full", M + tableW / 2 + 20, top - 15, 9.5, bold, GREEN);

  const stampX = W - M - 150;
  const stampY = top + 4;
  page.drawRectangle({ x: stampX, y: stampY, width: 118, height: 44, borderColor: GREEN, borderWidth: 2.5, rotate: degrees(10), opacity: 0, borderOpacity: 0.85 });
  page.drawText("PAID", { x: stampX + 22, y: stampY + 13, size: 24, font: bold, color: GREEN, rotate: degrees(10), opacity: 0.85 });

  top -= 56;
  page.drawRectangle({ x: M, y: top - 46, width: tableW, height: 54, color: TINT, borderColor: LINE, borderWidth: 1 });
  text(page, "What happens next", M + 16, top - 8, 10, bold);
  text(page, "Your application has been received. Our admissions team will contact you to arrange a school visit.", M + 16, top - 24, 8.5, regular, MUTED);
  text(page, "Please keep this receipt for your records and bring it with you to the visit.", M + 16, top - 36, 8.5, regular, MUTED);

  const footY = 64;
  page.drawLine({ start: { x: M, y: footY + 22 }, end: { x: W - M, y: footY + 22 }, thickness: 1, color: LINE });
  text(page, "This receipt was generated electronically and is valid without a signature.", M, footY + 6, 8, italic, MUTED);
  text(page, `${school.phone}  |  ${school.email}  |  kja.ug`, M, footY - 8, 8, regular, MUTED);
  right(page, row.receipt_no ?? "", W - M, footY - 8, 8, bold, MUTED);
  page.drawRectangle({ x: 0, y: 0, width: W, height: 6, color: RED });
  page.drawRectangle({ x: 0, y: 6, width: W, height: 2, color: GOLD });

  return pdf.save();
}
