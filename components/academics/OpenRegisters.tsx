"use client";

import { useState } from "react";
import Link from "next/link";
import { DeskForm } from "@/components/academics/Form";

type Save = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

export type OpenRegister = {
  key: string;
  name: string;
  href: string;
  unmarked: number;
  classCode: string;
  stream: string;
};

const nf = (value: number) => value.toLocaleString("en-GB");

export function OpenRegisters({
  date,
  termId,
  rows,
  cancel,
}: {
  date: string;
  termId: string;
  rows: OpenRegister[];
  cancel: Save;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!rows.length) return null;

  return (
    <section className="reg-alert" aria-label="Open registers">
      <div className="reg-alert-head">
        <span aria-hidden="true"><i className="fa-solid fa-clipboard-user" /></span>
        <div>
          <strong>{nf(rows.length)} {rows.length === 1 ? "register" : "registers"} still open</strong>
          <p>These are the classes counted beside Attendance. Cancelling one takes it off that count. Marks already saved stay.</p>
        </div>
      </div>
      <ul className="reg-alert-list">
        {rows.map((row) => (
          <li key={row.key}>
            {confirming === row.key ? (
              <DeskForm action={cancel} className="reg-cancel">
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="term_id" value={termId} />
                <input type="hidden" name="class_code" value={row.classCode} />
                <input type="hidden" name="stream" value={row.stream} />
                <p>Cancel {row.name}?</p>
                <button type="button" onClick={() => setConfirming(null)}>Keep</button>
                <button type="submit">Cancel register</button>
              </DeskForm>
            ) : (
              <>
                <Link href={row.href}>
                  {row.name}
                  <em>{nf(row.unmarked)}</em>
                </Link>
                <button type="button" onClick={() => setConfirming(row.key)}>Cancel</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RegisterClosure({
  action,
  date,
  termId,
  classCode,
  stream,
  name,
  restoring,
}: {
  action: Save;
  date: string;
  termId: string;
  classCode: string;
  stream: string;
  name: string;
  restoring?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <DeskForm action={action} className={`reg-cancel${restoring ? " is-restore" : ""}`}>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="term_id" value={termId} />
      <input type="hidden" name="class_code" value={classCode} />
      <input type="hidden" name="stream" value={stream} />
      {restoring ? <input type="hidden" name="intent" value="restore" /> : null}
      {confirming ? (
        <div className="reg-cancel-ask" role="group" aria-label={restoring ? "Restore register" : "Cancel register"}>
          <p>{restoring ? `Put ${name} back on today's count?` : `Cancel ${name} for today? Marks already saved stay.`}</p>
          <button type="button" onClick={() => setConfirming(false)}>Keep</button>
          <button type="submit">{restoring ? "Put it back" : "Cancel register"}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>{restoring ? "Put this register back" : "Cancel register"}</button>
      )}
    </DeskForm>
  );
}
