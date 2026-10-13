"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteRecord, saveRecord } from "@/app/actions";
import { uploadImage, type Feedback } from "@/components/admin/AlumniEditorParts";
import { PageHeader } from "@/components/admin/PageHeader";
import type { AlumniPhotoRow } from "@/lib/alumni-admin";

type Filter = "all" | "live" | "hidden" | "uncaptioned";
type Upload = { name: string; state: "uploading" | "done" | "error"; error?: string };

function captionFromFile(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return /^(img|dsc|image|photo|pxl|wa)?\s*\d[\d\s]*$/i.test(base) || base.length > 60 ? "" : base;
}

function isGeneric(title: string) {
  return !title.trim() || title.trim().toLowerCase() === "alumni photo";
}

export function AlumniPhotosManager({ photos, editable }: { photos: AlumniPhotoRow[]; editable: boolean }) {
  const router = useRouter();
  const sorted = useMemo(() => [...photos].sort((a, b) => a.sort_order - b.sort_order), [photos]);
  const [rows, setRows] = useState(sorted);
  const [filter, setFilter] = useState<Filter>("all");
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dropping, setDropping] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<AlumniPhotoRow | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setRows(sorted), [sorted]);

  const orderChanged = rows.some((row, index) => row.id !== sorted[index]?.id);
  const counts = useMemo(() => {
    const live = rows.filter((row) => row.published).length;
    return { live, hidden: rows.length - live, uncaptioned: rows.filter((row) => isGeneric(row.title)).length };
  }, [rows]);

  const visible = rows.filter((row) => {
    if (filter === "live") return row.published;
    if (filter === "hidden") return !row.published;
    if (filter === "uncaptioned") return isGeneric(row.title);
    return true;
  });
  const canReorder = editable && filter === "all";
  const uploading = uploads.some((item) => item.state === "uploading");

  useEffect(() => {
    if (!orderChanged) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [orderChanged]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoom(null);
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const list = visible.filter((row) => row.image_url);
        const at = list.findIndex((row) => row.id === zoom.id);
        const next = list[(at + (event.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
        if (next) setZoom(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, visible]);

  const update = async (row: AlumniPhotoRow, patch: Partial<Pick<AlumniPhotoRow, "title" | "published">>, message: string) => {
    if (!row.id) return;
    setBusy(row.id);
    const data = new FormData();
    data.set("id", row.id);
    if (patch.title !== undefined) data.set("title", patch.title || "Alumni photo");
    if (patch.published !== undefined) data.set("published", patch.published ? "on" : "off");
    try {
      await saveRecord("alumni_photos", data);
      setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, ...patch } : entry)));
      setFeedback({ ok: message });
      router.refresh();
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : "Could not update the photo." });
    } finally {
      setBusy(null);
    }
  };

  const saveCaption = (row: AlumniPhotoRow) => {
    const value = captions[row.id ?? ""];
    if (value === undefined || value.trim() === row.title.trim()) return;
    void update(row, { title: value.trim() }, "Caption saved.");
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    setRows((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    setFeedback(null);
    try {
      const changed = rows.map((row, index) => ({ row, index })).filter(({ row, index }) => row.id && row.sort_order !== index);
      for (const { row, index } of changed) {
        const data = new FormData();
        data.set("id", row.id!);
        data.set("sort_order", String(index));
        await saveRecord("alumni_photos", data);
      }
      setRows((list) => list.map((row, index) => ({ ...row, sort_order: index })));
      setFeedback({ ok: "New order saved. The gallery shows photos in this order." });
      router.refresh();
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : "Could not save the order." });
    } finally {
      setSavingOrder(false);
    }
  };

  const addFiles = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) {
      setFeedback({ error: "Choose image files to add to the gallery." });
      return;
    }
    setFeedback(null);
    setUploads(images.map((file) => ({ name: file.name, state: "uploading" })));
    let order = rows.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;
    let added = 0;
    for (const [index, file] of images.entries()) {
      try {
        const url = await uploadImage(file);
        const data = new FormData();
        data.set("title", captionFromFile(file.name) || "Alumni photo");
        data.set("image_url", url);
        data.set("sort_order", String(order++));
        data.set("published", "on");
        await saveRecord("alumni_photos", data);
        added += 1;
        setUploads((list) => list.map((item, at) => (at === index ? { ...item, state: "done" } : item)));
      } catch (error) {
        setUploads((list) => list.map((item, at) => (at === index ? { ...item, state: "error", error: error instanceof Error ? error.message : "Upload failed." } : item)));
      }
    }
    if (added) setFeedback({ ok: `${added} ${added === 1 ? "photo" : "photos"} added to the end of the gallery. Add captions so visitors know what they're looking at.` });
    router.refresh();
    setTimeout(() => setUploads((list) => list.filter((item) => item.state === "error")), 2500);
  };

  const remove = async (row: AlumniPhotoRow) => {
    if (!row.id || !window.confirm(`Delete “${row.title || "this photo"}” from the alumni gallery? This can't be undone.`)) return;
    setBusy(row.id);
    try {
      await deleteRecord("alumni_photos", row.id);
      setRows((list) => list.filter((entry) => entry.id !== row.id));
      setFeedback({ ok: "Photo deleted." });
      router.refresh();
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : "Could not delete the photo." });
    } finally {
      setBusy(null);
    }
  };

  const mosaic = rows.filter((row) => row.published && row.image_url).slice(0, 5);
  const kpis = [
    { key: "live", label: "In the gallery", icon: "fa-images", count: counts.live, note: "Visible to visitors" },
    { key: "hidden", label: "Hidden", icon: "fa-eye-slash", count: counts.hidden, note: counts.hidden ? "Only admins can see these" : "Nothing hidden" },
    { key: "uncaptioned", label: "Need a caption", icon: "fa-closed-captioning", count: counts.uncaptioned, note: counts.uncaptioned ? "Shown with a generic title" : "Every photo is captioned" },
  ] as const;

  return (
    <div className="app-page apl alx-admin alx-photos-page">
      <PageHeader
        kicker="Alumni"
        icon="fa-images"
        title="Alumni photo gallery"
        description="Reunions, sports days and class photos from years gone by. Drag photos to set the order visitors see them in, and caption each one."
        actions={
          <>
            {editable ? (
              <button type="button" className="admin-hero-btn is-primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
                <i className={`fa-solid ${uploading ? "fa-spinner fa-spin" : "fa-cloud-arrow-up"}`} aria-hidden="true" /> {uploading ? "Uploading…" : "Add photos"}
              </button>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /> Add photos</span>
            )}
            <a className="admin-hero-btn" href="/alumni-photo-gallery" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Gallery page
            </a>
          </>
        }
      >
        <div className={`alx-mosaic is-${Math.min(mosaic.length, 5)}`} aria-hidden="true">
          {mosaic.length ? mosaic.map((row) => <span key={row.id ?? row.image_url}><img src={row.image_url} alt="" /></span>) : <span className="is-empty"><i className="fa-regular fa-images" /></span>}
          <p><strong>{counts.live}</strong> {counts.live === 1 ? "photo" : "photos"} live</p>
        </div>
      </PageHeader>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) void addFiles(files);
        }}
      />

      {!editable ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>The gallery is read-only for now</h2>
            <p>Connect Supabase and import the content to add, caption and reorder photos here.</p>
          </div>
        </div>
      ) : null}

      <div className="admin-kpis is-3">
        {kpis.map((kpi) => {
          const active = filter === kpi.key;
          return (
            <button key={kpi.key} type="button" className={`admin-kpi${active ? " is-active" : ""}`} onClick={() => setFilter(active ? "all" : kpi.key)} aria-pressed={active}>
              <span className="admin-kpi-icon"><i className={`fa-solid ${kpi.icon}`} aria-hidden="true" /></span>
              <span className="admin-kpi-label">{kpi.label}</span>
              <strong>{kpi.count.toLocaleString("en-GB")}</strong>
              <span className="admin-kpi-note">{kpi.note}</span>
              <i className={`fa-solid ${active ? "fa-xmark" : "fa-filter"} admin-kpi-go`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <section className="apl-card">
        <nav className="apl-tabs pg-tabs" aria-label="Filter photos">
          {([
            ["all", "All photos", rows.length],
            ["live", "In the gallery", counts.live],
            ["hidden", "Hidden", counts.hidden],
            ["uncaptioned", "Need a caption", counts.uncaptioned],
          ] as const).map(([key, label, count]) => (
            <button key={key} type="button" className={filter === key ? "active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
              <em>{count}</em>
            </button>
          ))}
        </nav>

        {orderChanged ? (
          <div className="alx-orderbar" role="status">
            <span><i className="fa-solid fa-arrows-up-down-left-right" aria-hidden="true" /> You&apos;ve changed the order. Save it to update the website.</span>
            <div>
              <button type="button" className="app-link-btn" onClick={() => setRows(sorted)} disabled={savingOrder}>Undo</button>
              <button type="button" className="admin-btn admin-btn-gold" onClick={() => void saveOrder()} disabled={savingOrder}>
                <i className={`fa-solid ${savingOrder ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true" /> {savingOrder ? "Saving…" : "Save order"}
              </button>
            </div>
          </div>
        ) : null}

        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}

        {uploads.length ? (
          <ul className="alx-uploads">
            {uploads.map((item, index) => (
              <li key={`${item.name}-${index}`} className={`is-${item.state}`}>
                <i className={`fa-solid ${item.state === "uploading" ? "fa-spinner fa-spin" : item.state === "done" ? "fa-circle-check" : "fa-circle-exclamation"}`} aria-hidden="true" />
                <span>{item.name}</span>
                {item.error ? <small>{item.error}</small> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <ul className="alx-photo-grid">
          {visible.map((row) => {
            const index = rows.indexOf(row);
            const key = row.id ?? row.image_url;
            const caption = captions[row.id ?? ""] ?? row.title;
            return (
              <li
                key={key}
                className={`alx-photo${row.published ? "" : " is-hidden"}${dragId === row.id ? " is-dragging" : ""}${overId === row.id && dragId !== row.id ? " is-over" : ""}${busy === row.id ? " is-saving" : ""}`}
                draggable={canReorder && Boolean(row.id)}
                onDragStart={(event) => {
                  setDragId(row.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (!dragId) return;
                  event.preventDefault();
                  setOverId(row.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = rows.findIndex((entry) => entry.id === dragId);
                  if (from >= 0) move(from, index);
                  setDragId(null);
                  setOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <figure>
                  <button type="button" className="alx-photo-img" onClick={() => setZoom(row)} aria-label={`View ${row.title || "photo"} larger`}>
                    {row.image_url ? <img src={row.image_url} alt="" loading="lazy" draggable={false} /> : <i className="fa-regular fa-image" aria-hidden="true" />}
                  </button>
                  <span className="alx-photo-pos">{index + 1}</span>
                  {!row.published ? <span className="alx-photo-flag"><i className="fa-solid fa-eye-slash" aria-hidden="true" /> Hidden</span> : null}
                  {canReorder ? <span className="alx-photo-grip" title="Drag to reorder"><i className="fa-solid fa-grip" aria-hidden="true" /></span> : null}
                </figure>
                <div className="alx-photo-body">
                  <input
                    className={isGeneric(caption) ? "is-generic" : ""}
                    value={isGeneric(caption) && !captions[row.id ?? ""] ? "" : caption}
                    placeholder="Add a caption…"
                    aria-label="Caption"
                    disabled={!editable || !row.id}
                    onChange={(event) => setCaptions((map) => ({ ...map, [row.id ?? ""]: event.target.value }))}
                    onBlur={() => saveCaption(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                    }}
                  />
                  <div className="alx-photo-actions">
                    <label className="story-switch" title={row.published ? "Hide from the gallery" : "Show in the gallery"}>
                      <input
                        type="checkbox"
                        checked={row.published}
                        disabled={!editable || !row.id || busy === row.id}
                        onChange={(event) => void update(row, { published: event.target.checked }, event.target.checked ? "Photo is back in the gallery." : "Photo hidden from the gallery.")}
                      />
                      <span aria-hidden="true" />
                      <span className="visually-hidden">Shown in the gallery</span>
                    </label>
                    {canReorder ? (
                      <>
                        <button type="button" className="story-icon" title="Move earlier" disabled={index === 0} onClick={() => move(index, index - 1)}>
                          <i className="fa-solid fa-arrow-left" />
                        </button>
                        <button type="button" className="story-icon" title="Move later" disabled={index === rows.length - 1} onClick={() => move(index, index + 1)}>
                          <i className="fa-solid fa-arrow-right" />
                        </button>
                      </>
                    ) : null}
                    {editable && row.id ? (
                      <button type="button" className="story-icon is-danger" title="Delete photo" onClick={() => void remove(row)}>
                        <i className="fa-regular fa-trash-can" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
          {editable && filter === "all" ? (
            <li
              className={`alx-drop${dropping ? " is-over" : ""}`}
              onDragOver={(event) => {
                if (dragId) return;
                event.preventDefault();
                setDropping(true);
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(event) => {
                if (dragId) return;
                event.preventDefault();
                setDropping(false);
                void addFiles([...event.dataTransfer.files]);
              }}
            >
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}>
                <span><i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /></span>
                <strong>Add photos</strong>
                <small>Drop images here or click to choose several at once. Large photos are resized automatically.</small>
              </button>
            </li>
          ) : null}
        </ul>

        {!visible.length && filter !== "all" ? (
          <div className="apl-empty">
            <span><i className="fa-regular fa-images" aria-hidden="true" /></span>
            <h2>Nothing here</h2>
            <p>No photos match this filter.</p>
          </div>
        ) : null}

        <div className="apl-pager">
          <span>{rows.length} {rows.length === 1 ? "photo" : "photos"} · {counts.live} in the gallery</span>
          <span className="pg-legend">
            <i className="fa-solid fa-circle-info" aria-hidden="true" /> {canReorder ? "Drag photos or use the arrows to reorder, then save." : "Switch to All photos to reorder."}
          </span>
        </div>
      </section>

      {zoom ? (
        <div className="alx-zoom" role="dialog" aria-modal="true" aria-label={zoom.title || "Photo"} onClick={() => setZoom(null)}>
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={zoom.image_url} alt={zoom.title} />
            <figcaption>
              <span>{isGeneric(zoom.title) ? "No caption yet" : zoom.title}</span>
              <small>Use ← → to browse · Esc to close</small>
            </figcaption>
          </figure>
          <button type="button" className="alx-zoom-close" onClick={() => setZoom(null)} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </div>
      ) : null}
    </div>
  );
}
