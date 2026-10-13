"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { replaceImage, updateImageTarget } from "@/app/actions";
import { imageGroups, type ImageSlot, type ImageTarget } from "@/lib/admin-images";
import { megabytes, shrinkImage, UPLOAD_LIMIT } from "@/lib/image-upload";

const PREVIEW_COUNT = 6;

const GROUP_ICONS: [RegExp, string][] = [
  [/^home/i, "fa-house"],
  [/^pages$/i, "fa-file-lines"],
  [/campus sections/i, "fa-layer-group"],
  [/^campuses$/i, "fa-school"],
  [/ campus$/i, "fa-location-dot"],
  [/teachers/i, "fa-chalkboard-user"],
  [/alumni photos/i, "fa-images"],
  [/alumni/i, "fa-user-graduate"],
  [/events/i, "fa-calendar-days"],
  [/news/i, "fa-newspaper"],
  [/blog/i, "fa-pen-nib"],
  [/gallery/i, "fa-camera-retro"],
  [/clubs/i, "fa-people-group"],
  [/facilit/i, "fa-building-columns"],
];

const SOURCES: Record<ImageTarget["kind"], { label: string; icon: string; hint: string }> = {
  "public-file": { label: "Site file", icon: "fa-file-image", hint: "Stored with the website files. Upload a new file to replace it." },
  settings: { label: "Homepage", icon: "fa-sliders", hint: "Saved in the homepage settings." },
  record: { label: "Content", icon: "fa-database", hint: "Saved on the content item." },
  "campus-json": { label: "Campus page", icon: "fa-school", hint: "Saved in the campus page content." },
};

function groupIcon(group: string) {
  return GROUP_ICONS.find(([pattern]) => pattern.test(group))?.[1] ?? "fa-folder";
}

function fileName(url: string) {
  const path = url.split("?")[0];
  try {
    return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
  } catch {
    return path.slice(path.lastIndexOf("/") + 1);
  }
}

function isGraphic(slot: ImageSlot, url: string) {
  return /icon|logo|shape/i.test(slot.label) || /\.svg(\?|$)/i.test(url);
}

function SlotCard({ slot, initialUrl, onSaved }: { slot: ImageSlot; initialUrl: string; onSaved: (key: string, url: string) => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState("");
  const [broken, setBroken] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const source = SOURCES[slot.target.kind];
  const siteFile = slot.target.kind === "public-file";
  const showImage = Boolean(url) && !broken;

  useEffect(() => {
    const img = imgRef.current;
    if (!img?.complete) return;
    if (img.naturalWidth) setSize(`${img.naturalWidth} × ${img.naturalHeight}`);
    else setBroken(true);
  }, [url]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2400);
    return () => clearTimeout(timer);
  }, [saved]);

  async function run(task: () => Promise<string>) {
    setBusy(true);
    setError("");
    try {
      const next = await task();
      setUrl(next);
      setBroken(false);
      setSize("");
      setEditing(false);
      setSaved(true);
      onSaved(slot.key, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this image.");
    } finally {
      setBusy(false);
    }
  }

  function onFile(file?: File) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPG, PNG, WebP or SVG).");
      return;
    }
    run(async () => {
      const upload = siteFile ? file : await shrinkImage(file);
      if (upload.size > UPLOAD_LIMIT) {
        throw new Error(
          siteFile
            ? `This file is ${megabytes(upload.size)}. Site files must be under 1 MB, so compress it first.`
            : `This file is ${megabytes(upload.size)} and could not be made smaller than 1 MB. Compress it first or use a link.`,
        );
      }
      const data = new FormData();
      data.set("file", upload);
      data.set("target", JSON.stringify(slot.target));
      return replaceImage(data);
    });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    onFile(event.dataTransfer.files?.[0]);
  }

  return (
    <article className={`img-card${busy ? " is-busy" : ""}${dragging ? " is-dragging" : ""}${showImage ? "" : " is-empty"}`}>
      <figure
        className={`img-card-media${isGraphic(slot, url) ? " is-graphic" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {showImage ? (
          <img
            ref={imgRef}
            src={url}
            alt=""
            loading="lazy"
            onLoad={(event) => setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)}
            onError={() => setBroken(true)}
          />
        ) : (
          <button type="button" className="img-card-placeholder" onClick={() => fileRef.current?.click()} disabled={busy}>
            <i className={`fa-solid ${broken ? "fa-link-slash" : "fa-cloud-arrow-up"}`} aria-hidden="true" />
            <strong>{broken ? "Image not found" : "No image yet"}</strong>
            <small>Drop a file here or click to upload</small>
          </button>
        )}
        <span className="img-card-source" title={source.hint}>
          <i className={`fa-solid ${source.icon}`} aria-hidden="true" /> {source.label}
        </span>
        {showImage ? (
          <a className="img-card-zoom" href={url} target="_blank" rel="noreferrer" aria-label={`Open ${slot.label} full size`} title="Open full size">
            <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true" />
          </a>
        ) : null}
        {dragging ? <div className="img-card-layer is-drop"><i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /> Drop to replace</div> : null}
        {busy ? <div className="img-card-layer is-busy"><span className="img-spinner" aria-hidden="true" /> Saving…</div> : null}
        {saved ? <div className="img-card-saved" role="status"><i className="fa-solid fa-check" aria-hidden="true" /> Saved</div> : null}
      </figure>

      <div className="img-card-body">
        <h3 title={slot.label}>{slot.label}</h3>
        <p className="img-card-meta">
          <span title={url || undefined}>{url ? fileName(url) : "Empty slot"}</span>
          {size ? <span className="img-card-size">{size}</span> : null}
        </p>

        {editing ? (
          <form
            className="img-card-url"
            onSubmit={(event) => {
              event.preventDefault();
              const next = String(new FormData(event.currentTarget).get("url") || "").trim();
              if (!next) return;
              run(async () => {
                await updateImageTarget(slot.target, next);
                return next;
              });
            }}
          >
            <input name="url" placeholder="https://… or /images/…" defaultValue={url} autoFocus aria-label="Image link" disabled={busy} />
            <button type="submit" className="img-act is-primary is-icon" aria-label="Save link" title="Save link" disabled={busy}>
              <i className="fa-solid fa-check" aria-hidden="true" />
            </button>
            <button type="button" className="img-act is-icon" aria-label="Cancel" title="Cancel" onClick={() => setEditing(false)} disabled={busy}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <div className="img-card-actions">
            <button type="button" className="img-act is-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <i className="fa-solid fa-arrow-up-from-bracket" aria-hidden="true" /> {url ? "Replace" : "Upload"}
            </button>
            {!siteFile ? (
              <button type="button" className="img-act" onClick={() => setEditing(true)} disabled={busy}>
                <i className="fa-solid fa-link" aria-hidden="true" /> Link
              </button>
            ) : null}
            {slot.href ? (
              <a className="img-act is-icon" href={slot.href} target="_blank" rel="noreferrer" aria-label="View on the website" title="View on the website">
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        )}
        {error ? (
          <p className="img-card-error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
          </p>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </article>
  );
}

export function ImageManager({ slots }: { slots: ImageSlot[] }) {
  const groups = useMemo(() => imageGroups(slots), [slots]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [group, setGroup] = useState("All");
  const [query, setQuery] = useState("");
  const [emptyOnly, setEmptyOnly] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const urlOf = (slot: ImageSlot) => urls[slot.key] ?? slot.imageUrl;
  const stats = useMemo(() => {
    const byGroup = new Map<string, { total: number; empty: number }>();
    let empty = 0;
    for (const slot of slots) {
      const entry = byGroup.get(slot.group) ?? { total: 0, empty: 0 };
      entry.total += 1;
      if (!(urls[slot.key] ?? slot.imageUrl)) {
        entry.empty += 1;
        empty += 1;
      }
      byGroup.set(slot.group, entry);
    }
    return { byGroup, empty, files: slots.filter((slot) => slot.target.kind === "public-file").length };
  }, [slots, urls]);

  const needle = query.trim().toLowerCase();
  const filtering = Boolean(needle) || emptyOnly;
  const visible = slots.filter((slot) => {
    if (group !== "All" && slot.group !== group) return false;
    if (emptyOnly && urlOf(slot)) return false;
    if (!needle) return true;
    return `${slot.label} ${slot.group} ${urlOf(slot)}`.toLowerCase().includes(needle);
  });
  const sections = (group === "All" ? groups : [group])
    .map((name) => ({ name, items: visible.filter((slot) => slot.group === name) }))
    .filter((section) => section.items.length);

  function choose(name: string) {
    setGroup(name);
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showEmpty() {
    setEmptyOnly(true);
    setGroup("All");
    setQuery("");
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onSaved(key: string, url: string) {
    setUrls((current) => ({ ...current, [key]: url }));
  }

  return (
    <>
      <section className="dash-hero img-hero">
        <div className="dash-hero-art img-hero-art" aria-hidden="true" />
        <div className="dash-hero-copy">
          <p className="dash-kicker">Media library</p>
          <h1>Images</h1>
          <p>Every photo, logo and icon on the website in one place. Choose a collection, then upload a new file or paste a link to replace it.</p>
          <div className="dash-hero-actions">
            <a className="dash-btn dash-btn-glass" href="/" target="_blank" rel="noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View website
            </a>
          </div>
        </div>
        <div className="img-hero-stats">
          <div>
            <i className="fa-solid fa-images" aria-hidden="true" />
            <strong>{slots.length}</strong>
            <span>Images</span>
          </div>
          <div>
            <i className="fa-solid fa-folder-tree" aria-hidden="true" />
            <strong>{groups.length}</strong>
            <span>Collections</span>
          </div>
          <button type="button" onClick={showEmpty} disabled={!stats.empty} className={stats.empty ? "is-alert" : ""}>
            <i className={`fa-solid ${stats.empty ? "fa-circle-exclamation" : "fa-circle-check"}`} aria-hidden="true" />
            <strong>{stats.empty}</strong>
            <span>{stats.empty ? "Empty slots" : "All filled"}</span>
          </button>
          <div>
            <i className="fa-solid fa-file-image" aria-hidden="true" />
            <strong>{stats.files}</strong>
            <span>Site files</span>
          </div>
        </div>
      </section>

      <div className="img-layout" ref={listRef}>
        <aside className="img-side">
          <nav className="img-collections" aria-label="Collections">
            <p className="img-side-label">Collections</p>
            <button type="button" className={group === "All" ? "active" : ""} onClick={() => choose("All")} aria-pressed={group === "All"}>
              <i className="fa-solid fa-border-all" aria-hidden="true" />
              <span>All images</span>
              <em>{slots.length}</em>
            </button>
            {groups.map((name) => {
              const entry = stats.byGroup.get(name);
              return (
                <button key={name} type="button" className={group === name ? "active" : ""} onClick={() => choose(name)} aria-pressed={group === name}>
                  <i className={`fa-solid ${groupIcon(name)}`} aria-hidden="true" />
                  <span>{name}</span>
                  {entry?.empty ? <b title={`${entry.empty} empty`} aria-label={`${entry.empty} empty`} /> : null}
                  <em>{entry?.total ?? 0}</em>
                </button>
              );
            })}
          </nav>
          <div className="img-tips">
            <p className="img-side-label">Good to know</p>
            <ul>
              <li><i className="fa-solid fa-hand-pointer" aria-hidden="true" /> Drag a photo straight onto any card to replace it.</li>
              <li><i className="fa-solid fa-compress" aria-hidden="true" /> Large photos are resized automatically before upload.</li>
              <li><i className="fa-solid fa-file-image" aria-hidden="true" /> Site files such as logos keep their name, so upload the same file type.</li>
            </ul>
          </div>
        </aside>

        <div className="img-main">
          <div className="img-toolbar">
            <label className="img-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, page or file" aria-label="Search images" />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <button type="button" className={`img-filter${emptyOnly ? " active" : ""}`} onClick={() => setEmptyOnly((value) => !value)} aria-pressed={emptyOnly}>
              <i className={`fa-solid ${emptyOnly ? "fa-check" : "fa-circle-half-stroke"}`} aria-hidden="true" /> Empty only
              <em>{stats.empty}</em>
            </button>
            <p className="img-count">
              {visible.length === slots.length ? `${slots.length} images` : `${visible.length} of ${slots.length} images`}
            </p>
          </div>

          {sections.length ? (
            sections.map((section) => {
              const entry = stats.byGroup.get(section.name);
              const preview = group === "All" && !filtering && section.items.length > PREVIEW_COUNT;
              const items = preview ? section.items.slice(0, PREVIEW_COUNT) : section.items;
              return (
                <section key={section.name} className="img-section">
                  <header className="img-section-head">
                    <span className="img-section-icon"><i className={`fa-solid ${groupIcon(section.name)}`} aria-hidden="true" /></span>
                    <div>
                      <h2>{section.name}</h2>
                      <p>
                        {entry?.total ?? section.items.length} {entry?.total === 1 ? "image" : "images"}
                        {entry?.empty ? <span className="img-section-empty"> · {entry.empty} empty</span> : null}
                      </p>
                    </div>
                    {preview ? (
                      <button type="button" className="img-section-more" onClick={() => choose(section.name)}>
                        Show all {section.items.length} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                      </button>
                    ) : null}
                  </header>
                  <div className="img-grid">
                    {items.map((slot) => <SlotCard key={slot.key} slot={slot} initialUrl={urlOf(slot)} onSaved={onSaved} />)}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="img-none">
              <span><i className="fa-regular fa-image" aria-hidden="true" /></span>
              <h2>No images match</h2>
              <p>{emptyOnly && !needle ? "Every slot in this collection has an image." : "Try another search or collection."}</p>
              <button
                type="button"
                className="img-act is-primary"
                onClick={() => {
                  setQuery("");
                  setEmptyOnly(false);
                  setGroup("All");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
