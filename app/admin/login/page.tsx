import { cookies } from "next/headers";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

/** Electron sets `kja-desktop=1` before the desk window loads. */
async function isDesktopLogin() {
  try {
    const jar = await cookies();
    return jar.get("kja-desktop")?.value === "1";
  } catch {
    return false;
  }
}

export default async function LoginPage() {
  const desktop = await isDesktopLogin();
  return (
    <Suspense>
      <LoginForm desktop={desktop} />
    </Suspense>
  );
}
