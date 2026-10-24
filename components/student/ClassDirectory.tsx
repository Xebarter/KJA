"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startStudentChat } from "@/app/student/actions";
import { StudentFace } from "@/components/StudentFace";
import { TeacherFace } from "@/components/TeacherFace";
import { displayName, type StudentClassmate, type StudentTeacher } from "@/lib/student";

const TEACHER_TONES = ["sky", "mint", "sun", "rose", "gold", "teal"] as const;
const HOUSE_TONES: Record<string, string> = {
  red: "rose",
  blue: "sky",
  green: "mint",
  yellow: "sun",
  gold: "gold",
  orange: "sun",
};

function houseTone(house: string | null | undefined) {
  if (!house) return "sky";
  const key = house.toLowerCase();
  for (const [name, tone] of Object.entries(HOUSE_TONES)) {
    if (key.includes(name)) return tone;
  }
  return "gold";
}

function subjectIcon(name: string | null | undefined) {
  const key = (name || "").toLowerCase();
  if (/math|numeracy|arith/.test(key)) return "fa-calculator";
  if (/eng|lit|read|writ|spell/.test(key)) return "fa-book-open";
  if (/sci|nature|environ/.test(key)) return "fa-flask";
  if (/soc|hist|geog|cre|relig/.test(key)) return "fa-globe";
  if (/art|music|pe|sport|drama/.test(key)) return "fa-palette";
  return "fa-chalkboard";
}

function cheer(classmates: number, teachers: number) {
  if (!classmates && !teachers) return "Your class list is still being set up. Check back soon.";
  if (classmates && teachers) {
    return `Meet your teachers and ${classmates} classmate${classmates === 1 ? "" : "s"}. Say hello with a message!`;
  }
  if (classmates) return `You have ${classmates} classmate${classmates === 1 ? "" : "s"} here. Tap Message to chat.`;
  return "Your teachers are listed below. Classmates will appear when the office is ready.";
}

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
    <div className="mc-page">
      <section className="mc-hero">
        <div className="mc-hero-bg" aria-hidden="true">
          <span className="mc-blob mc-blob-a" />
          <span className="mc-blob mc-blob-b" />
        </div>
        <div className="mc-hero-copy">
          <p className="mc-kicker">
            <i className="fa-solid fa-users" aria-hidden="true" />
            Your people
          </p>
          <h1>My class</h1>
          <p className="mc-hero-lead">{cheer(classmates.length, teachers.length + (classTeacher ? 1 : 0))}</p>
          {classLabel ? (
            <div className="mc-hero-tags">
              <span className="mc-tag">
                <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
                {classLabel}
              </span>
            </div>
          ) : null}
        </div>
        <div className="mc-hero-stats" aria-label="Class summary">
          <div className="mc-hero-stat">
            <strong>{classmates.length}</strong>
            <span>Friends</span>
          </div>
          <div className="mc-hero-stat mc-hero-stat--teachers">
            <strong>{teachers.length + (classTeacher ? 1 : 0)}</strong>
            <span>Teachers</span>
          </div>
        </div>
      </section>

      {error ? (
        <p className="mc-error" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <section className="mc-panel mc-panel--class-teacher">
        <header className="mc-panel-head">
          <div>
            <p className="mc-panel-kicker">Looking after your class</p>
            <h2>Class teacher</h2>
          </div>
        </header>
        {classTeacher ? (
          <article className="mc-lead-teacher">
            <TeacherFace
              id={classTeacher.staff_id}
              name={classTeacher.full_name}
              photoPath={classTeacher.photo_path}
              className="mc-lead-avatar"
              fallback={<i className="fa-solid fa-chalkboard-user" />}
            />
            <div className="mc-lead-text">
              <strong>{classTeacher.full_name}</strong>
              <span>{classTeacher.title || "Class teacher"}</span>
              <small>Your main teacher for this class</small>
            </div>
            <span className="mc-lead-badge">Class teacher</span>
          </article>
        ) : (
          <div className="mc-soft-empty">
            <i className="fa-solid fa-chalkboard-user" aria-hidden="true" />
            <p>No class teacher set for this term yet.</p>
          </div>
        )}
      </section>

      <section className="mc-panel mc-panel--subjects">
        <header className="mc-panel-head">
          <div>
            <p className="mc-panel-kicker">Who teaches you</p>
            <h2>Subject teachers</h2>
          </div>
          <span className="mc-panel-count">{teachers.length}</span>
        </header>
        {teachers.length ? (
          <div className="mc-teacher-grid">
            {teachers.map((teacher, index) => {
              const tone = TEACHER_TONES[index % TEACHER_TONES.length];
              return (
                <article
                  key={teacher.id}
                  className={`mc-teacher mc-teacher--${tone}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
                >
                  <TeacherFace
                    id={teacher.staff_id}
                    name={teacher.full_name}
                    photoPath={teacher.photo_path}
                    className="mc-teacher-icon"
                    fallback={<i className={`fa-solid ${subjectIcon(teacher.subject_name)}`} />}
                  />
                  <div>
                    <strong>{teacher.full_name}</strong>
                    <span>{[teacher.subject_name, teacher.title].filter(Boolean).join(" · ") || "Teacher"}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mc-soft-empty">
            <i className="fa-solid fa-book-open" aria-hidden="true" />
            <p>Subject teachers will appear when the office assigns them.</p>
          </div>
        )}
      </section>

      <section className="mc-panel mc-panel--peers">
        <header className="mc-panel-head">
          <div>
            <p className="mc-panel-kicker">Learn and play together</p>
            <h2>Classmates</h2>
          </div>
          <span className="mc-panel-count">{classmates.length}</span>
        </header>
        {classmates.length ? (
          <div className="mc-peer-grid">
            {classmates.map((peer, index) => {
              const tone = houseTone(peer.house);
              return (
                <article
                  key={peer.id}
                  className={`mc-peer mc-peer--${tone}`}
                  style={{ animationDelay: `${Math.min(index, 12) * 0.03}s` }}
                >
                  <StudentFace
                    id={peer.id}
                    name={displayName(peer)}
                    photoPath={peer.photo_path}
                    className="mc-peer-face"
                  />
                  <div className="mc-peer-text">
                    <strong>{displayName(peer)}</strong>
                    {peer.house ? (
                      <span className={`mc-house mc-house--${tone}`}>{peer.house} house</span>
                    ) : (
                      <span className="mc-peer-note">Classmate</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="mc-msg-btn"
                    disabled={pending && busyId === peer.id}
                    onClick={() => message(peer.id)}
                  >
                    {pending && busyId === peer.id ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                        Opening…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-comments" aria-hidden="true" />
                        Message
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mc-empty">
            <span aria-hidden="true">
              <i className="fa-solid fa-users" />
            </span>
            <h3>No classmates listed yet</h3>
            <p>When your classmates get student logins, they will show up here so you can say hello.</p>
          </div>
        )}
      </section>
    </div>
  );
}
