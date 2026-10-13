"use client";

import { useMemo, useState } from "react";
import { PhotoLightbox } from "@/components/site/HomeMotion";

export function ClubGallery({ images, label }: { images: string[]; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const photos = useMemo(() => images.map((src) => ({ src, tag: label })), [images, label]);

  return (
    <>
      <div className="kja-cb-gallery" data-count={Math.min(images.length, 5)}>
        {images.slice(0, 5).map((src, index) => (
          <button key={src} type="button" className="kja-cb-shot" onClick={() => setOpen(index)} aria-label={`View photo ${index + 1} of ${images.length}`}>
            <img src={src} alt="" loading="lazy" decoding="async" />
            <span className="kja-cb-shot-zoom" aria-hidden="true"><i className="fas fa-expand" /></span>
            {index === 4 && images.length > 5 ? <span className="kja-cb-shot-more">+{images.length - 5}</span> : null}
          </button>
        ))}
      </div>
      <PhotoLightbox photos={photos} open={open} setOpen={setOpen} />
    </>
  );
}
