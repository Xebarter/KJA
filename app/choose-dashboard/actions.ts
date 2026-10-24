"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";

export async function leaveDashboard() {
  await signOut();
  redirect("/admin/login");
}
