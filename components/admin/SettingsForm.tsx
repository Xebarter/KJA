"use client";

import { useState } from "react";
import { saveSettings } from "@/app/actions";
import type { Settings } from "@/lib/types";

const textFields: (keyof Settings)[] = ["phone", "email", "address", "map_url", "footer_text", "video_url", "about_title", "about_body", "vision", "mission", "campuses_intro", "popup_title", "popup_body", "popup_cta_label", "popup_cta_href"];
const jsonFields = ["counters", "hero_slides", "features", "choose_items", "socials"] as const;

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
      {textFields.map((field) => (
        <label key={field}>
          {field.replaceAll("_", " ")}
          {field === "about_body" || field === "vision" || field === "mission" || field === "campuses_intro" || field === "footer_text" ? (
            <textarea name={field} rows={4} defaultValue={String(settings[field] ?? "")} />
          ) : (
            <input name={field} defaultValue={String(settings[field] ?? "")} />
          )}
        </label>
      ))}
      <label>
        <input type="checkbox" name="popup_enabled" defaultChecked={settings.popup_enabled} /> Admissions popup
      </label>
      {jsonFields.map((field) => (
        <label key={field}>
          {field.replaceAll("_", " ")} JSON
          <textarea name={field} rows={6} defaultValue={JSON.stringify(settings[field], null, 2)} />
        </label>
      ))}
      <button className="kja-btn" type="submit">Save settings</button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
