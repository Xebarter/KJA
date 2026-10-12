"use client";

import { useEffect, useState } from "react";
import type { Slide } from "@/lib/types";

function HeroTitle({ title }: { title: string }) {
  const lead = "Kampala Junior Academy, ";
  const accent = "right School";
  if (title.startsWith(lead) && title.includes(accent)) {
    const accentAt = title.indexOf(accent);
    return (
      <h3 className="text-white slider-text">
        <span>{lead}</span>
        {title.slice(lead.length, accentAt)}
        <span>{accent}</span>
        {title.slice(accentAt + accent.length)}
      </h3>
    );
  }
  return <h3 className="text-white slider-text">{title}</h3>;
}

function SlideFrame({ slide }: { slide: Slide }) {
  return (
    <div className="hero-single" style={{ background: `url('${slide.image_url}')` }}>
      <div className="container" style={{ height: "100%" }}>
        <div className="row h-100">
          <div className="col-12 h-100">
            <div className="d-flex flex-column justify-content-end" style={{ minHeight: 550 }}>
              <div
                className="position-relative slider-content-card d-flex flex-column justify-content-center align-items-center gap-2 py-7 p-5"
                style={{ width: "min(450px, calc(100% - 72px))" }}
              >
                <HeroTitle title={slide.title} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero({ slides }: { slides: Slide[] }) {
  const count = slides.length;
  const loop = count > 1;
  const frames = loop ? [slides[count - 1], ...slides, slides[0]] : slides;
  const [index, setIndex] = useState(loop ? 1 : 0);
  const [sliding, setSliding] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!loop || paused) return;
    const timer = setInterval(() => setIndex((value) => value + 1), 5000);
    return () => clearInterval(timer);
  }, [loop, paused]);

  useEffect(() => {
    if (!loop) return;
    if (index === 0 || index === count + 1) {
      const timer = setTimeout(() => {
        setSliding(false);
        setIndex(index === 0 ? count : 1);
        requestAnimationFrame(() => requestAnimationFrame(() => setSliding(true)));
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [index, count, loop]);

  if (!count) return null;

  return (
    <div className="hero-section">
      <div
        className="hero-slider owl-carousel owl-theme"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="kja-viewport">
          <div className={`kja-track${sliding ? " is-sliding" : ""}`} style={{ transform: `translateX(-${index * 100}%)` }}>
            {frames.map((slide, frame) => (
              <div className="kja-slide" key={`${slide.image_url}-${frame}`}>
                <SlideFrame slide={slide} />
              </div>
            ))}
          </div>
        </div>
        {loop ? (
          <div className="owl-nav">
            <button className="owl-prev kja-arrow" type="button" aria-label="Previous slide" onClick={() => setIndex((value) => value - 1)}>
              <span className="kja-arrow-icon" aria-hidden="true" />
            </button>
            <button className="owl-next kja-arrow" type="button" aria-label="Next slide" onClick={() => setIndex((value) => value + 1)}>
              <span className="kja-arrow-icon" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
