import { revalidatePath } from "next/cache";
import { STORE_BASE } from "@/lib/store-nav";

export function refreshStore(...paths: string[]) {
  revalidatePath(STORE_BASE, "layout");
  for (const path of paths) revalidatePath(path);
}
