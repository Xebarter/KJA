import { POST as prepareOfficeWorkbook } from "@/app/academics_office/(desk)/assessments/sheet/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Teacher desk uses the same marks workbook builder as the academics office. */
export async function POST(request: Request) {
  return prepareOfficeWorkbook(request);
}
