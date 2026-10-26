import { NextResponse } from "next/server";

/** Flutter web (and other browser clients) call these Bearer APIs cross-origin. */
export const parentsApiCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

export function parentsApiOptions() {
  return new NextResponse(null, { status: 204, headers: parentsApiCors });
}

export function parentsJson(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: parentsApiCors,
  });
}
