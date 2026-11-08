"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createSession, removeLeader, removeSchedule, saveAttendance, saveLeader, saveSchedule } from "@/app/clubs/(desk)/actions";
import { Feedback, useOfficeAction } from "@/components/accounts/client";
import { StudentFace } from "@/components/StudentFace";
import { DateField } from "@/components/ui/DateField";
import { CLUB_ATTENDANCE_STATUSES, CLUBS_BASE, WEEKDAY_LABELS } from "@/lib/clubs-nav";
import { CLUB_CAMPUSES } from "@/lib/campuses";
import { displayPhone } from "@/lib/students";

export function AddPatronForm({
  clubId,
  staff,
}: {
  clubId: string;
  staff: { id: string; name: string; phone?: string | null }[];
}) {
  const { result, pending, run } = useOfficeAction();
  const [profileId, setProfileId] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <form
      className="clubs-ops-form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        run(() => saveLeader(new FormData(event.currentTarget)));
      }}
    >
      <input type="hidden" name="club_id" value={clubId} />
      <div className="clubs-ops-split">
        <label className="clubs-ops-field">
          <span>Staff</span>
          <select
            name="profile_id"
            required
            value={profileId}
            onChange={(event) => {
              const next = event.target.value;
              setProfileId(next);
              const match = staff.find((person) => person.id === next);
              if (match?.phone) setPhone(displayPhone(match.phone) || match.phone);
            }}
          >
            <option value="" disabled>
              Choose staff
            </option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="clubs-ops-field">
          <span>Role</span>
          <select name="role" defaultValue="patron">
            <option value="patron">Patron</option>
            <option value="assistant">Assistant</option>
          </select>
        </label>
      </div>
      <label className="clubs-ops-field">
        <span>Phone</span>
        <input
          type="tel"
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="07XX XXX XXX"
          maxLength={20}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      <Feedback result={result} />
      <button type="submit" className="clubs-ops-submit" disabled={pending}>
        <i className="fa-solid fa-user-plus" aria-hidden="true" />
        {pending ? "Adding…" : "Add patron"}
      </button>
    </form>
  );
}

/** @deprecated Prefer AddPatronForm */
export const AddLeaderForm = AddPatronForm;

export function RemoveLeaderButton({ id }: { id: string }) {
  const { pending, run } = useOfficeAction();
  return (
    <button
      type="button"
      className="clubs-ops-remove"
      disabled={pending}
      onClick={() => {
        const data = new FormData();
        data.set("id", id);
        run(() => removeLeader(data));
      }}
    >
      Remove
    </button>
  );
}

export function AddScheduleForm({
  clubId,
  clubs,
  defaultClubId,
  defaultCampus = "",
  defaultWeekday = 1,
  submitLabel = "Add schedule",
}: {
  clubId?: string;
  clubs?: { id: string; title: string }[];
  defaultClubId?: string;
  defaultCampus?: string;
  defaultWeekday?: number;
  submitLabel?: string;
}) {
  const { result, pending, run } = useOfficeAction();
  const fixed = Boolean(clubId);
  const choices = clubs?.length ? clubs : clubId ? [{ id: clubId, title: "Club" }] : [];
  const selectedClub = defaultClubId && choices.some((club) => club.id === defaultClubId) ? defaultClubId : choices[0]?.id || "";
  return (
    <form
      className="clubs-ops-form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        run(() => saveSchedule(new FormData(event.currentTarget)));
      }}
    >
      {fixed ? <input type="hidden" name="club_id" value={clubId} /> : null}
      {!fixed ? (
        <label className="clubs-ops-field">
          <span>Club</span>
          <select name="club_id" required defaultValue={selectedClub}>
            {choices.map((club) => (
              <option key={club.id} value={club.id}>
                {club.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="clubs-ops-split">
        <label className="clubs-ops-field">
          <span>Weekday</span>
          <select name="weekday" defaultValue={String(defaultWeekday)}>
            {WEEKDAY_LABELS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="clubs-ops-field">
          <span>Campus</span>
          <select name="campus" defaultValue={defaultCampus}>
            <option value="">Any / all</option>
            {CLUB_CAMPUSES.map((site) => (
              <option key={site} value={site}>
                {site}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="clubs-ops-split">
        <label className="clubs-ops-field">
          <span>Starts</span>
          <input type="time" name="start_time" required defaultValue="15:30" />
        </label>
        <label className="clubs-ops-field">
          <span>Ends</span>
          <input type="time" name="end_time" required defaultValue="16:30" />
        </label>
      </div>
      <label className="clubs-ops-field">
        <span>Venue</span>
        <input name="venue" maxLength={120} placeholder="Hall / pitch" />
      </label>
      <label className="clubs-ops-field">
        <span>Notes <em>Optional</em></span>
        <input name="notes" maxLength={200} placeholder="Optional notes" />
      </label>
      <Feedback result={result} />
      <button type="submit" className="clubs-ops-submit" disabled={pending || !choices.length}>
        <i className="fa-solid fa-calendar-plus" aria-hidden="true" />
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function RemoveScheduleButton({ id }: { id: string }) {
  const { pending, run } = useOfficeAction();
  return (
    <button
      type="button"
      className="clubs-ops-remove"
      disabled={pending}
      onClick={() => {
        const data = new FormData();
        data.set("id", id);
        run(() => removeSchedule(data));
      }}
    >
      Remove
    </button>
  );
}

export function CreateSessionForm({
  clubs,
  schedules,
  defaultClubId,
}: {
  clubs: { id: string; title: string }[];
  schedules: { id: string; club_id: string; label: string }[];
  defaultClubId?: string;
}) {
  const router = useRouter();
  const [clubId, setClubId] = useState(defaultClubId || clubs[0]?.id || "");
  const { result, pending, run } = useOfficeAction();
  const forClub = schedules.filter((row) => row.club_id === clubId);

  return (
    <form
      className="clubs-ops-form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        run(async () => {
          const outcome = await createSession(new FormData(event.currentTarget));
          if (outcome.id) router.push(`${CLUBS_BASE}/timetable/${outcome.id}`);
          return outcome;
        });
      }}
    >
      <div className="clubs-ops-split">
        <label className="clubs-ops-field">
          <span>Club</span>
          <select name="club_id" required value={clubId} onChange={(event) => setClubId(event.target.value)}>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.title}
              </option>
            ))}
          </select>
        </label>
        <label className="clubs-ops-field">
          <span>Date</span>
          <DateField name="held_on" required />
        </label>
      </div>
      <label className="clubs-ops-field">
        <span>From schedule <em>Optional</em></span>
        <select name="schedule_id" defaultValue="">
          <option value="">None</option>
          {forClub.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="clubs-ops-field">
        <span>Venue</span>
        <input name="venue" maxLength={120} placeholder="Optional override" />
      </label>
      <label className="clubs-ops-field">
        <span>Notes <em>Optional</em></span>
        <input name="notes" maxLength={200} />
      </label>
      <Feedback result={result} />
      <button type="submit" className="clubs-ops-submit" disabled={pending}>
        <i className="fa-solid fa-calendar-check" aria-hidden="true" />
        {pending ? "Creating…" : "Create meeting"}
      </button>
    </form>
  );
}

export function AttendanceSheet({
  sessionId,
  learners,
}: {
  sessionId: string;
  learners: { studentId: string; name: string; detail: string; photoPath?: string | null; status: string; note: string }[];
}) {
  const { result, pending, run } = useOfficeAction();
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(learners.map((learner) => [learner.studentId, learner.status || "present"])),
  );

  return (
    <form
      className="clubs-att-form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        run(() => saveAttendance(new FormData(event.currentTarget)));
      }}
    >
      <input type="hidden" name="session_id" value={sessionId} />
      <div className="clubs-detail-table-wrap">
        <table className="clubs-detail-table clubs-att-table">
          <thead>
            <tr>
              <th scope="col">Learner</th>
              <th scope="col">Status</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((learner) => {
              const status = statuses[learner.studentId] || "present";
              return (
                <tr key={learner.studentId} className={`is-${status}`}>
                  <td data-label="Learner">
                    <span className="clubs-reg-who">
                      <StudentFace className="clubs-reg-face" id={learner.studentId} name={learner.name} photoPath={learner.photoPath} />
                      <span>
                        <strong className="clubs-att-name">{learner.name}</strong>
                        <small>{learner.detail}</small>
                      </span>
                    </span>
                  </td>
                  <td data-label="Status">
                    <label className={`clubs-att-status is-${status}`}>
                      <span className="visually-hidden">Status for {learner.name}</span>
                      <select
                        name={`status:${learner.studentId}`}
                        value={status}
                        onChange={(event) => setStatuses((current) => ({ ...current, [learner.studentId]: event.target.value }))}
                      >
                        {CLUB_ATTENDANCE_STATUSES.map((entry) => (
                          <option key={entry.value} value={entry.value}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </td>
                  <td data-label="Note">
                    <input
                      className="clubs-att-note"
                      name={`note:${learner.studentId}`}
                      defaultValue={learner.note}
                      maxLength={120}
                      placeholder="Optional note"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="clubs-att-foot">
        <Feedback result={result} />
        <button type="submit" className="clubs-ops-submit" disabled={pending || !learners.length}>
          <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
          {pending ? "Saving…" : "Save attendance"}
        </button>
      </div>
    </form>
  );
}
