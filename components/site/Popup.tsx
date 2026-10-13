"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "hidden" | "open" | "collapsing" | "closing" | "fab";

/* Module state is reset by every full page load, so the dialog opens once per load of the home page. */
let dialogShown = false;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AdmissionsPopup({ title, body, label, href }: { title: string; body: string; label: string; href: string }) {
  const pathname = usePathname();
  const signingIn = useSearchParams().has("login");
  const [phase, setPhase] = useState<Phase>("hidden");
  const cardRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLAnchorElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const [morphed, setMorphed] = useState(false);

  useEffect(() => {
    if (pathname !== "/" || dialogShown || signingIn) {
      setPhase((current) => (current === "hidden" ? "fab" : current));
      return;
    }
    const timer = setTimeout(() => {
      dialogShown = true;
      restoreFocus.current = document.activeElement as HTMLElement | null;
      setMorphed(false);
      setPhase("open");
    }, 400);
    return () => clearTimeout(timer);
  }, [pathname, signingIn]);

  const modal = phase === "open" || phase === "collapsing" || phase === "closing";

  useEffect(() => {
    if (phase !== "open") return;
    document.body.classList.add("no-scroll");
    ctaRef.current?.focus({ preventScroll: true });
    return () => document.body.classList.remove("no-scroll");
  }, [phase]);

  const showFab = phase === "fab" && pathname !== href;
  useEffect(() => {
    document.body.classList.toggle("has-apply-fab", showFab);
    return () => document.body.classList.remove("has-apply-fab");
  }, [showFab]);

  const collapse = useCallback(() => {
    if (phase !== "open") return;
    document.body.classList.remove("no-scroll");
    const card = cardRef.current;
    const fab = fabRef.current;
    if (!card || !fab || reducedMotion() || typeof card.animate !== "function") {
      setPhase("fab");
      return;
    }
    setPhase("collapsing");
    setMorphed(true);
    const from = card.getBoundingClientRect();
    const to = fab.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const animation = card.animate(
      [
        { transform: "translate(0, 0) scale(1, 1)", borderRadius: "28px", backgroundColor: "#ffffff" },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35}px) scale(${Math.max(to.width / from.width, 0.55)}, ${Math.max(to.height / from.height, 0.45)})`, borderRadius: "48px", backgroundColor: "#e42435", offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width}, ${to.height / from.height})`, borderRadius: "999px", backgroundColor: "#e42435" },
      ],
      { duration: 640, easing: "cubic-bezier(.65, 0, .35, 1)", fill: "forwards" },
    );
    animation.onfinish = () => setPhase("fab");
  }, [phase]);

  const close = useCallback(() => {
    if (phase !== "open") return;
    setPhase("closing");
    window.setTimeout(() => {
      setMorphed(false);
      setPhase("fab");
      restoreFocus.current?.focus?.({ preventScroll: true });
    }, reducedMotion() ? 0 : 320);
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") collapse();
      if (event.key === "Tab" && cardRef.current) {
        const items = [...cardRef.current.querySelectorAll<HTMLElement>("a[href], button")];
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, collapse]);

  if (phase === "hidden") return null;

  return (
    <>
      {modal ? (
        <div
          className={`kja-adm-overlay is-${phase}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) collapse();
          }}
        >
          <div ref={cardRef} className="kja-adm-card" role="dialog" aria-modal="true" aria-labelledby="kja-adm-title" aria-describedby="kja-adm-body">
            <button type="button" className="kja-adm-close" aria-label="Close" onClick={close}>
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
            <div className="kja-adm-band" aria-hidden="true" />
            <div className="kja-adm-content">
              <span className="kja-adm-seal" aria-hidden="true">
                <span><img src="/images/kja-logo.png" alt="" /></span>
              </span>
              <p className="kja-adm-eyebrow">Admissions open</p>
              <h2 id="kja-adm-title">{title}</h2>
              <p id="kja-adm-body" className="kja-adm-body">{body}</p>
              <Link
                ref={ctaRef}
                className="kja-adm-cta"
                href={href}
                onClick={() => setPhase("fab")}
              >
                {label || "Apply now"}
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      <Link
        ref={fabRef}
        href={href}
        className={`kja-apply-fab${showFab ? " is-visible" : ""}${morphed ? " is-morphed" : ""}`}
        aria-hidden={!showFab}
        tabIndex={showFab ? 0 : -1}
      >
        <span className="kja-apply-fab-icon" aria-hidden="true"><i className="fas fa-graduation-cap" /></span>
        <span className="kja-apply-fab-text">Apply</span>
        <i className="fas fa-arrow-right kja-apply-fab-arrow" aria-hidden="true" />
      </Link>
    </>
  );
}
