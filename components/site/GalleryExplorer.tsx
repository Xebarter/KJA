"use client";

import { useMemo, useState } from "react";
import { GalleryCard, PhotoLightbox, type Photo } from "@/components/site/HomeMotion";
import { galleryYears, type GalleryPhoto } from "@/lib/gallery";

const OTHER = "other";

// Blocks of five (one tall + four small) tile both the 3- and 2-column grids exactly;
// the leftover photos get shapes that close the final row on either grid.
function shapes(count: number) {
  const blocks = count - (count % 5);
  const rest = count - blocks;
  return Array.from({ length: count }, (_, index) => {
    if (index < blocks) return index % 5 ? "" : Math.floor(index / 5) % 2 ? " is-tall is-right" : " is-tall";
    const pos = index - blocks;
    if (rest === 1) return " is-full";
    if (rest === 2) return pos === 0 ? " is-wide" : " is-m-full";
    if (rest === 3) return pos === 0 ? " is-m-full" : "";
    return pos === 0 || pos === 3 ? " is-wide" : "";
  });
}

export function GalleryExplorer({ photos }: { photos: GalleryPhoto[] }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number | null>(null);
  const years = useMemo(() => galleryYears(photos), [photos]);
  const undated = photos.filter((photo) => !photo.year).length;
  const tabs = [
    { id: "all", label: "All photos", count: photos.length },
    ...years.map((year) => ({ id: year, label: year, count: photos.filter((photo) => photo.year === year).length })),
    ...(years.length && undated ? [{ id: OTHER, label: "Campus life", count: undated }] : []),
  ];
  const shown = useMemo(
    () => photos.filter((photo) => filter === "all" || (filter === OTHER ? !photo.year : photo.year === filter)),
    [photos, filter],
  );
  const slides: Photo[] = useMemo(() => shown.map((photo) => ({ src: photo.src, title: photo.title || undefined, tag: photo.year ?? "Campus life" })), [shown]);
  const layout = shapes(slides.length);

  const choose = (id: string) => {
    setOpen(null);
    setFilter(id);
  };

  return (
    <>
      <div className="kja-explorer-bar kja-gl-bar">
        {tabs.length > 1 ? (
          <div className="kja-explorer-tabs" role="group" aria-label="Filter photos by year">
            {tabs.map((tab) => (
              <button type="button" key={tab.id} className={filter === tab.id ? "active" : undefined} aria-pressed={filter === tab.id} onClick={() => choose(tab.id)}>
                {tab.label} <span>{tab.count}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="kja-gl-count"><strong>{photos.length}</strong> {photos.length === 1 ? "photo" : "photos"}</p>
        )}
        <p className="kja-gl-hint">
          <i className="fas fa-expand" aria-hidden="true" /> Tap any photo to view it full screen
        </p>
      </div>
      <p className="visually-hidden" aria-live="polite">{`Showing ${shown.length} ${shown.length === 1 ? "photo" : "photos"}`}</p>
      <div className="kja-gal kja-gl-grid" key={filter}>
        {slides.map((photo, index) => (
          <div className={`kja-gl-cell${layout[index]}`} style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }} key={`${photo.src}-${index}`}>
            <GalleryCard photo={photo} index={index} total={slides.length} onOpen={() => setOpen(index)} />
          </div>
        ))}
      </div>
      <PhotoLightbox photos={slides} open={open} setOpen={setOpen} />
    </>
  );
}
