"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startStudentChat } from "@/app/student/actions";
import { StudentFace } from "@/components/StudentFace";
import { displayName, type StudentClassmate, type StudentTeacher } from "@/lib/student";

export function ClassDirectory({
  classmates,
  classTeacher,
  teachers,
  classLabel,
}: {
  classmates: StudentClassmate[];
  classTeacher: StudentTeacher | null;
  teachers: StudentTeacher[];
  classLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function message(peerId: string) {
    setBusyId(peerId);
    setError("");
    start(async () => {
      const result = await startStudentChat(peerId);
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) {
        router.push(`/student/messages?c=${result.id}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="st-section">
      <p className="account-kicker">Life</p>
      <h1>My class</h1>
      <p className="lead">{classLabel || "Your class"} — teachers and classmates.</p>

      {error ? <p className="account-error">{error}</p> : null}

      <section className="st-teacher-block">
        <h2>Class teacher</h2>
        {classTeacher ? (
          <article className="st-teacher-card is-class">
            <span className="st-teacher-avatar" aria-hidden="true">
              <i className="fa-solid fa-chalkboard-user" />
            </span>
            <div>
              <strong>{classTeacher.full_name}</strong>
              <span>{classTeacher.title || "Class teacher"}</span>
            </div>
          </article>
        ) : (
          <p className="hw-meta" style={{ color: "#5d6670" }}>No class teacher set for this term yet.</p>
        )}
      </section>

      <section className="st-teacher-block">
        <h2>Subject teachers</h2>
        {teachers.length ? (
          <div className="st-teacher-grid">
            {teachers.map((teacher) => (
              <article key={teacher.id} className="st-teacher-card">
                <span className="st-teacher-avatar" aria-hidden="true">
                  <i className="fa-solid fa-book-open" />
                </span>
                <div>
                  <strong>{teacher.full_name}</strong>
                  <span>{[teacher.subject_name, teacher.title].filter(Boolean).join(" · ")}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="hw-meta" style={{ color: "#5d6670" }}>Subject teachers will appear when the office assigns them.</p>
        )}
      </section>

      <section className="st-teacher-block">
        <h2>Classmates ({classmates.length})</h2>
        {classmates.length ? (
          <div className="st-peer-grid">
            {classmates.map((peer) => (
              <article key={peer.id} className="st-peer-card">
                <StudentFace id={peer.id} name={displayName(peer)} photoPath={peer.photo_path} className="st-peer-face" />
                <div className="st-peer-text">
                  <strong>{displayName(peer)}</strong>
                  {peer.house ? <span className="st-house-badge">{peer.house} house</span> : <span>Classmate</span>}
                </div>
                <button
                  type="button"
                  className="account-btn account-btn-ghost"
                  disabled={pending && busyId === peer.id}
                  onClick={() => message(peer.id)}
                >
                  Message
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="hw-empty">
            <i className="fa-solid fa-users" aria-hidden="true" />
            <p>No classmates listed yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}
