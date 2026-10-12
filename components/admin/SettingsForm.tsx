"use client";

import { useState } from "react";
import { saveSettings } from "@/app/actions";
import type { Settings } from "@/lib/types";

const contactFields: (keyof Settings)[] = ["phone", "email", "address", "map_url"];
const aboutFields: (keyof Settings)[] = ["about_title", "about_body", "vision", "mission", "campuses_intro", "video_url", "footer_text"];
const popupFields: (keyof Settings)[] = ["popup_title", "popup_body", "popup_cta_label", "popup_cta_href"];
const jsonFields = ["counters", "hero_slides", "features", "choose_items", "socials"] as const;

function Field({ field, settings }: { field: keyof Settings; settings: Settings }) {
  const long = ["about_body", "vision", "mission", "campuses_intro", "footer_text", "popup_body"].includes(String(field));
  return (
    <label>
      {String(field).replaceAll("_", " ")}
      {long ? (
        <textarea name={field} rows={4} defaultValue={String(settings[field] ?? "")} />
      ) : (
        <input name={field} defaultValue={String(settings[field] ?? "")} />
      )}
    </label>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [message, setMessage] = useState("");
  return (
    <form className="admin-form" action={async (formData) => {
      try {
        await saveSettings(formData);
        setMessage("Settings saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save settings.");
      }
    }}>
      <h2>Contact</h2>
      {contactFields.map((field) => <Field key={field} field={field} settings={settings} />)}
      <h2>About the school</h2>
      {aboutFields.map((field) => <Field key={field} field={field} settings={settings} />)}
      <h2>Admissions popup</h2>
      <label className="admin-check">
        <input type="checkbox" name="popup_enabled" defaultChecked={settings.popup_enabled} /> Show admissions popup
      </label>
      {popupFields.map((field) => <Field key={field} field={field} settings={settings} />)}
      <details>
        <summary>Advanced lists (JSON)</summary>
        {jsonFields.map((field) => (
          <label key={field}>
            {field.replaceAll("_", " ")}
            <textarea name={field} rows={6} defaultValue={JSON.stringify(settings[field], null, 2)} />
          </label>
        ))}
      </details>
      <button className="admin-btn" type="submit">Save settings</button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
