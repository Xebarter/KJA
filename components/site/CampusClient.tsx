"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { PhotoLightbox, type Photo } from "@/components/site/HomeMotion";
import type { CampusFacility, CampusMoment } from "@/lib/campus-profile";

const SLIDE_MS = 6500;
const pad = (value: number) => String(value).padStart(2, "0");

export function CampusSlides({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const count = images.length;
  const running = count > 1 && !paused && !hidden && !reduced;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    sync();
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [running, index, count]);

  const go = (step: number) => setIndex((value) => (value + step + count) % count);

  return (
    <>
      <div className="kja-cp-slides" aria-hidden="true">
        {images.map((src, slide) => (
          <img
            key={`${src}-${slide}`}
            src={src}
            alt=""
            className={slide === index ? "is-active" : undefined}
            loading={slide === 0 ? "eager" : "lazy"}
            fetchPriority={slide === 0 ? "high" : undefined}
            decoding="async"
          />
        ))}
      </div>
      {count > 1 ? (
        <div className="kja-cp-slide-ui" role="group" aria-label={`Photos of KJA ${name}`}>
          <span className="kja-cp-slide-count" aria-live="polite">
            <strong>{pad(index + 1)}</strong> / {pad(count)}
          </span>
          <div className="kja-cp-slide-bars">
            {images.map((src, slide) => (
              <button
                key={`${src}-bar-${slide}`}
                type="button"
                className={`kja-cp-slide-bar${slide === index ? " is-active" : ""}${slide < index ? " is-done" : ""}`}
                aria-label={`Show photo ${slide + 1} of ${count}`}
                aria-current={slide === index ? "true" : undefined}
                onClick={() => setIndex(slide)}
              >
                <span
                  key={slide === index ? `run-${index}` : undefined}
                  style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                />
              </button>
            ))}
          </div>
          <div className="kja-cp-slide-btns">
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo"><i className="fas fa-arrow-left" aria-hidden="true" /></button>
            <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Play slideshow" : "Pause slideshow"} aria-pressed={paused}>
              <i className={`fas ${paused ? "fa-play" : "fa-pause"}`} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo"><i className="fas fa-arrow-right" aria-hidden="true" /></button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function CampusMoments({ items }: { items: CampusMoment[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next = active;
    if (event.key in keys) next = (active + keys[event.key] + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  const item = items[active];
  return (
    <div className="kja-cp-moments">
      <div className="kja-cp-moment-tabs" role="tablist" aria-orientation="vertical" aria-label="Life on campus" onKeyDown={onKey}>
        {items.map((moment, index) => (
          <button
            key={moment.title}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={`${id}-panel`}
            tabIndex={index === active ? 0 : -1}
            className={index === active ? "is-active" : undefined}
            onClick={() => setActive(index)}
          >
            <span className="kja-cp-moment-icon"><i className={`fas ${moment.icon}`} aria-hidden="true" /></span>
            <span>{moment.title}</span>
            <i className="fas fa-chevron-right kja-cp-moment-go" aria-hidden="true" />
          </button>
        ))}
      </div>
      {item ? (
        <div className="kja-cp-moment-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`} key={active}>
          <span className="kja-cp-moment-icon kja-cp-moment-icon--lg"><i className={`fas ${item.icon}`} aria-hidden="true" /></span>
          <h3>{item.title}</h3>
          <div className="kja-cp-moment-body" dangerouslySetInnerHTML={{ __html: item.html }} />
        </div>
      ) : null}
    </div>
  );
}

export function CampusFacilities({ items, name }: { items: CampusFacility[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const pictured = items.filter((item) => item.image);
  const photos: Photo[] = pictured.map((item) => ({ src: item.image, title: item.title, tag: `KJA ${name}` }));

  if (!pictured.length) {
    return (
      <ul className="kja-cp-amenities">
        {items.map((item) => (
          <li key={item.title}>
            <span><i className={`fas ${item.icon}`} aria-hidden="true" /></span>
            {item.title}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="kja-cp-facilities">
        {pictured.map((item, index) => (
          <button type="button" className="kja-cp-facility" key={`${item.title}-${index}`} onClick={() => setOpen(index)} aria-label={`View photo: ${item.title}`}>
            <img src={item.image} alt="" loading="lazy" decoding="async" />
            <span className="kja-cp-facility-body">
              <span className="kja-cp-facility-icon"><i className={`fas ${item.icon}`} aria-hidden="true" /></span>
              <strong>{item.title}</strong>
            </span>
            <span className="kja-cp-facility-zoom" aria-hidden="true"><i className="fas fa-expand" /></span>
          </button>
        ))}
      </div>
      <PhotoLightbox photos={photos} open={open} setOpen={setOpen} />
    </>
  );
}

export function CampusGallery({ images, name }: { images: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const photos: Photo[] = images.map((src) => ({ src, tag: `KJA ${name}` }));
  const shown = images.slice(0, 5);

  return (
    <>
      <div className={`kja-cp-gallery is-${shown.length}`}>
        {shown.map((src, index) => {
          const more = index === shown.length - 1 && images.length > shown.length;
          return (
            <button type="button" className="kja-cp-shot" key={`${src}-${index}`} onClick={() => setOpen(index)} aria-label={more ? `View all ${images.length} photos` : `Open photo ${index + 1} of ${images.length}`}>
              <img src={src} alt="" loading="lazy" decoding="async" />
              {more ? <span className="kja-cp-shot-more">+{images.length - shown.length + 1}<small>more photos</small></span> : <span className="kja-cp-shot-zoom" aria-hidden="true"><i className="fas fa-expand" /></span>}
            </button>
          );
        })}
      </div>
      <PhotoLightbox photos={photos} open={open} setOpen={setOpen} />
    </>
  );
}
