"use client";

import { useEffect, useState } from "react";
import type { TocEntry } from "@/lib/newsroom";

export function ReadingProgress({ target }: { target: string }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = document.querySelector(target);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      setProgress(total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target]);
  return (
    <div className="kja-article-progress" aria-hidden="true">
      <span style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

export function ArticleToc({ entries }: { entries: TocEntry[] }) {
  const [active, setActive] = useState(entries[0]?.id ?? "");
  useEffect(() => {
    const headings = entries.map((entry) => document.getElementById(entry.id)).filter((node): node is HTMLElement => Boolean(node));
    if (!headings.length) return;
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records.filter((record) => record.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -60% 0px" },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [entries]);
  return (
    <ol className="kja-article-toc-list">
      {entries.map((entry) => (
        <li key={entry.id} className={`${entry.level === 3 ? "is-sub" : ""}${active === entry.id ? " active" : ""}`.trim() || undefined}>
          <a href={`#${entry.id}`} aria-current={active === entry.id ? "location" : undefined}>{entry.text}</a>
        </li>
      ))}
    </ol>
  );
}

export function ShareBar({ url, title, variant }: { url: string; title: string; variant: "rail" | "inline" }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const text = encodeURIComponent(title);
  const link = encodeURIComponent(url);
  const targets = [
    { label: "WhatsApp", icon: "fab fa-whatsapp", href: `https://wa.me/?text=${text}%20${link}` },
    { label: "Facebook", icon: "fab fa-facebook-f", href: `https://www.facebook.com/sharer/sharer.php?u=${link}` },
    { label: "X", icon: "fab fa-x-twitter", href: `https://twitter.com/intent/tweet?url=${link}&text=${text}` },
    { label: "LinkedIn", icon: "fab fa-linkedin-in", href: `https://www.linkedin.com/sharing/share-offsite/?url=${link}` },
    { label: "Email", icon: "far fa-envelope", href: `mailto:?subject=${text}&body=${link}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div className={`kja-share kja-share--${variant}`}>
      <span className="kja-share-label">{variant === "rail" ? "Share" : "Share this story"}</span>
      <div className="kja-share-buttons">
        {targets.map((target) => (
          <a
            key={target.label}
            href={target.href}
            target={target.label === "Email" ? undefined : "_blank"}
            rel="noopener noreferrer"
            aria-label={`Share on ${target.label}`}
            title={target.label}
          >
            <i className={target.icon} aria-hidden="true" />
          </a>
        ))}
        <button type="button" onClick={copy} aria-label="Copy link" title={copied ? "Link copied" : "Copy link"} className={copied ? "is-done" : undefined}>
          <i className={`fas ${copied ? "fa-check" : "fa-link"}`} aria-hidden="true" />
        </button>
        {canShare && variant === "inline" ? (
          <button type="button" onClick={() => navigator.share({ title, url }).catch(() => undefined)} aria-label="More sharing options" title="More">
            <i className="fas fa-share-nodes" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <span className="kja-share-status" role="status">{copied ? "Link copied" : ""}</span>
    </div>
  );
}
