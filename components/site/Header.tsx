"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { useAuthDialog } from "@/components/account/AuthDialog";
import type { Article, Social } from "@/lib/types";

const about = [
  ["About Us", "/about-us"],
  ["From The Director", "/from-the-director"],
  ["Admission Process", "/admissions"],
  ["Apply Online", "/apply"],
  ["Fees and Payment", "/fees"],
];
const learning = [
  ["Academics", "/academics"],
  ["Arts & Culture", "/arts"],
  ["Sports", "/sport"],
  ["Leadership & Service", "/leadership"],
];
const clubs = [
  ["Sports", "/sports"],
  ["Music & Dance", "/music"],
  ["Language", "/language"],
  ["Leadership & Adventure", "/adventure"],
  ["Religion", "/religion"],
  ["Other skills & talent", "/talent"],
];
const media = [
  ["News", "/news"],
  ["Calendar", "/calendar"],
  ["Blog", "/blog"],
  ["Gallery", "/gallery"],
];
const alumni = [
  ["News", "/alumni-news"],
  ["Upcoming Events", "/alumni-events"],
  ["Our Stories", "/alumni-stories"],
  ["Photo Gallery", "/alumni-photo-gallery"],
  ["Get in touch", "/alumni-get-in-touch"],
  ["Alumni Profiles", "/alumni-profiles"],
];
const contact = [
  ["Contact us", "/contact-us"],
  ["Visit us", "/visit-us"],
  ["Staff Vacancies", "/vacancies"],
  ["Parent portal", "/account"],
];

function Menu({ label, items }: { label: string; items: string[][] }) {
  return (
    <li className="nav-item dropdown">
      <a className="nav-link dropdown-toggle" href="#">{label}</a>
      <ul className="dropdown-menu fade-down">
        {items.map(([name, href]) => (
          <li key={href + name}><Link className="dropdown-item" href={href}>{name}</Link></li>
        ))}
      </ul>
    </li>
  );
}

export function Header({ campuses, socials, phone, email, address, mapUrl }: {
  campuses: Pick<Article, "title" | "slug">[];
  socials: Social[];
  phone: string;
  email: string;
  address: string;
  mapUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const router = useRouter();
  const { openAuth, signedIn } = useAuthDialog();
  const phoneHref = `tel:${phone.replace(/\s/g, "")}`;

  const sections = [
    { id: "about", label: "About", items: about },
    { id: "campuses", label: "Campuses", items: campuses.map((campus) => [campus.title, `/branch/${campus.slug}`] as [string, string]) },
    { id: "learning", label: "Learning", items: learning },
    { id: "clubs", label: "Clubs", items: clubs },
    { id: "media", label: "Media", items: media },
    { id: "alumni", label: "Alumni", items: alumni },
    { id: "contact", label: "Contact", items: contact },
  ];

  const closeMenu = () => {
    setOpen(false);
    setExpanded(null);
  };

  const onAccount = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    closeMenu();
    // Session is known from AuthDialog (kept warm in the background). No await on click.
    if (signedIn === false) {
      openAuth("/account");
      return;
    }
    router.push("/account");
  };

  useEffect(() => {
    const updateScrolled = () => {
      setScrolled((current) => window.scrollY > (current ? 4 : 12));
    };
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const onResize = () => {
      if (window.innerWidth >= 992) closeMenu();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <header id="masthead" className={`site-header header${scrolled ? " is-scrolled" : ""}${open ? " is-menu-open" : ""}`}>
      <div className="header-top">
        <div className="container">
          <div className="header-top-wrap">
            <div className="header-top-left">
              <div className="header-top-contact">
                <ul>
                  <li className="header-top-address">
                    <a href={mapUrl} target="_blank" rel="noreferrer" aria-label={address}>
                      <i className="fa fa-location-dot" />
                      <span>{address}</span>
                    </a>
                  </li>
                  <li className="header-top-email">
                    <a href={`mailto:${email}`}>
                      <i className="far fa-envelope" />
                      <span>{email}</span>
                    </a>
                  </li>
                  <li className="header-top-phone">
                    <a href={phoneHref} aria-label={`Call ${phone}`}>
                      <i className="fa fa-phone" />
                      <span className="header-top-phone-text">{phone}</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="header-top-right">
              <div className="header-top-social">
                {socials.map((social) => (
                  <a key={social.href} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label}>
                    <i className={`fab fa-${social.icon}`} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="main-navigation">
        <nav id="nav-main" className="navbar navbar-expand-lg">
          <div className="container">
            <Link className="navbar-brand" href="/" aria-label="Kampala Junior Academy" onClick={closeMenu}>
              <span className="navbar-brand-seal" aria-hidden="true">
                <img src="/images/kja-logo.png" alt="" />
              </span>
              <span className="navbar-brand-wordmark">
                <span className="navbar-brand-fulltext">
                  <span className="navbar-brand-kampala">Kampala</span>
                  <span className="navbar-brand-sub">Junior Academy</span>
                </span>
                <span className="navbar-brand-compacttext">Kampala Junior Academy</span>
              </span>
            </Link>
            <div className="mobile-menu-right">
              <div className="search-btn">
                <button type="button" className="nav-right-link search-box-outer" aria-label="Search" onClick={() => { closeMenu(); setSearchOpen(true); }}>
                  <i className="fas fa-magnifying-glass" />
                </button>
              </div>
              <Link className="nav-account" href="/account" aria-label="Parent portal" title="Parent portal" onClick={onAccount}>
                <i className="fas fa-user" aria-hidden="true" />
              </Link>
              <button
                className={`navbar-toggler${open ? " is-open" : ""}`}
                type="button"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
                aria-controls="mobile-drawer"
                onClick={() => setOpen((value) => !value)}
              >
                <span className="hamburger" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
            <div className="collapse navbar-collapse" id="main_nav">
              <ul className="navbar-nav">
                {sections.map((section) => (
                  <Menu key={section.id} label={section.label} items={section.items} />
                ))}
              </ul>
              <Link className="nav-account" href="/account" aria-label="Parent portal" title="Parent portal" onClick={onAccount}>
                <i className="fas fa-user" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </nav>
      </div>
      <div className={`mobile-drawer${open ? " is-open" : ""}`} id="mobile-drawer">
        <button type="button" className="mobile-drawer-backdrop" aria-label="Close menu" onClick={closeMenu} />
        <aside className="mobile-drawer-panel" role="dialog" aria-modal="true" aria-label="Site menu">
          <div className="mobile-drawer-head">
            <div className="mobile-drawer-brand">
              <strong>Explore KJA</strong>
              <span>For Future Leaders</span>
            </div>
            <button type="button" className="mobile-drawer-close" aria-label="Close menu" onClick={closeMenu}>
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
          </div>
          <nav className="mobile-drawer-nav" aria-label="Mobile">
            {sections.map((section) => {
              const isExpanded = expanded === section.id;
              return (
                <div key={section.id} className={`mobile-drawer-item${isExpanded ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="mobile-drawer-toggle"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded(isExpanded ? null : section.id)}
                  >
                    {section.label}
                    <i className="fa fa-chevron-down" aria-hidden="true" />
                  </button>
                  <div className="mobile-drawer-sub">
                    <ul>
                      {section.items.map(([name, href]) => (
                        <li key={href + name}>
                          <Link href={href} onClick={closeMenu}>{name}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="mobile-drawer-foot">
            <Link className="mobile-drawer-cta" href="/account" onClick={onAccount}>Parent portal</Link>
            <Link className="mobile-drawer-cta" href="/apply" onClick={closeMenu}>Apply Online</Link>
            <div className="mobile-drawer-social">
              {socials.map((social) => (
                <a key={social.href} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label}>
                  <i className={`fab fa-${social.icon}`} />
                </a>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <div className={`search-popup ${searchOpen ? "open" : ""}`}>
        <button className="close-search" type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}><span className="fas fa-xmark" /></button>
        <form action="/search">
          <div className="form-group">
            <input type="search" name="q" placeholder="Search Here..." required />
            <button type="submit" aria-label="Search"><i className="fas fa-magnifying-glass" /></button>
          </div>
        </form>
      </div>
    </header>
  );
}
