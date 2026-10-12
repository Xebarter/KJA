"use client";

import { useMemo, useState } from "react";
import { replaceImage, updateImageTarget } from "@/app/actions";
import { imageGroups, type ImageSlot } from "@/lib/admin-images";

function SlotCard({ slot }: { slot: ImageSlot }) {
  const [url, setUrl] = useState(slot.imageUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    const data = new FormData();
    data.set("file", file);
    data.set("target", JSON.stringify(slot.target));
    try {
      setUrl(await replaceImage(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not replace this image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="admin-image-card">
      <figure>
        {url ? <img src={url} alt="" /> : <div className="admin-image-missing">No image yet</div>}
      </figure>
      <div className="body">
        <h3>{slot.label}</h3>
        <p>{slot.group}</p>
        <div className="d-flex gap-2 flex-wrap">
          <label className="admin-btn" style={{ margin: 0 }}>
            {busy ? "Saving…" : "Replace"}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={(event) => onFile(event.target.files?.[0])} />
          </label>
          {slot.href ? <a className="admin-btn admin-btn-ghost" href={slot.href} target="_blank" rel="noreferrer">View page</a> : null}
        </div>
        {slot.target.kind !== "public-file" ? (
          <form
            className="admin-form"
            style={{ marginTop: 10 }}
            onSubmit={async (event) => {
              event.preventDefault();
              const next = String(new FormData(event.currentTarget).get("url") || "").trim();
              if (!next) return;
              setBusy(true);
              setError("");
              try {
                await updateImageTarget(slot.target, next);
                setUrl(next);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not save that URL.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <input name="url" placeholder="Or paste an image URL" defaultValue={slot.imageUrl.startsWith("http") ? slot.imageUrl : ""} />
          </form>
        ) : null}
        {error ? <p className="admin-error">{error}</p> : null}
      </div>
    </article>
  );
}

export function ImageManager({ slots }: { slots: ImageSlot[] }) {
  const groups = imageGroups(slots);
  const [group, setGroup] = useState("All");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return slots.filter((slot) => {
      if (group !== "All" && slot.group !== group) return false;
      if (!needle) return true;
      return `${slot.label} ${slot.group} ${slot.imageUrl}`.toLowerCase().includes(needle);
    });
  }, [group, query, slots]);

  return (
    <div>
      <div className="admin-toolbar">
        <input className="admin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search images by page or name" />
      </div>
      <div className="admin-chips">
        <button type="button" className={`admin-chip${group === "All" ? " active" : ""}`} onClick={() => setGroup("All")}>All ({slots.length})</button>
        {groups.map((name) => (
          <button key={name} type="button" className={`admin-chip${group === name ? " active" : ""}`} onClick={() => setGroup(name)}>
            {name}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="admin-image-grid">
          {visible.map((slot) => <SlotCard key={slot.key} slot={slot} />)}
        </div>
      ) : (
        <div className="admin-card admin-empty">No images match that search.</div>
      )}
    </div>
  );
}
