"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Article, Social } from "@/lib/types";

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
  campuses: Article[];
  socials: Social[];
  phone: string;
  email: string;
  address: string;
  mapUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateScrolled = () => {
      setScrolled((current) => window.scrollY > (current ? 24 : 64));
    };
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  return (
    <header id="masthead" className={`site-header header${scrolled ? " is-scrolled" : ""}`}>
      <div className="header-top">
        <div className="container">
          <div className="header-top-wrap">
            <div className="header-top-left">
              <div className="header-top-contact">
                <ul>
                  <li><a href={mapUrl} target="_blank" rel="noreferrer"><i className="fa fa-location-dot" /> {address}</a></li>
                  <li><a href={`mailto:${email}`}><i className="far fa-envelope" /> {email}</a></li>
                  <li><a href={`tel:${phone.replace(/\s/g, "")}`}><i className="fa fa-phone-volume" /> {phone}</a></li>
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
            <Link className="navbar-brand" href="/" aria-label="Kampala Junior Academy">
              <img className="navbar-brand-full" src="/images/kja-logo.png" alt="" />
              <span className="navbar-brand-compact">
                <img src="/images/icon.png" alt="" />
                <span>Kampala Junior Academy</span>
              </span>
            </Link>
            <div className="mobile-menu-right">
              <div className="search-btn">
                <button type="button" className="nav-right-link search-box-outer" aria-label="Search" onClick={() => setSearchOpen(true)}>
                  <i className="far fa-search" />
                </button>
              </div>
              <button className="navbar-toggler" type="button" aria-label="Toggle navigation" onClick={() => setOpen((value) => !value)}>
                <span className="navbar-toggler-mobile-icon"><i className="far fa-bars" /></span>
              </button>
            </div>
            <div className={`collapse navbar-collapse ${open ? "show" : ""}`} id="main_nav">
              <ul className="navbar-nav">
                <Menu label="About" items={[["About Us", "/about-us"], ["From The Director", "/from-the-director"], ["Admission Process", "/admissions"], ["Apply Online", "/apply"], ["Fees and Payment", "/fees"]]} />
                <Menu label="Campuses" items={campuses.map((campus) => [campus.title, `/branch/${campus.slug}`])} />
                <Menu label="Learning" items={learning} />
                <Menu label="Clubs" items={clubs} />
                <Menu label="Media" items={media} />
                <Menu label="Alumni" items={alumni} />
                <Menu label="Contact" items={[["Contact us", "/contact-us"], ["Visit us", "/visit-us"], ["Staff Vacancies", "/vacancies"]]} />
              </ul>
            </div>
          </div>
        </nav>
      </div>
      <div className={`search-popup ${searchOpen ? "open" : ""}`}>
        <button className="close-search" type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}><span className="far fa-times" /></button>
        <form action="/search">
          <div className="form-group">
            <input type="search" name="q" placeholder="Search Here..." required />
            <button type="submit"><i className="far fa-search" /></button>
          </div>
        </form>
      </div>
    </header>
  );
}
