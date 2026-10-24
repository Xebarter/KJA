import { revalidatePath } from "next/cache";
import { ACADEMICS_BASE } from "@/lib/academics-nav";
import { forgetPrefix } from "@/lib/remember";

/** Bust academics desk caches after a mutation. Server actions / route handlers only. */
export function refreshAcademics(...paths: string[]) {
  // Bust live desk caches without wiping schema/profile remembers or revalidating the whole
  // desk layout (badges load client-side; layout revalidation was blocking soft nav).
  forgetPrefix("academics-badges");
  forgetPrefix("academics-roll");
  forgetPrefix("academics-today");
  forgetPrefix("academics-closures");
  forgetPrefix("academics-picture");
  forgetPrefix("academics-staff");
  for (const path of paths) revalidatePath(path);
  revalidatePath(ACADEMICS_BASE);
  revalidatePath("/account/reports");
  revalidatePath("/teacher");
  revalidatePath("/teacher/assessments");
  revalidatePath("/teacher/attendance");
  revalidatePath("/teacher/homework");
  revalidatePath("/teacher/performance");
  revalidatePath("/teacher/calendar");
  revalidatePath("/admin/team");
}

/** The subject list changed. Leave the pupil roll and sidebar counts in place. */
export function refreshSubjectCatalogue() {
  forgetPrefix("academics-staff");
  revalidatePath(`${ACADEMICS_BASE}/subjects`);
}
