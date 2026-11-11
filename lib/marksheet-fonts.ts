import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";

const BOOKMAN = "Bookman Old Style";

export const MARKSHEET_FONT_FAMILY = BOOKMAN;

type BookmanFiles = {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
};

async function readFont(file: string) {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

/** Prefer bundled Bookman files, then the Windows font folder (Desktop). */
export async function readBookmanFontFiles(): Promise<BookmanFiles | null> {
  const win = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows";
  const roots = [
    path.join(process.cwd(), "public", "fonts", "bookman"),
    path.join(win, "Fonts"),
  ];
  for (const root of roots) {
    const regular = await readFont(path.join(root, "BOOKOS.TTF"));
    const bold = await readFont(path.join(root, "BOOKOSB.TTF"));
    const italic = await readFont(path.join(root, "BOOKOSI.TTF"));
    if (regular && bold && italic) return { regular, bold, italic };
  }
  return null;
}

export async function embedMarksheetFonts(pdf: PDFDocument): Promise<{
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  family: string;
}> {
  const files = await readBookmanFontFiles();
  if (files) {
    pdf.registerFontkit(fontkit);
    return {
      regular: await pdf.embedFont(files.regular, { subset: true }),
      bold: await pdf.embedFont(files.bold, { subset: true }),
      italic: await pdf.embedFont(files.italic, { subset: true }),
      family: BOOKMAN,
    };
  }
  return {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    family: "Times",
  };
}
