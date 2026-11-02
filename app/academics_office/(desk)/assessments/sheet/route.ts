import { requireAcademics } from "@/lib/academics-access";
import { prepareMarksWorkbookResponse } from "@/lib/marks-workbook-export";
import { MarksBookError } from "@/lib/marks-workbook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAcademics();
    if ("error" in auth) return new Response(auth.error, { status: 401 });
    return await prepareMarksWorkbookResponse(request, {
      supabase: auth.supabase,
      userId: auth.user.id,
      office: auth.office,
    });
  } catch (error) {
    console.error("[assessments/sheet]", error);
    const message = error instanceof MarksBookError ? error.message : "The workbook could not be prepared.";
    return new Response(message, { status: error instanceof MarksBookError ? 400 : 500 });
  }
}
