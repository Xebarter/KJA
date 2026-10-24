import { headers } from "next/headers";

/** Path stamped by middleware so a page can check the grant for the URL being opened. */
export async function requestPath() {
  try {
    const headerList = await headers();
    return headerList.get("x-kja-path");
  } catch {
    return null;
  }
}
