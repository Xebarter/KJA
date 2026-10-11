"use client";

import { useEffect, useState } from "react";
import type { Slide } from "@/lib/types";

export function Hero({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [slides.length]);
  const slide = slides[index];
  if (!slide) return null;
  return (
    <div className="hero-section" style={{ position: "relative" }}>
      <div className="hero-single" style={{ backgroundImage: `url('${slide.image_url}')` }}>
        <div className="container" style={{ height: "100%" }}>
          <div className="d-flex flex-column justify-content-end" style={{ minHeight: 550 }}>
            <div className="position-relative slider-content-card d-flex flex-column justify-content-center align-items-center gap-2 py-5 px-4" style={{ width: "min(450px, 100%)" }}>
              <h3 className="text-white slider-text">{slide.title}</h3>
            </div>
          </div>
        </div>
      </div>
      {slides.length > 1 ? (
        <>
          <button className="kja-slider-btn prev" type="button" aria-label="Previous slide" onClick={() => setIndex((value) => (value - 1 + slides.length) % slides.length)}><i className="fas fa-chevron-left" /></button>
          <button className="kja-slider-btn next" type="button" aria-label="Next slide" onClick={() => setIndex((value) => (value + 1) % slides.length)}><i className="fas fa-chevron-right" /></button>
        </>
      ) : null}
    </div>
  );
}
