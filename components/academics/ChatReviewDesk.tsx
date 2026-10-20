"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type ClassOption = { value: string; label: string };
type Row = {
  id: string;
  body: string;
  flagged: boolean;
  hidden: boolean;
  created_at: string;
  sender_name: string;
};

export function ChatReviewDesk({
  classes,
  selected,
  flaggedOnly,
  rows,
  hideAction,
}: {
  classes: ClassOption[];
  selected: string;
  flaggedOnly: boolean;
  rows: Row[];
  hideAction: (id: string) => Promise<{ error?: string; ok?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <>
      <form
        className="scr-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const cls = String(data.get("class") || "");
          const flagged = data.get("flagged") ? "1" : "0";
          const params = new URLSearchParams();
          if (cls) params.set("class", cls);
          if (flagged === "1") params.set("flagged", "1");
          router.push(`/academics_office/chat-review?${params.toString()}`);
        }}
      >
        <label className="ofc-field">
          Class
          <select name="class" defaultValue={selected}>
            {classes.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: ".4rem", fontSize: ".88rem", paddingBottom: ".35rem" }}>
          <input type="checkbox" name="flagged" value="1" defaultChecked={flaggedOnly} />
          Flagged only
        </label>
        <button className="admin-btn" type="submit">
          Show
        </button>
      </form>

      {rows.length ? (
        <table className="scr-table">
          <thead>
            <tr>
              <th>When</th>
              <th>From</th>
              <th>Message</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.hidden ? "scr-hidden" : undefined}>
                <td>
                  {new Date(row.created_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Africa/Kampala",
                  })}
                </td>
                <td>{row.sender_name}</td>
                <td>
                  {row.flagged ? <span className="scr-flag">Flagged · </span> : null}
                  {row.body}
                </td>
                <td>
                  {!row.hidden ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn-ghost"
                      disabled={pending}
                      onClick={() => {
                        start(async () => {
                          await hideAction(row.id);
                          router.refresh();
                        });
                      }}
                    >
                      Hide
                    </button>
                  ) : (
                    <span>Hidden</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="admin-empty">No messages for this filter.</p>
      )}
    </>
  );
}
