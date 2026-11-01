import { StudentFace } from "@/components/StudentFace";
import { TeacherFace } from "@/components/TeacherFace";

/** Compact name + face for library tables and pickers. */
export function PersonCell({
  kind,
  id,
  name,
  detail,
  photoPath,
}: {
  kind: "pupil" | "teacher";
  id?: string | null;
  name: string;
  detail?: string | null;
  photoPath?: string | null;
}) {
  const faceId = id || "unknown";
  return (
    <div className="lib-person">
      {kind === "pupil" ? (
        <StudentFace id={faceId} name={name} photoPath={photoPath} className="lib-face" />
      ) : (
        <TeacherFace id={faceId} name={name} photoPath={photoPath} className="lib-face" />
      )}
      <span className="lib-person-text">
        <strong>{name}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
}
