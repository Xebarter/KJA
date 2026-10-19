import { ACADEMICS_BASE } from "@/lib/academics-nav";

/** Class marksheet for one assessment sitting: same name, kind and date. */
export function marksheetHref(input: {
  name: string;
  kind: string;
  classCode: string;
  stream: string;
  heldOn: string;
}) {
  const params = new URLSearchParams({
    name: input.name,
    kind: input.kind,
    class: input.classCode,
    stream: input.stream || "-",
  });
  if (input.heldOn) params.set("held", input.heldOn);
  return `${ACADEMICS_BASE}/assessments/marksheet?${params.toString()}`;
}
