import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { embedMarksheetFonts } from "@/lib/marksheet-fonts";
import type { ProgressCodeRow } from "@/lib/nursery-dsba";

const SCHOOL = "Kampala Junior Academy";
const NAVY = rgb(0.098, 0.137, 0.169);
const GOLD = rgb(0.788, 0.635, 0.153);
const INK = rgb(0.098, 0.137, 0.169);
const MUTED = rgb(0.541, 0.506, 0.455);
const LINE = rgb(0.902, 0.882, 0.839);
const PAPER = rgb(0.98, 0.973, 0.957);
const WHITE = rgb(1, 1, 1);
const ZEBRA = rgb(0.969, 0.957, 0.933);

const W = 841.89;
const H = 595.28;
const M = 24;
const CW = W - M * 2;
const FOOT = 34;
const LIMIT = FOOT + 18;
const ROW_H = 15;
const HEAD_H = 36;
const GROUP_H = 14;

export type DsbaMarksheetPdfSkill = {
  id: string;
  description: string;
  domainId: string;
  domainName: string;
};

export type DsbaMarksheetPdfPupil = {
  id: string;
  name: string;
  number: string;
  roll: number;
};

export type DsbaMarksheetPdfInput = {
  term: string;
  classLabel: string;
  sittingName: string;
  kindLabel: string;
  heldOn: string;
  skills: DsbaMarksheetPdfSkill[];
  pupils: DsbaMarksheetPdfPupil[];
  /** studentId|skillId → progress code letter */
  codes: Record<string, string>;
  progressCodes: ProgressCodeRow[];
};

function latin(text: string | null | undefined) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

function fit(text: string, font: PDFFont, size: number, width: number) {
  let value = latin(text);
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > width) value = value.slice(0, -1);
  return `${value.trimEnd()}...`;
}

function fill(page: PDFPage, x: number, y: number, w: number, h: number, color: RGB) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function stroke(page: PDFPage, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: LINE, borderWidth: 0.6 });
}

export async function buildDsbaMarksheetPdf(input: DsbaMarksheetPdfInput) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.sittingName} · ${input.classLabel}`);
  pdf.setAuthor(SCHOOL);
  pdf.setCreator(SCHOOL);
  pdf.setProducer(SCHOOL);

  const { regular, bold } = await embedMarksheetFonts(pdf);
  const skills = input.skills;
  const pupilW = 128;
  const noW = 26;
  const skillW = skills.length ? Math.max(22, Math.min(48, (CW - pupilW - noW) / skills.length)) : 40;
  const tableW = noW + pupilW + skillW * skills.length;

  const groups: { name: string; count: number }[] = [];
  for (const skill of skills) {
    const last = groups[groups.length - 1];
    if (last && last.name === skill.domainName) last.count += 1;
    else groups.push({ name: skill.domainName, count: 1 });
  }
  const hasGroups = groups.length > 1 || (groups.length === 1 && skills.length > 1);

  let page = pdf.addPage([W, H]);
  let y = H - M;

  function header() {
    fill(page, M, y - 38, CW, 38, NAVY);
    page.drawRectangle({ x: M, y: y - 3, width: CW, height: 3, color: GOLD });
    page.drawText(latin(SCHOOL), { x: M + 10, y: y - 16, size: 9, font: bold, color: GOLD });
    page.drawText(fit(input.sittingName, bold, 13, CW - 220), { x: M + 10, y: y - 30, size: 13, font: bold, color: WHITE });
    page.drawText(fit(`${input.classLabel} · ${input.kindLabel} · ${input.heldOn} · ${input.term}`, regular, 8, 210), {
      x: M + CW - 220,
      y: y - 22,
      size: 8,
      font: regular,
      color: WHITE,
    });
    y -= 48;
  }

  function footer(pageNo: number) {
    const legend = input.progressCodes.map((row) => `${row.code}=${row.label}`).join("  ·  ");
    page.drawText(fit(legend, regular, 7, CW - 80), { x: M, y: 16, size: 7, font: regular, color: MUTED });
    page.drawText(String(pageNo), { x: W - M - 18, y: 16, size: 8, font: bold, color: MUTED });
  }

  function ensure(needed: number, pageNo: { n: number }) {
    if (y - needed >= LIMIT) return;
    footer(pageNo.n);
    page = pdf.addPage([W, H]);
    pageNo.n += 1;
    y = H - M;
    header();
    drawHead();
  }

  function drawHead() {
    if (hasGroups) {
      fill(page, M, y - GROUP_H, tableW, GROUP_H, NAVY);
      let x = M + noW + pupilW;
      for (const group of groups) {
        const w = group.count * skillW;
        page.drawText(fit(group.name, bold, 7, w - 4), { x: x + 2, y: y - 10, size: 7, font: bold, color: WHITE });
        x += w;
      }
      y -= GROUP_H;
    }
    fill(page, M, y - HEAD_H, tableW, HEAD_H, PAPER);
    stroke(page, M, y - HEAD_H, tableW, HEAD_H);
    page.drawText("No.", { x: M + 4, y: y - 14, size: 8, font: bold, color: INK });
    page.drawText("Pupil", { x: M + noW + 4, y: y - 14, size: 8, font: bold, color: INK });
    skills.forEach((skill, index) => {
      const x = M + noW + pupilW + index * skillW;
      const label = fit(skill.description, regular, 6.5, skillW - 3);
      page.drawText(label, { x: x + 2, y: y - 12, size: 6.5, font: regular, color: INK });
      if (label.length < skill.description.length) {
        page.drawText(fit(skill.description.slice(label.length - 3), regular, 6.5, skillW - 3), {
          x: x + 2,
          y: y - 22,
          size: 6.5,
          font: regular,
          color: MUTED,
        });
      }
    });
    y -= HEAD_H;
  }

  const pageNo = { n: 1 };
  header();
  drawHead();

  input.pupils.forEach((pupil, index) => {
    ensure(ROW_H, pageNo);
    const bg = index % 2 ? ZEBRA : WHITE;
    fill(page, M, y - ROW_H, tableW, ROW_H, bg);
    stroke(page, M, y - ROW_H, tableW, ROW_H);
    page.drawText(String(index + 1).padStart(2, "0"), { x: M + 4, y: y - 11, size: 8, font: regular, color: MUTED });
    page.drawText(fit(pupil.name, regular, 8, pupilW - 8), { x: M + noW + 4, y: y - 11, size: 8, font: regular, color: INK });
    skills.forEach((skill, col) => {
      const code = input.codes[`${pupil.id}|${skill.id}`] || "—";
      const x = M + noW + pupilW + col * skillW;
      const width = bold.widthOfTextAtSize(code, 8);
      page.drawText(code, { x: x + (skillW - width) / 2, y: y - 11, size: 8, font: bold, color: code === "—" ? MUTED : INK });
    });
    y -= ROW_H;
  });

  footer(pageNo.n);
  return pdf.save();
}
