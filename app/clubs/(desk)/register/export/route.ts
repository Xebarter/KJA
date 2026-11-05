import { loadTerms } from "@/lib/accounts";
import { requireClubs } from "@/lib/clubs-access";
import { listFilters, loadConsentRegister } from "@/lib/clubs-desk";

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function GET(request: Request) {
  const auth = await requireClubs("register");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const url = new URL(request.url);
  const filters = listFilters({
    q: url.searchParams.get("q") || "",
    pay: url.searchParams.get("pay") || "",
    club: url.searchParams.get("club") || "",
    class: url.searchParams.get("class") || "",
    stream: url.searchParams.get("stream") || "",
    campus: url.searchParams.get("campus") || "",
    withdrawn: url.searchParams.get("withdrawn") || "",
  });
  const unpaidOnly = url.searchParams.get("unpaid") === "1" || filters.pay === "unpaid";
  const { current } = await loadTerms(auth.supabase);
  const pack = await loadConsentRegister(auth.supabase, current?.id ?? null, auth.campuses, true);
  if (pack.error) return new Response(pack.error, { status: 500 });

  let rows = pack.rows;
  if (filters.withdrawn === "1") rows = rows.filter((row) => row.withdrawnAt);
  else rows = rows.filter((row) => !row.withdrawnAt);
  if (unpaidOnly) rows = rows.filter((row) => row.status === "unpaid");
  else if (filters.pay) rows = rows.filter((row) => row.status === filters.pay);
  if (filters.club) rows = rows.filter((row) => row.clubId === filters.club);
  if (filters.classCode === "none") rows = rows.filter((row) => !row.classCode);
  else if (filters.classCode) rows = rows.filter((row) => row.classCode === filters.classCode);
  if (filters.stream) rows = rows.filter((row) => row.stream === filters.stream);
  if (filters.campus) rows = rows.filter((row) => (row.campus || "") === filters.campus);
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    rows = rows.filter((row) =>
      `${row.studentName} ${row.studentNumber} ${row.clubTitle} ${row.classLabel} ${row.campus ?? ""}`.toLowerCase().includes(needle),
    );
  }

  const header = ["Pupil", "Number", "Class", "Campus", "Club", "Fee", "Status", "Receipt", "Consented", "Withdrawn"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.studentName,
        row.studentNumber,
        row.classLabel,
        row.campus || "",
        row.clubTitle,
        row.fee,
        row.status,
        row.receiptNo || "",
        row.consentedAt,
        row.withdrawnAt || "",
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];
  const body = `\uFEFF${lines.join("\n")}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kja-club-register.csv"`,
    },
  });
}
