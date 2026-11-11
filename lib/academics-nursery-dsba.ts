import { streamOf } from "@/lib/academics";
import { operationalCampus } from "@/lib/campuses";

/** Class/stream/campus key used to scope nursery papers to a class teacher post. */
export function nurseryPostKey(campus: string, classCode: string, stream: string) {
  return `${operationalCampus(campus)}|${classCode}|${streamOf(stream)}`;
}
