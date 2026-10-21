"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { replaceImage, updateImageTarget } from "@/app/actions";
import { imageGroups, type ImageSlot, type ImageTarget } from "@/lib/admin-images";
import { megabytes, shrinkImage, UPLOAD_LIMIT } from "@/lib/image-upload";
import { noteProcess } from "@/lib/process-signal";

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

function fileExtension(value: string) {
  const ext = value.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
  return ext === "jpeg" ? "jpg" : ext;
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
    if (siteFile && slot.target.kind === "public-file") {
      const wanted = fileExtension(slot.target.path);
      const got = fileExtension(file.name);
      if (wanted && got && wanted !== got) {
        setError(`This image is a ${wanted.toUpperCase()} at a fixed address. Upload a ${wanted.toUpperCase()} so the page does not break.`);
        return;
      }
    }
    noteProcess(url ? "Replacing the image" : "Uploading the image");
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
          <a className="img-card-open" href={url} target="_blank" rel="noreferrer" aria-label={`Open ${slot.label}`}>
            <img
              ref={imgRef}
              src={url}
              alt=""
              loading="lazy"
              onLoad={(event) => setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)}
              onError={() => setBroken(true)}
            />
            <span className="img-card-open-label">Open</span>
          </a>
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
              if (!next) {
                setError("Paste an image address, starting with https:// or /.");
                return;
              }
              if (!/^(https?:\/\/|\/)/i.test(next)) {
                setError("Use a full address (https://…) or a site path (/images/…).");
                return;
              }
              if (next === url) {
                setEditing(false);
                return;
              }
              noteProcess("Saving the image");
              run(async () => {
                await updateImageTarget(slot.target, next);
                return next;
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setEditing(false);
                setError("");
              }
            }}
          >
            <input name="url" placeholder="https://… or /images/…" defaultValue={url} autoFocus aria-label="Image link" disabled={busy} />
            <div className="img-card-url-actions">
              <button type="submit" className="img-act is-primary" disabled={busy}>Save</button>
              <button type="button" className="img-act" onClick={() => { setEditing(false); setError(""); }} disabled={busy}>Cancel</button>
            </div>
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
              <a className="img-act" href={slot.href} target="_blank" rel="noreferrer">View page</a>
            ) : null}
          </div>
        )}
        {siteFile && !editing ? (
          <p className="img-card-note">Upload a {fileExtension(slot.target.kind === "public-file" ? slot.target.path : "file").toUpperCase()} under 1 MB. The address on the website stays the same.</p>
        ) : null}
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
  const matchesText = (slot: ImageSlot) => `${slot.label} ${slot.group} ${urlOf(slot)}`.toLowerCase().includes(needle);
  const visible = slots.filter((slot) => {
    if (group !== "All" && slot.group !== group) return false;
    if (emptyOnly && urlOf(slot)) return false;
    if (!needle) return true;
    return matchesText(slot);
  });
  const outside = group !== "All" && needle
    ? slots.filter((slot) => slot.group !== group && (!emptyOnly || !urlOf(slot)) && matchesText(slot)).length
    : 0;
  const emptyElsewhere = emptyOnly && group !== "All"
    ? slots.filter((slot) => slot.group !== group && !urlOf(slot)).length
    : 0;
  const sections = (group === "All" ? groups : [group])
    .map((name) => ({ name, items: visible.filter((slot) => slot.group === name) }))
    .filter((section) => section.items.length);

  function choose(name: string) {
    setGroup(name);
    listRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function showEmpty() {
    if (emptyOnly) {
      setEmptyOnly(false);
      return;
    }
    setEmptyOnly(true);
    setGroup("All");
    setQuery("");
    listRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function onSaved(key: string, url: string) {
    setUrls((current) => ({ ...current, [key]: url }));
  }

  return (
    <>
      <header className="img-head">
        <div>
          <h1>Images</h1>
          <p>Every photo, logo and icon on the website. Choose a collection, then upload or drop a file to replace it.</p>
        </div>
        <a className="img-btn" href="/" target="_blank" rel="noreferrer">
          <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View website
        </a>
      </header>

      <div className="img-strip" aria-label="Library summary">
        <div>
          <span className="img-stat-icon" aria-hidden="true"><i className="fa-solid fa-images" /></span>
          <span>
            <span>Images</span>
            <strong>{slots.length.toLocaleString("en-GB")}</strong>
            <small>Across the website</small>
          </span>
        </div>
        <div>
          <span className="img-stat-icon" aria-hidden="true"><i className="fa-solid fa-folder-tree" /></span>
          <span>
            <span>Collections</span>
            <strong>{groups.length.toLocaleString("en-GB")}</strong>
            <small>Pages, people and events</small>
          </span>
        </div>
        <button type="button" className={`${stats.empty ? "is-alert" : "is-ok"}${emptyOnly ? " is-on" : ""}`} onClick={showEmpty} disabled={!stats.empty} aria-pressed={emptyOnly}>
          <span className="img-stat-icon" aria-hidden="true"><i className={`fa-solid ${stats.empty ? "fa-circle-exclamation" : "fa-circle-check"}`} /></span>
          <span>
            <span>Empty slots</span>
            <strong>{stats.empty.toLocaleString("en-GB")}</strong>
            <small>{emptyOnly ? "Showing every empty slot" : stats.empty ? "Show only these" : "Every slot is filled"}</small>
          </span>
        </button>
        <div>
          <span className="img-stat-icon" aria-hidden="true"><i className="fa-solid fa-file-image" /></span>
          <span>
            <span>Site files</span>
            <strong>{stats.files.toLocaleString("en-GB")}</strong>
            <small>Logos and icons on the server</small>
          </span>
        </div>
      </div>

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
                  {entry?.empty ? <small>{entry.empty} empty</small> : null}
                  <em>{entry?.total ?? 0}</em>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="img-main">
          <div className="img-toolbar">
            <label className="img-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={group === "All" ? "Search by name, page or file" : `Search in ${group}`} aria-label="Search images" />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </label>
            {emptyOnly ? (
              <button type="button" className="img-chip" onClick={() => setEmptyOnly(false)}>
                Empty slots <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
            {outside ? (
              <button type="button" className="img-chip" onClick={() => setGroup("All")}>
                {outside} more in other collections
              </button>
            ) : null}
            <p className="img-count">
              {needle
                ? `${visible.length.toLocaleString("en-GB")} matching${group === "All" ? "" : ` in ${group}`}`
                : emptyOnly
                  ? `${visible.length.toLocaleString("en-GB")} empty ${visible.length === 1 ? "slot" : "slots"}`
                  : group === "All"
                    ? `${slots.length.toLocaleString("en-GB")} images`
                    : `${visible.length.toLocaleString("en-GB")} in ${group}`}
            </p>
          </div>
          <p className="img-hint">Drop a photo onto a card to replace it. Large photos are resized before they upload.</p>

          {sections.length ? (
            sections.map((section) => {
              const entry = stats.byGroup.get(section.name);
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
                  </header>
                  <div className="img-grid">
                    {section.items.map((slot) => <SlotCard key={slot.key} slot={slot} initialUrl={urlOf(slot)} onSaved={onSaved} />)}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="img-none">
              <span><i className="fa-regular fa-image" aria-hidden="true" /></span>
              <h2>{needle ? "Nothing matches" : emptyOnly ? "No empty slots here" : "Nothing in this collection"}</h2>
              <p>
                {needle
                  ? outside
                    ? `Nothing in ${group} matches. ${outside} ${outside === 1 ? "image" : "images"} in other collections ${outside === 1 ? "does" : "do"}.`
                    : `No image ${group === "All" ? "in the library" : `in ${group}`} matches “${query.trim()}”.`
                  : emptyElsewhere
                    ? `${emptyElsewhere} empty ${emptyElsewhere === 1 ? "slot is" : "slots are"} in other collections.`
                    : "Every slot in this collection has an image."}
              </p>
              <button
                type="button"
                className="img-act is-primary"
                onClick={() => {
                  if (outside || emptyElsewhere) {
                    setGroup("All");
                    return;
                  }
                  setQuery("");
                  setEmptyOnly(false);
                  setGroup("All");
                }}
              >
                {outside ? "Search all collections" : emptyElsewhere ? "Show every empty slot" : "Clear filters"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
