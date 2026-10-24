import { NextResponse } from "next/server";
import { searchPaymentFamilies, searchPupils } from "../actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Fast JSON live-search for the payment form pickers. Prefer this over server actions for typing. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const kind = url.searchParams.get("kind") === "family" ? "family" : "pupil";
  if (q.trim().length < 2) {
    return NextResponse.json(kind === "family" ? { items: [] } : { rows: [] }, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  }

  if (kind === "family") {
    const result = await searchPaymentFamilies(q);
    return NextResponse.json(result, {
      status: result.error ? 400 : 200,
      headers: { "Cache-Control": "private, max-age=8, stale-while-revalidate=20" },
    });
  }

  const result = await searchPupils(q);
  return NextResponse.json(result, {
    status: result.error ? 400 : 200,
    headers: { "Cache-Control": "private, max-age=8, stale-while-revalidate=20" },
  });
}
