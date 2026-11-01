import { NextResponse } from "next/server";
import { libraryLabel, todayKampala } from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";

export async function GET() {
  const auth = await requireLibrary("reports");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 403 });
  const libraryId = auth.activeLibrary;
  const today = todayKampala();

  const { data: loans } = await auth.supabase
    .from("library_loans")
    .select(
      "id, due_at, issued_at, returned_at, borrower_kind, students(full_name, student_number), teaching_staff(full_name), library_items(accession, barcode, library_titles(title))",
    )
    .eq("library_id", libraryId)
    .order("issued_at", { ascending: false })
    .limit(2000);

  const lines = [
    ["loan_id", "title", "accession", "barcode", "borrower", "borrower_kind", "issued_at", "due_at", "returned_at", "overdue"].join(","),
  ];
  for (const row of loans || []) {
    const item = row.library_items as { accession?: string; barcode?: string; library_titles?: { title?: string } | null } | null;
    const pupil = row.students as { full_name?: string; student_number?: string } | null;
    const teacher = row.teaching_staff as { full_name?: string } | null;
    const borrower = pupil?.full_name || teacher?.full_name || "";
    const overdue = !row.returned_at && String(row.due_at) < today ? "yes" : "no";
    const cells = [
      row.id,
      item?.library_titles?.title || "",
      item?.accession || "",
      item?.barcode || "",
      borrower,
      row.borrower_kind,
      row.issued_at,
      row.due_at,
      row.returned_at || "",
      overdue,
    ].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }

  const body = lines.join("\n");
  const filename = `library-${libraryId}-loans-${today}.csv`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Library": libraryLabel(libraryId),
    },
  });
}
