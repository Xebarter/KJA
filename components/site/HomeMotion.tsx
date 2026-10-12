"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { formatEventDate } from "@/lib/format";
import type { Article } from "@/lib/types";

const GALLERY = [
  ["/images/hero07.jpg", "/images/about-004.jpg"],
  ["/images/12.png", "/images/hero08.jpg"],
  ["/images/hero10.jpg", "/images/16.jpg"],
];

function usePerPage() {
  const [perPage, setPerPage] = useState(3);
  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      setPerPage(width >= 1000 ? 3 : width >= 600 ? 2 : 1);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return perPage;
}

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

export function EventSlider({ items }: { items: Article[] }) {
  const perPage = usePerPage();
  const count = items.length;
  const loop = count > perPage;
  const frames = loop ? [...items.slice(-perPage), ...items, ...items.slice(0, perPage)] : items;
  const [index, setIndex] = useState(loop ? perPage : 0);
  const [sliding, setSliding] = useState(true);
  const real = ((index - (loop ? perPage : 0)) % count + count) % count;
  const gap = 25;

  useEffect(() => {
    setSliding(false);
    setIndex(loop ? perPage : 0);
    const frame = requestAnimationFrame(() => setSliding(true));
    return () => cancelAnimationFrame(frame);
  }, [perPage, loop]);

  useEffect(() => {
    if (!loop) return;
    if (index >= count + perPage || index < perPage) {
      const nextIndex = index >= count + perPage ? index - count : index + count;
      const timer = setTimeout(() => {
        setSliding(false);
        setIndex(nextIndex);
        requestAnimationFrame(() => requestAnimationFrame(() => setSliding(true)));
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [index, count, perPage, loop]);

  const next = () => setIndex((value) => value + 1);
  const prev = () => setIndex((value) => value - 1);
  const swipe = useSwipe(prev, next);

  if (!count) return <p>No events to show yet.</p>;

  const step = `calc(${-index} * (100% + ${gap}px) / ${perPage})`;
  const basis = `calc((100% - ${gap * (perPage - 1)}px) / ${perPage})`;

  return (
    <div className="event-slider owl-carousel owl-theme">
      <div className="kja-viewport" {...swipe}>
        <div className={`kja-track${sliding ? " is-sliding" : ""}`} style={{ gap, transform: `translateX(${step})` }}>
          {frames.map((item, frame) => (
            <div className="kja-slide" style={{ flexBasis: basis }} key={`${item.slug}-${frame}`}>
              <EventCard item={item} />
            </div>
          ))}
        </div>
      </div>
      {loop ? (
        <div className="owl-nav">
          <button className="owl-prev kja-arrow" type="button" aria-label="Previous events" onClick={prev}>
            <span className="kja-arrow-icon" aria-hidden="true" />
          </button>
          <button className="owl-next kja-arrow" type="button" aria-label="Next events" onClick={next}>
            <span className="kja-arrow-icon" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="owl-dots">
        {items.map((item, dot) => (
          <button
            key={item.slug}
            className={`owl-dot${dot === real ? " active" : ""}`}
            type="button"
            aria-label={`Show ${item.title}`}
            onClick={() => setIndex((loop ? perPage : 0) + dot)}
          >
            <span />
          </button>
        ))}
      </div>
    </div>
  );
}

function EventCard({ item }: { item: Article }) {
  const time = item.start_time && item.end_time ? `${item.start_time} - ${item.end_time}` : item.start_time || item.end_time || "- ";
  return (
    <div className="event-item h-100">
      {item.location ? (
        <div className="event-location">
          <span>
            <i className="fas fa-location-dot" />
            <span>&nbsp;&nbsp;&nbsp;</span> {item.location}
          </span>
        </div>
      ) : null}
      <div className="event-img">{item.image_url ? <img src={item.image_url} alt={item.title} /> : null}</div>
      <div className="event-info d-flex flex-column justify-content-between">
        <div className="event-meta">
          {item.starts_on ? (
            <span className="event-date">
              <i className="fas fa-calendar-days" />
              {formatEventDate(item.starts_on)}
            </span>
          ) : null}
          <span className="event-time">
            <i className="fas fa-clock" />
            {time}
          </span>
        </div>
        <h4 className="event-title">
          <Link href={`/event/${item.slug}`}>{item.title}</Link>
        </h4>
        <p>{item.excerpt || " "}</p>
        <div className="event-btn">
          <Link href={`/event/${item.slug}`} className="kja-btn">
            Join Event
            <i className="fas fa-arrow-right-long" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PhotoLightbox({ images, open, setOpen }: {
  images: string[];
  open: number | null;
  setOpen: React.Dispatch<React.SetStateAction<number | null>>;
}) {
  useEffect(() => {
    if (open == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowRight") setOpen((value) => (value == null ? value : (value + 1) % images.length));
      if (event.key === "ArrowLeft") setOpen((value) => (value == null ? value : (value - 1 + images.length) % images.length));
    };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, images.length, setOpen]);

  if (open == null) return null;
  return (
    <div className="kja-lightbox" role="dialog" aria-modal="true" aria-label="Photo gallery" onClick={() => setOpen(null)}>
      <button className="kja-lightbox-close" type="button" aria-label="Close photo" onClick={() => setOpen(null)}>
        <i className="fas fa-times" />
      </button>
      <button
        className="kja-lightbox-nav kja-arrow prev"
        type="button"
        aria-label="Previous photo"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => (value == null ? value : (value - 1 + images.length) % images.length));
        }}
      >
        <span className="kja-arrow-icon" aria-hidden="true" />
      </button>
      <img src={images[open]} alt="" onClick={(event) => event.stopPropagation()} />
      <button
        className="kja-lightbox-nav kja-arrow next"
        type="button"
        aria-label="Next photo"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => (value == null ? value : (value + 1) % images.length));
        }}
      >
        <span className="kja-arrow-icon" aria-hidden="true" />
      </button>
    </div>
  );
}

export function HomeGallery() {
  const images = GALLERY.flat();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <div className="row popup-gallery">
        {GALLERY.map((column, columnIndex) => (
          <div className="col-md-4 wow fadeInUp" data-wow-delay={`.${25 * (columnIndex + 1)}s`} key={column[0]}>
            {column.map((src) => {
              const index = images.indexOf(src);
              return (
                <div className="gallery-item" key={src}>
                  <div className="gallery-img">
                    <img src={src} alt="" />
                  </div>
                  <div className="gallery-content">
                    <button className="popup-img gallery-link" type="button" aria-label="Open photo" onClick={() => setOpen(index)}>
                      <i className="fas fa-plus" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div className="col-12 d-flex justify-content-center wow fadeInUp" data-wow-delay=".75s">
          <Link href="/gallery" className="kja-btn mt-3">
            View All
            <i className="fas fa-arrow-right-long" />
          </Link>
        </div>
      </div>
      <PhotoLightbox images={images} open={open} setOpen={setOpen} />
    </>
  );
}

export function ArchiveGallery({ images }: { images: string[] }) {
  const [open, setOpen] = useState<number | null>(null);

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
      <PhotoLightbox images={images} open={open} setOpen={setOpen} />
    </>
  );
}

export function VideoPlay({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const embed = url.includes("watch?v=") ? url.replace("watch?v=", "embed/") : url.replace("youtu.be/", "www.youtube.com/embed/");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button className="play-btn popup-youtube" type="button" aria-label="Play video" onClick={() => setOpen(true)}>
        <i className="fas fa-play" />
      </button>
      {open ? (
        <div className="kja-lightbox" role="dialog" aria-modal="true" aria-label="Latest video" onClick={() => setOpen(false)}>
          <button className="kja-lightbox-close" type="button" aria-label="Close video" onClick={() => setOpen(false)}>
            <i className="fas fa-times" />
          </button>
          <div className="kja-video-frame" onClick={(event) => event.stopPropagation()}>
            <iframe src={`${embed}${embed.includes("?") ? "&" : "?"}autoplay=1`} title="Kampala Junior Academy video" allow="autoplay; encrypted-media" allowFullScreen />
          </div>
        </div>
      ) : null}
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
