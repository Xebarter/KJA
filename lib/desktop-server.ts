import { cookies } from "next/headers";
import { isDesktopProcess } from "@/lib/desktop";

/** True in a Server Component when the desk window set the desktop cookie. */
export async function isDesktopRequest() {
  if (!isDesktopProcess()) return false;
  try {
    const jar = await cookies();
    return jar.get("kja-desktop")?.value === "1";
  } catch {
    return false;
  }
}
