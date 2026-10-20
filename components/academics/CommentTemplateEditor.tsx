"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { lineKicker, templateReadout, type DeskTemplate } from "@/components/academics/comment-model";

export function CommentTemplateEditor({
  action,
  template,
  onSaved,
}: {
  action: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
  template: DeskTemplate;
  onSaved?: () => void;
}) {
  const [text, setText] = useState(template.text);
  const [saved, setSaved] = useState(template.text);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirtyRef = useRef(false);
  const requireFirstName = template.commentType === "cocurricular";
  const readout = templateReadout({
    text,
    exactWords: template.exactWords,
    minWords: template.minWords,
    maxWords: template.maxWords,
    exactSentences: template.exactSentences,
    requireFirstName,
  });
  const dirty = text !== saved;
  dirtyRef.current = dirty;
  const kicker = lineKicker(template.commentType, template);
  const label = kicker || template.text.slice(0, 48) || "Comment line";

  useEffect(() => {
    if (!dirtyRef.current) {
      setText(template.text);
      setSaved(template.text);
    }
  }, [template.text]);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!readout.ok || !dirty || pending) return;
    const data = new FormData();
    data.set("id", template.id);
    data.set("comment_type", template.commentType);
    data.set("template_text", text);
    setError(null);
    startTransition(async () => {
      const outcome = await action(data).catch(() => ({ error: "Something went wrong. Try again." }));
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      setSaved(text);
      dirtyRef.current = false;
      onSaved?.();
    });
  }

  return (
    <form
      className={`cmt-line${kicker ? " has-kicker" : ""}${error ? " has-error" : ""}${readout.ok ? "" : " is-off"}`}
      onSubmit={save}
    >
      {kicker ? <span className="cmt-kicker">{kicker}</span> : null}
      <textarea
        name="template_text"
        aria-label={label}
        rows={Math.min(4, Math.max(1, Math.ceil(text.length / 78)))}
        value={text}
        maxLength={2000}
        spellCheck
        autoComplete="off"
        disabled={pending}
        onChange={(event) => {
          setText(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <span className="cmt-meter">
        {readout.chips.map((chip) => (
          <span key={chip.id} className={chip.ok ? "is-ok" : "is-warn"}>{chip.label}</span>
        ))}
      </span>
      <span className="cmt-action">
        {dirty ? (
          <button className="cmt-btn" type="submit" disabled={!readout.ok || pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        ) : readout.ok ? (
          <span className="cmt-saved" aria-label="Saved"><i className="fa-solid fa-check" aria-hidden="true" /></span>
        ) : (
          <span className="cmt-held">Stored</span>
        )}
      </span>
      {error ? <p className="cmt-error" role="alert">{error}</p> : null}
    </form>
  );
}
