import Link from "next/link";
import { GalleryExplorer } from "@/components/site/GalleryExplorer";
import { NewsroomClose, SectionHead } from "@/components/site/Newsroom";
import { galleryYears, type GalleryPhoto } from "@/lib/gallery";
import type { Social } from "@/lib/types";

function Mosaic({ photos, total }: { photos: GalleryPhoto[]; total: number }) {
  const tiles = photos.length >= 4 ? photos.slice(0, 4) : photos.slice(0, 1);
  return (
    <a href="#photos" className={`kja-gl-mosaic${tiles.length === 1 ? " is-single" : ""}`} aria-label={`Browse all ${total} photos`}>
      {tiles.map((photo, index) => (
        <span className={`kja-gl-tile kja-gl-tile--${index + 1}`} key={`${photo.src}-${index}`}>
          <img src={photo.src} alt="" />
        </span>
      ))}
      <span className="kja-gl-badge">
        <i className="fas fa-camera-retro" aria-hidden="true" />
        <span><strong>{total}</strong> {total === 1 ? "photo" : "photos"}</span>
      </span>
    </a>
  );
}

export function GalleryView({ photos, campusCount, socials, email }: { photos: GalleryPhoto[]; campusCount: number; socials: Social[]; email: string }) {
  const years = galleryYears(photos);
  const span = years.length > 1 ? `${years[years.length - 1]}–${years[0].slice(2)}` : years[0];
  const instagram = socials.find((social) => /instagram/i.test(`${social.label} ${social.icon} ${social.href}`));
  const stats = [
    { value: photos.length, label: photos.length === 1 ? "Photo" : "Photos" },
    { value: campusCount, label: campusCount === 1 ? "Campus" : "Campuses" },
    ...(span ? [{ value: span, label: "Years captured" }] : []),
  ];

  return (
    <main id="main" className="kja-newsroom kja-gallery">
      <header className="kja-nr-hero kja-gl-hero">
        <div className="container">
          <nav aria-label="breadcrumb" className="kja-nr-crumbs">
            <Link href="/"><i className="fa-solid fa-house" aria-hidden="true" /> Home</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            <span aria-current="page">Gallery</span>
          </nav>
          <div className={`kja-nr-hero-grid${photos.length ? "" : " is-solo"}`}>
            <div className="kja-nr-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-camera-retro" aria-hidden="true" /> Life at KJA</span>
              <h1 className="kja-nr-hero-title">Our Photo <span>Gallery</span></h1>
              <p className="kja-nr-hero-lede">
                Sports days, trips, fairs, celebrations and everyday classroom moments from across our campuses, captured as they happen.
              </p>
              <div className="kja-nr-hero-actions">
                <a href="#photos" className="kja-nr-btn kja-nr-btn--gold">View photos <i className="fas fa-arrow-down" aria-hidden="true" /></a>
                {instagram ? (
                  <a href={instagram.href} className="kja-nr-btn kja-nr-btn--ghost" target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-instagram" aria-hidden="true" /> Follow on Instagram
                  </a>
                ) : (
                  <Link href="/events" className="kja-nr-btn kja-nr-btn--ghost"><i className="far fa-calendar" aria-hidden="true" /> Upcoming events</Link>
                )}
              </div>
              <dl className="kja-nr-stats">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {photos.length ? <Mosaic photos={photos} total={photos.length} /> : null}
          </div>
        </div>
      </header>

      <section id="photos" className="kja-nr-section kja-nr-section--stories" aria-label="Photo gallery">
        <div className="container">
          {photos.length ? (
            <>
              <SectionHead kicker="The album" title="Moments across our campuses" href="/events" linkLabel="What's coming up" />
              <GalleryExplorer photos={photos} />
            </>
          ) : (
            <div className="kja-explorer-empty">
              <i className="fas fa-images" aria-hidden="true" />
              <h3>No photos yet</h3>
              <p>Check back soon for pictures from our campuses.</p>
            </div>
          )}
        </div>
      </section>

      <NewsroomClose email={email} />
    </main>
  );
}
