import { getStudentPortal, getStudentSession } from "@/lib/student-portal";

export const metadata = { title: "Timetable" };

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default async function StudentTimetablePage() {
  const portal = await getStudentPortal();
  const student = portal.student;
  if (!student?.class_code) {
    return (
      <div className="hw-empty">
        <i className="fa-solid fa-table-cells" aria-hidden="true" />
        <p>Your class is not set yet, so there is no timetable to show.</p>
      </div>
    );
  }

  const { supabase } = await getStudentSession();
  const term = supabase ? await supabase.from("fee_terms").select("id, label").eq("is_current", true).maybeSingle() : null;
  const termId = term?.data?.id;
  const subjects = supabase ? await supabase.from("subjects").select("id, name") : { data: [] };
  const nameById = new Map((subjects.data || []).map((s) => [s.id, s.name]));

  const slots = termId && supabase
    ? await supabase
        .from("timetable_slots")
        .select("id, weekday, period, starts_at, ends_at, subject_id, room")
        .eq("term_id", termId)
        .eq("class_code", student.class_code)
        .eq("stream", student.stream || "")
        .order("weekday")
        .order("period")
    : { data: [] };

  const byDay = new Map<number, typeof slots.data>();
  for (const slot of slots.data || []) {
    const list = byDay.get(slot.weekday) || [];
    list.push(slot);
    byDay.set(slot.weekday, list);
  }

  return (
    <div className="st-section">
      <p className="account-kicker">School</p>
      <h1>Timetable</h1>
      <p className="lead">
        {portal.classLabel}
        {term?.data?.label ? ` · ${term.data.label}` : ""}
      </p>

      {[1, 2, 3, 4, 5].map((day) => {
        const lessons = byDay.get(day) || [];
        return (
          <section key={day} style={{ marginTop: "1.1rem" }}>
            <h2 style={{ margin: "0 0 .55rem", fontSize: "1.05rem" }}>{DAYS[day]}</h2>
            {lessons.length ? (
              <div className="st-lesson-grid">
                {lessons.map((lesson) => (
                  <article key={lesson.id} className="st-lesson">
                    <span className="st-period">{lesson.period}</span>
                    <div>
                      <strong>{nameById.get(lesson.subject_id) || "Lesson"}</strong>
                      <small style={{ display: "block" }}>
                        {[lesson.starts_at && lesson.ends_at ? `${String(lesson.starts_at).slice(0, 5)}–${String(lesson.ends_at).slice(0, 5)}` : null, lesson.room]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="hw-meta" style={{ color: "#5d6670" }}>No lessons listed.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
