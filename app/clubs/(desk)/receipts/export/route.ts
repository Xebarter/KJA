import { NextResponse } from "next/server";
import { CLUBS_BASE } from "@/lib/clubs-nav";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(new URL(`${CLUBS_BASE}/accounts/export${url.search}`, url.origin));
}
