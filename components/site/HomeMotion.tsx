"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";

export type Photo = { src: string; tag?: string; title?: string };

const GALLERY: Photo[][] = [
  [
    { src: "/images/hero07.jpg", tag: "Campus Life", title: "Friends under the old tree" },
    { src: "/images/about-004.jpg", tag: "Outdoor Learning", title: "Lessons in the garden" },
  ],
  [
    { src: "/images/12.png", tag: "Healthy Living", title: "Fun with fresh food" },
    { src: "/images/hero08.jpg", tag: "Creative Arts", title: "Little painters at work" },
  ],
  [
    { src: "/images/hero10.jpg", tag: "Celebrations", title: "Party day smiles" },
    { src: "/images/16.jpg", tag: "Field Trips", title: "Learning beyond the classroom" },
  ],
];
const GALLERY_PHOTOS = GALLERY.flat();

const pad = (value: number) => String(value).padStart(2, "0");

function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<number | null>(null);
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      start.current = event.clientX;
    },
    onPointerUp: (event: PointerEvent) => {
      if (start.current == null) return;
      const delta = event.clientX - start.current;
      if (delta > 50) onPrev();
      else if (delta < -50) onNext();
      start.current = null;
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

export function PhotoLightbox({ photos, open, setOpen }: {
  photos: Photo[];
  open: number | null;
  setOpen: Dispatch<SetStateAction<number | null>>;
}) {
  const count = photos.length;
  const [closing, setClosing] = useState(false);
  const [direction, setDirection] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, true>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pressX = useRef<number | null>(null);
  const isOpen = open != null;

  const go = (step: number) => {
    setDirection(step);
    setOpen((value) => (value == null ? value : (value + step + count) % count));
  };
  const jump = (index: number) => {
    if (open == null || index === open) return;
    setDirection(index > open ? 1 : -1);
    setOpen(index);
  };
  const close = () => {
    if (closing) return;
    const finish = () => {
      setClosing(false);
      setDirection(0);
      setOpen(null);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    setClosing(true);
    timer.current = window.setTimeout(finish, 280);
  };
  const actions = useRef({ go, close });
  actions.current = { go, close };
  const swipe = useSwipe(() => go(-1), () => go(1));

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") actions.current.close();
      if (event.key === "ArrowRight") actions.current.go(1);
      if (event.key === "ArrowLeft") actions.current.go(-1);
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button"));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (open == null || count < 2) return;
    stripRef.current?.querySelector<HTMLElement>(".is-active")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    [open + 1, open - 1].forEach((index) => {
      new Image().src = photos[(index + count) % count].src;
    });
  }, [open, photos, count]);

  if (open == null) return null;
  const photo = photos[open];
  const ready = Boolean(loaded[photo.src]);
  const closeOnBackdrop = (event: ReactMouseEvent) => {
    const dragged = pressX.current != null && Math.abs(event.clientX - pressX.current) > 10;
    if (event.target === event.currentTarget && !dragged) close();
  };

  return createPortal(
    <div
      ref={dialogRef}
      className={`kja-lb${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
      onClick={closeOnBackdrop}
      onPointerDownCapture={(event) => {
        pressX.current = event.clientX;
      }}
    >
      <div className="kja-lb-bar" onClick={closeOnBackdrop}>
        <span className="kja-lb-count" aria-live="polite">
          <b>{pad(open + 1)}</b>
          <span aria-hidden="true" />
          {pad(count)}
        </span>
        <button ref={closeRef} className="kja-lb-close" type="button" aria-label="Close gallery" onClick={close}>
          <i className="fas fa-xmark" />
        </button>
      </div>
      <div className="kja-lb-stage" onClick={closeOnBackdrop} {...swipe}>
        {count > 1 ? (
          <button className="kja-lb-nav kja-arrow prev" type="button" aria-label="Previous photo" onClick={() => go(-1)}>
            <span className="kja-arrow-icon" aria-hidden="true" />
          </button>
        ) : null}
        <figure className="kja-lb-figure" key={open} style={{ "--lb-dir": direction } as CSSProperties}>
          <div className={`kja-lb-media${ready ? " is-ready" : ""}`}>
            {ready ? null : <span className="kja-lb-spinner" aria-hidden="true" />}
            <img
              src={photo.src}
              alt={photo.title || `Photo ${open + 1} of ${count}`}
              draggable={false}
              onLoad={() => setLoaded((value) => (value[photo.src] ? value : { ...value, [photo.src]: true }))}
            />
          </div>
          {photo.title ? (
            <figcaption className="kja-lb-caption">
              {photo.tag ? <small>{photo.tag}</small> : null}
              {photo.title}
            </figcaption>
          ) : null}
        </figure>
        {count > 1 ? (
          <button className="kja-lb-nav kja-arrow next" type="button" aria-label="Next photo" onClick={() => go(1)}>
            <span className="kja-arrow-icon" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {count > 1 ? (
        <div className="kja-lb-strip" ref={stripRef} onClick={closeOnBackdrop}>
          {photos.map((item, index) => (
            <button
              key={`${item.src}-${index}`}
              className={`kja-lb-thumb${index === open ? " is-active" : ""}`}
              type="button"
              aria-label={`Show photo ${index + 1}${item.title ? `: ${item.title}` : ""}`}
              aria-current={index === open}
              onClick={() => jump(index)}
            >
              <img src={item.src} alt="" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export function GalleryCard({ photo, index, total, onOpen }: { photo: Photo; index: number; total: number; onOpen: () => void }) {
  return (
    <button
      className="kja-gal-card"
      type="button"
      aria-label={`Open photo ${index + 1} of ${total}${photo.title ? `: ${photo.title}` : ""}`}
      onClick={onOpen}
    >
      <img className="kja-gal-img" src={photo.src} alt="" loading="lazy" decoding="async" draggable={false} />
      <span className="kja-gal-frame" aria-hidden="true" />
      <span className="kja-gal-zoom" aria-hidden="true">
        <i className="fas fa-expand" />
      </span>
      {photo.title ? (
        <span className="kja-gal-caption" aria-hidden="true">
          <small>
            <b>{pad(index + 1)}</b>
            {photo.tag}
          </small>
          <strong>{photo.title}</strong>
        </span>
      ) : null}
    </button>
  );
}

export function HomeGallery() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <div className="kja-gal kja-hg">
        {GALLERY_PHOTOS.map((photo, index) => (
          <div className="kja-gal-cell wow fadeInUp" data-wow-delay={`${0.08 + index * 0.06}s`} key={photo.src}>
            <GalleryCard photo={photo} index={index} total={GALLERY_PHOTOS.length} onOpen={() => setOpen(index)} />
          </div>
        ))}
      </div>
      <PhotoLightbox photos={GALLERY_PHOTOS} open={open} setOpen={setOpen} />
    </>
  );
}

export function PhotoGrid({ photos, className = "", children }: { photos: Photo[]; className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <div className={`kja-gal kja-photo-grid ${className}`.trim()}>
        {photos.map((photo, index) => (
          <div className="kja-gal-cell" key={`${photo.src}-${index}`}>
            <GalleryCard photo={photo} index={index} total={photos.length} onOpen={() => setOpen(index)} />
          </div>
        ))}
        {children}
      </div>
      <PhotoLightbox photos={photos} open={open} setOpen={setOpen} />
    </>
  );
}

export function ArchiveGallery({ images }: { images: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const photos = useMemo(() => images.map((src) => ({ src })), [images]);

  return (
    <>
      <div className="row popup-gallery">
        {images.map((src, index) => (
          <div className="col-md-4 wow fadeInUp" data-wow-delay=".25s" key={`${src}-${index}`}>
            <div className="gallery-item w-100 h-100">
              <div className="gallery-img w-100 h-100">
                <img className="w-100 h-100" src={src} alt="" />
              </div>
              <div className="gallery-content">
                <a
                  className="popup-img gallery-link"
                  href={src}
                  aria-label="View photo"
                  onClick={(event) => {
                    event.preventDefault();
                    setOpen(index);
                  }}
                >
                  <i className="fas fa-plus" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
      <PhotoLightbox photos={photos} open={open} setOpen={setOpen} />
    </>
  );
}

function youtubeEmbed(url: string) {
  const id = url.match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/)?.[1];
  const base = id ? `https://www.youtube.com/embed/${id}` : url;
  return `${base}${base.includes("?") ? "&" : "?"}autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

export function VideoPlay({ url }: { url: string }) {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const [loaded, setLoaded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const open = phase !== "closed";

  const close = () => {
    if (phase !== "open") return;
    setPhase("closing");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = window.setTimeout(() => {
      setPhase("closed");
      setLoaded(false);
      triggerRef.current?.focus({ preventScroll: true });
    }, reduced ? 0 : 280);
  };

  const closeLatest = useRef(close);
  closeLatest.current = close;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLatest.current();
      if (event.key === "Tab" && document.activeElement === closeRef.current) {
        event.preventDefault();
        frameRef.current?.focus();
      }
    };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} className="play-btn popup-youtube" type="button" aria-label="Play video" onClick={() => setPhase("open")}>
        <i className="fas fa-play" />
      </button>
      {open
        ? createPortal(
            <div className={`kja-vid is-${phase}`} role="dialog" aria-modal="true" aria-label="Latest video" onClick={close}>
              <button ref={closeRef} className="kja-vid-close" type="button" aria-label="Close video" onClick={close}>
                <i className="fas fa-xmark" />
              </button>
              <figure className="kja-vid-frame">
                <div className="kja-vid-screen">
                  {loaded ? null : <span className="kja-vid-spinner" aria-hidden="true" />}
                  <iframe
                    ref={frameRef}
                    src={youtubeEmbed(url)}
                    title="Kampala Junior Academy video"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    onLoad={() => setLoaded(true)}
                  />
                </div>
                <figcaption className="kja-vid-caption">
                  <span className="kja-vid-brand">
                    <img src="/images/kja-logo.png" alt="" />
                  </span>
                  <span className="kja-vid-title">
                    <small>Latest video</small>
                    Kampala Junior Academy
                  </span>
                  <span className="kja-vid-hint">Click anywhere to close</span>
                </figcaption>
              </figure>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function CounterValue({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / 3000);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(value * eased));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { rootMargin: "0px 0px -100px 0px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref} className="counter" data-count="+" data-to={value} data-speed="3000">
      {display}
    </span>
  );
}

const BLOCK = '[class*="wp-block"]';
const ENTRY_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "span"];

function markThemeWow() {
  const blocks = (node: ParentNode) => node.querySelectorAll(BLOCK).length;
  const fadeIn = (node: Element, delay: string) => {
    node.classList.add("wow", "fadeInUp");
    node.setAttribute("data-wow-delay", delay);
  };
  document.querySelectorAll(BLOCK).forEach((block) => {
    let parent: ParentNode | null = block.parentNode;
    // .kja-fragment wraps body HTML split around an embedded form; on WordPress those blocks sit directly in the parent.
    while (parent instanceof Element && parent.classList.contains("kja-fragment")) parent = parent.parentNode;
    while (parent?.parentNode && blocks(parent.parentNode) === blocks(parent)) parent = parent.parentNode;
    // WOW never animates <html>, so a container that climbs to the document is left alone.
    if (!(parent instanceof Element) || parent.classList.contains("wow-processed")) return;
    parent.classList.add("wow-processed");
    Array.from(parent.children).forEach((child, index) => fadeIn(child, `${index * 0.2}s`));
  });
  document.querySelectorAll(".entry-content").forEach((container) => {
    ENTRY_TAGS.forEach((tag) => container.querySelectorAll(tag).forEach((node) => fadeIn(node, ".5s")));
  });
}

function wowTop(node: HTMLElement) {
  let top = node.offsetTop;
  for (let parent = node.offsetParent as HTMLElement | null; parent; parent = parent.offsetParent as HTMLElement | null) top += parent.offsetTop;
  return top;
}

export function ThemeEffects() {
  const pathname = usePathname();
  useEffect(() => {
    markThemeWow();
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".wow:not(.animated)"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      nodes.forEach((node) => node.classList.add("animated"));
      return;
    }
    // Same visibility test as WOW.js: layout offsets only, so boxes inside an off-screen
    // offcanvas are revealed by scroll position rather than when the panel slides in.
    let pending = nodes;
    let scrolled = true;
    const reveal = () => {
      if (!scrolled) return;
      scrolled = false;
      const viewTop = window.scrollY;
      const viewBottom = viewTop + Math.min(document.documentElement.clientHeight, window.innerHeight);
      pending = pending.filter((node) => {
        const top = wowTop(node);
        if (top > viewBottom || top + node.clientHeight < viewTop) return true;
        node.style.animationDelay = node.getAttribute("data-wow-delay") || "0s";
        node.classList.add("animated");
        return false;
      });
    };
    const onScroll = () => {
      scrolled = true;
    };
    const timer = window.setInterval(reveal, 50);
    window.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onScroll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);
  return null;
}
