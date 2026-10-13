import Link from "next/link";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { getAdminContent } from "@/lib/content";
import "./settings.css";

export const metadata = { title: "Site settings" };

export default async function SettingsPage() {
  const { settings } = await getAdminContent();
  const glance = [
    { icon: "fa-phone", label: "Phone", value: settings.phone || "Not set" },
    { icon: "fa-envelope", label: "Email", value: settings.email || "Not set" },
    { icon: "fa-share-nodes", label: "Social profiles", value: `${settings.socials?.length ?? 0} linked` },
  ];

  return (
    <div className="dash set-page">
      <section className="dash-hero set-hero">
        <div className="dash-hero-art set-hero-art" aria-hidden="true" />
        <div className="dash-hero-copy">
          <p className="dash-kicker">Website</p>
          <h1>Site settings</h1>
          <p>Contact details, the school&apos;s story, homepage highlights and the admissions popup. Changes go live as soon as you save.</p>
          <div className="dash-hero-actions">
            <a className="dash-btn dash-btn-glass" href="/" target="_blank" rel="noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View website
            </a>
            <Link className="dash-btn dash-btn-glass" href="/admin/images">
              <i className="fa-solid fa-images" aria-hidden="true" /> Manage images
            </Link>
          </div>
        </div>
        <div className="set-glance">
          <p className="set-glance-label">Live on the website</p>
          <div className={`set-glance-popup${settings.popup_enabled ? " is-on" : ""}`}>
            <span><i className={`fa-solid ${settings.popup_enabled ? "fa-bullhorn" : "fa-volume-xmark"}`} aria-hidden="true" /></span>
            <div>
              <small>Admissions popup</small>
              <strong>{settings.popup_enabled ? "Showing" : "Switched off"}</strong>
            </div>
            <em>{settings.popup_enabled ? "On" : "Off"}</em>
          </div>
          <ul>
            {glance.map((item) => (
              <li key={item.label}>
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SettingsForm settings={settings} />
    </div>
  );
}
