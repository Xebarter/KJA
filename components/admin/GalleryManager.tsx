"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type DragEvent } from "react";
import { deleteRecord, reorderRecords, saveRecord, uploadMedia } from "@/app/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { PhotoLightbox } from "@/components/site/HomeMotion";
import { decodeEntities } from "@/lib/html";
import type { GalleryItem } from "@/lib/types";

type StatusFilter = "all" | "live" | "hidden";
type Feedback = { ok?: string; error?: string } | null;

const UPLOAD_INPUT = "agal-upload";

function sortItems(items: GalleryItem[]) {
  return items.map((item, index) => ({ item, index })).sort((a, b) => (a.item.sort_order ?? 0) - (b.item.sort_order ?? 0) || a.index - b.index).map(({ item }) => item);
}

function titleFromFile(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Untitled photo";
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function GalleryManager({ items, editable }: { items: GalleryItem[]; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => sortItems(items));
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(sortItems(items)), [items]);

  const live = rows.filter((row) => row.published !== false).length;
  const hidden = rows.length - live;
  const filtered = status !== "all" || q.trim() !== "";
  const canReorder = editable && !filtered && rows.every((row) => row.id);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .map((row, position) => ({ row, position, title: decodeEntities(row.title) || "Untitled photo" }))
      .filter(({ row, title }) => {
        if (status === "live" && row.published === false) return false;
        if (status === "hidden" && row.published !== false) return false;
        return !needle || title.toLowerCase().includes(needle);
      });
  }, [rows, status, q]);

  const photos = useMemo(
    () => visible.filter(({ row }) => row.image_url).map(({ row, title, position }) => ({ src: row.image_url!, title, tag: row.published === false ? "Hidden" : "Gallery", position })),
    [visible],
  );
  const mosaic = rows.filter((row) => row.image_url && row.published !== false).slice(0, 5);

  const fail = (error: unknown, fallback: string) => setFeedback({ error: error instanceof Error ? error.message : fallback });

  const saveOrder = (next: GalleryItem[], previous: GalleryItem[]) => {
    setRows(next);
    startTransition(async () => {
      try {
        await reorderRecords("gallery_items", next.map((row) => row.id!));
        setFeedback({ ok: "New order saved. The website gallery now follows it." });
        router.refresh();
      } catch (error) {
        setRows(previous);
        fail(error, "Could not save the new order.");
      }
    });
  };

  const move = (position: number, step: number) => {
    const target = position + step;
    if (!canReorder || target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[position], next[target]] = [next[target], next[position]];
    saveOrder(next, rows);
  };

  const dropOn = (targetId: string) => {
    const from = rows.findIndex((row) => row.id === dragId);
    const to = rows.findIndex((row) => row.id === targetId);
    setDragId(null);
    setOverId(null);
    if (!canReorder || from < 0 || to < 0 || from === to) return;
    const next = [...rows];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    saveOrder(next, rows);
  };

  const togglePublished = (row: GalleryItem, value: boolean) => {
    if (!row.id) return;
    setBusy(row.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id!);
      data.set("published", value ? "on" : "off");
      try {
        await saveRecord("gallery_items", data);
        setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, published: value } : entry)));
        setFeedback({ ok: `“${decodeEntities(row.title)}” is ${value ? "live in the gallery" : "now hidden"}.` });
        router.refresh();
      } catch (error) {
        fail(error, "Could not update the photo.");
      } finally {
        setBusy(null);
      }
    });
  };

  const remove = (row: GalleryItem) => {
    if (!row.id || !window.confirm(`Remove “${decodeEntities(row.title)}” from the gallery? This can't be undone.`)) return;
    setBusy(row.id);
    startTransition(async () => {
      try {
        await deleteRecord("gallery_items", row.id!);
        setRows((list) => list.filter((entry) => entry.id !== row.id));
        setFeedback({ ok: `“${decodeEntities(row.title)}” was removed.` });
        router.refresh();
      } catch (error) {
        fail(error, "Could not remove the photo.");
      } finally {
        setBusy(null);
      }
    });
  };

  const upload = (files: FileList | null) => {
    const list = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (!editable || !list.length) return;
    setUploading({ done: 0, total: list.length });
    setFeedback(null);
    startTransition(async () => {
      let order = rows.reduce((max, row) => Math.max(max, row.sort_order ?? 0), rows.length - 1) + 1;
      let added = 0;
      try {
        for (const file of list) {
          const media = new FormData();
          media.set("file", file);
          const url = await uploadMedia(media);
          const data = new FormData();
          data.set("title", titleFromFile(file.name));
          data.set("image_url", url);
          data.set("sort_order", String(order++));
          data.set("published", "on");
          await saveRecord("gallery_items", data);
          added += 1;
          setUploading({ done: added, total: list.length });
        }
        setFeedback({ ok: `${added} ${added === 1 ? "photo" : "photos"} added to the end of the gallery.` });
      } catch (error) {
        fail(error, "Could not upload the photos.");
      } finally {
        setUploading(null);
        router.refresh();
      }
    });
  };

  const fileInput = (
    <input
      id={UPLOAD_INPUT}
      className="visually-hidden"
      type="file"
      accept="image/*"
      multiple
      disabled={!editable || Boolean(uploading)}
      onChange={(event) => {
        upload(event.target.files);
        event.target.value = "";
      }}
    />
  );

  const kpis = [
    { key: "all", label: "Photos", icon: "fa-images", count: rows.length, note: "Shown on the gallery page in this order", active: false, onClick: () => { setStatus("all"); setQ(""); } },
    { key: "live", label: "Live", icon: "fa-signal", count: live, note: `${rows.length ? Math.round((live / rows.length) * 100) : 0}% of all photos`, active: status === "live", onClick: () => setStatus((value) => (value === "live" ? "all" : "live")) },
    { key: "hidden", label: "Hidden", icon: "fa-eye-slash", count: hidden, note: hidden ? "Only admins can see these" : "Nothing hidden", active: status === "hidden", onClick: () => setStatus((value) => (value === "hidden" ? "all" : "hidden")) },
  ];

  return (
    <div className="app-page apl pg-admin agal">
      {fileInput}
      <PageHeader
        kicker="Events & gallery"
        icon="fa-images"
        title="Gallery"
        description="The photo wall on the website's gallery page. Upload new pictures, drag them into the order you want and hide any that shouldn't be public."
        actions={
          <>
            {editable ? (
              <label className="admin-hero-btn is-primary" htmlFor={UPLOAD_INPUT}>
                <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /> Upload photos
              </label>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /> Upload photos</span>
            )}
            <a className="admin-hero-btn" href="/gallery" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View gallery
            </a>
          </>
        }
      >
        <div className="apl-pipeline agal-hero">
          <p className="apl-pipeline-head">
            <span>On the website</span>
            <strong>{live} of {rows.length} live</strong>
          </p>
          {mosaic.length ? (
            <div className={`agal-mosaic is-${mosaic.length}`}>
              {mosaic.map((row) => <img key={row.id ?? row.image_url} src={row.image_url!} alt="" loading="lazy" />)}
            </div>
          ) : (
            <div className="agal-mosaic is-empty"><i className="fa-regular fa-images" aria-hidden="true" /> No live photos yet</div>
          )}
          <p className="pg-mix-foot">
            <span><i className="fa-solid fa-arrows-up-down-left-right" aria-hidden="true" /> Drag to reorder</span>
            <span><i className="fa-solid fa-eye-slash" aria-hidden="true" /> {hidden ? `${hidden} hidden` : "None hidden"}</span>
          </p>
        </div>
      </PageHeader>

      {!editable ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>The gallery is read-only for now</h2>
            <p>You&apos;re seeing the photos imported with the website. Connect Supabase and import the content to manage them here.</p>
          </div>
        </div>
      ) : null}

      <div className="admin-kpis is-3">
        {kpis.map((kpi) => (
          <button key={kpi.key} type="button" className={`admin-kpi${kpi.active ? " is-active" : ""}`} onClick={kpi.onClick} aria-pressed={kpi.active}>
            <span className="admin-kpi-icon"><i className={`fa-solid ${kpi.icon}`} aria-hidden="true" /></span>
            <span className="admin-kpi-label">{kpi.label}</span>
            <strong>{kpi.count.toLocaleString("en-GB")}</strong>
            <span className="admin-kpi-note">{kpi.note}</span>
            {kpi.key === "all" ? null : <i className={`fa-solid ${kpi.active ? "fa-xmark" : "fa-filter"} admin-kpi-go`} aria-hidden="true" />}
          </button>
        ))}
      </div>

      <section className="apl-card">
        <nav className="apl-tabs pg-tabs" aria-label="Filter photos">
          {([["all", "All photos", rows.length], ["live", "Live", live], ["hidden", "Hidden", hidden]] as const).map(([key, label, count]) => (
            <button key={key} type="button" className={status === key ? "active" : ""} aria-pressed={status === key} onClick={() => setStatus(key)}>
              {label}
              <em>{count}</em>
            </button>
          ))}
        </nav>

        <div className="app-filters" role="search">
          <label className="app-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="visually-hidden">Search photos</span>
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by caption" />
          </label>
          {filtered ? (
            <button type="button" className="app-clear app-link-btn" onClick={() => { setStatus("all"); setQ(""); }}>
              Clear
            </button>
          ) : null}
          <span className="agal-hint">
            <i className={`fa-solid ${canReorder ? "fa-arrows-up-down-left-right" : "fa-lock"}`} aria-hidden="true" />
            {canReorder ? "Drag photos to change their order" : filtered ? "Clear the filters to reorder" : "Reordering needs Supabase"}
          </span>
        </div>

        {uploading ? (
          <div className="agal-progress" role="status">
            <span><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Uploading {Math.min(uploading.done + 1, uploading.total)} of {uploading.total}…</span>
            <span className="agal-progress-bar"><span style={{ width: `${(uploading.done / uploading.total) * 100}%` }} /></span>
          </div>
        ) : null}
        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}

        {visible.length || (editable && !filtered) ? (
          <ul className={`agal-grid${pending ? " is-busy" : ""}`}>
            {visible.map(({ row, position, title }) => {
              const editHref = row.id ? `/admin/content/gallery_items/${row.id}` : null;
              const isHidden = row.published === false;
              const photoIndex = photos.findIndex((photo) => photo.position === position);
              return (
                <li
                  key={row.id ?? `${row.image_url}-${position}`}
                  className={`agal-card${isHidden ? " is-hidden" : ""}${dragId === row.id ? " is-dragging" : ""}${overId === row.id && dragId !== row.id ? " is-over" : ""}${busy && busy === row.id ? " is-busy" : ""}`}
                  draggable={canReorder}
                  onDragStart={(event) => {
                    if (!row.id) return;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", row.id);
                    setDragId(row.id);
                  }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDragOver={(event) => {
                    if (!dragId || hasFiles(event)) return;
                    event.preventDefault();
                    if (row.id && overId !== row.id) setOverId(row.id);
                  }}
                  onDrop={(event) => {
                    if (!dragId || !row.id) return;
                    event.preventDefault();
                    dropOn(row.id);
                  }}
                >
                  <figure>
                    <button type="button" className="agal-img" onClick={() => photoIndex >= 0 && setOpen(photoIndex)} aria-label={`Preview ${title}`} disabled={photoIndex < 0}>
                      {row.image_url ? <img src={row.image_url} alt="" loading="lazy" draggable={false} /> : <i className="fa-regular fa-image" aria-hidden="true" />}
                      <span className="agal-zoom" aria-hidden="true"><i className="fa-solid fa-expand" /></span>
                    </button>
                    <span className="agal-order" title="Position in the gallery">{position + 1}</span>
                    {isHidden ? <span className="agal-flag"><i className="fa-solid fa-eye-slash" aria-hidden="true" /> Hidden</span> : null}
                    {canReorder ? <span className="agal-grip" aria-hidden="true"><i className="fa-solid fa-grip-vertical" /></span> : null}
                  </figure>
                  <div className="agal-foot">
                    <div className="agal-title">
                      {editHref ? <Link href={editHref} title={title}>{title}</Link> : <strong title={title}>{title}</strong>}
                      <small>{isHidden ? "Hidden from the website" : "Live in the gallery"}</small>
                    </div>
                    <div className="story-actions agal-actions">
                      <button type="button" className="story-icon" title="Move earlier" disabled={!canReorder || position === 0 || pending} onClick={() => move(position, -1)}>
                        <i className="fa-solid fa-arrow-left" /><span className="visually-hidden">Move earlier</span>
                      </button>
                      <button type="button" className="story-icon" title="Move later" disabled={!canReorder || position === rows.length - 1 || pending} onClick={() => move(position, 1)}>
                        <i className="fa-solid fa-arrow-right" /><span className="visually-hidden">Move later</span>
                      </button>
                      <label className="story-switch" title={isHidden ? "Show on the website" : "Hide from the website"}>
                        <input type="checkbox" checked={!isHidden} disabled={!row.id || pending} onChange={(event) => togglePublished(row, event.target.checked)} />
                        <span aria-hidden="true" />
                        <span className="visually-hidden">Live on the website</span>
                      </label>
                      {editHref ? (
                        <Link className="story-icon" href={editHref} title="Edit caption or image"><i className="fa-solid fa-pen" /></Link>
                      ) : null}
                      <button type="button" className="story-icon is-danger" title="Remove photo" disabled={!row.id || pending} onClick={() => remove(row)}>
                        <i className="fa-regular fa-trash-can" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
            {editable && !filtered ? (
              <li
                className={`agal-drop${dropping ? " is-over" : ""}${uploading ? " is-busy" : ""}`}
                onDragOver={(event) => {
                  if (!hasFiles(event)) return;
                  event.preventDefault();
                  setDropping(true);
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={(event) => {
                  if (!hasFiles(event)) return;
                  event.preventDefault();
                  setDropping(false);
                  upload(event.dataTransfer.files);
                }}
              >
                <label htmlFor={UPLOAD_INPUT}>
                  <span className="agal-drop-icon"><i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /></span>
                  <strong>{dropping ? "Drop to upload" : "Add photos"}</strong>
                  <small>Drag pictures here or click to browse. They&apos;re added live at the end.</small>
                </label>
                <Link href="/admin/content/gallery_items/new" className="agal-drop-link">Or add one by link</Link>
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="apl-empty">
            <span><i className="fa-regular fa-images" aria-hidden="true" /></span>
            <h2>{rows.length ? "No photos match" : "No photos yet"}</h2>
            <p>{rows.length ? "Try a different search or clear the filters." : "Connect Supabase to start uploading photos."}</p>
          </div>
        )}

        <div className="apl-pager">
          <span>Showing {visible.length} of {rows.length} {rows.length === 1 ? "photo" : "photos"}</span>
          <span className="pg-legend">
            <i className="fa-solid fa-circle-info" aria-hidden="true" /> Click a photo to preview it. The switch shows or hides it instantly.
          </span>
        </div>
      </section>

      <PhotoLightbox photos={photos} open={open} setOpen={setOpen} />
    </div>
  );
}
