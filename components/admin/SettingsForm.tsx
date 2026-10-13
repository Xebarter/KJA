"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { saveSettings } from "@/app/actions";
import type { Settings } from "@/lib/types";

type SectionId = "contact" | "about" | "homepage" | "popup" | "social";

const SECTIONS: { id: SectionId; label: string; icon: string; text: string; where: string[] }[] = [
  {
    id: "contact",
    label: "Contact details",
    icon: "fa-address-book",
    text: "How families reach the school.",
    where: ["Header", "Footer", "Contact & apply pages", "Parent portal"],
  },
  {
    id: "about",
    label: "About the school",
    icon: "fa-school-flag",
    text: "The school's story, vision and mission, plus the short footer blurb.",
    where: ["Homepage", "Footer"],
  },
  {
    id: "homepage",
    label: "Homepage",
    icon: "fa-house",
    text: "Slider captions, learning pillars, key numbers and the campuses introduction.",
    where: ["Homepage"],
  },
  {
    id: "popup",
    label: "Admissions popup",
    icon: "fa-bullhorn",
    text: "The welcome dialog shown once per visit on the homepage, which then tucks into an Apply button.",
    where: ["Homepage", "Apply button on every page"],
  },
  {
    id: "social",
    label: "Social media",
    icon: "fa-share-nodes",
    text: "Profiles linked from the header and footer.",
    where: ["Header", "Footer"],
  },
];

type FieldProps = {
  name: keyof Settings;
  label: string;
  hint?: ReactNode;
  value: string;
  onChange?: (value: string) => void;
  rows?: number;
  icon?: string;
  placeholder?: string;
  wide?: boolean;
  type?: string;
};

function Field({ name, label, hint, value, onChange, rows, icon, placeholder, wide, type = "text" }: FieldProps) {
  const [length, setLength] = useState(value.length);
  const shared = {
    name,
    placeholder,
    ...(onChange ? { value } : { defaultValue: value }),
    onChange: (event: { currentTarget: { value: string } }) => {
      setLength(event.currentTarget.value.length);
      onChange?.(event.currentTarget.value);
    },
  };
  return (
    <label className={`set-field${wide ? " is-wide" : ""}`}>
      <span className="set-label">
        {label}
        {rows ? <em>{length} characters</em> : null}
      </span>
      <span className={`set-control${icon ? " has-icon" : ""}`}>
        {icon ? <i className={icon.includes(" ") ? icon : `fa-solid ${icon}`} aria-hidden="true" /> : null}
        {rows ? <textarea rows={rows} {...shared} /> : <input type={type} {...shared} />}
      </span>
      {hint ? <small className="set-hint">{hint}</small> : null}
    </label>
  );
}

type Column = { key: string; label: string; placeholder?: string; number?: boolean; wide?: boolean };
type Row = Record<string, unknown>;

function ListEditor({
  name,
  items,
  columns,
  blank,
  addLabel,
  preview,
  onEdit,
}: {
  name: keyof Settings;
  items: Row[];
  columns: Column[];
  blank: Row;
  addLabel: string;
  preview?: (row: Row) => ReactNode;
  onEdit: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(items);
  const update = (next: Row[]) => {
    setRows(next);
    onEdit();
  };
  const move = (from: number, to: number) => {
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    update(next);
  };

  return (
    <div className="set-list">
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.length ? (
        <ol>
          {rows.map((row, index) => (
            <li key={index} className="set-row">
              <span className="set-row-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {preview ? <span className="set-row-preview">{preview(row)}</span> : null}
              <div className="set-row-fields">
                {columns.map((column) => (
                  <label key={column.key} className={column.wide ? "is-wide" : ""}>
                    <span>{column.label}</span>
                    <input
                      type={column.number ? "number" : "text"}
                      value={String(row[column.key] ?? "")}
                      placeholder={column.placeholder}
                      onChange={(event) => {
                        const value = column.number ? Number(event.target.value) : event.target.value;
                        update(rows.map((item, at) => (at === index ? { ...item, [column.key]: value } : item)));
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="set-row-tools">
                <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label="Move up" title="Move up">
                  <i className="fa-solid fa-arrow-up" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => move(index, index + 1)} disabled={index === rows.length - 1} aria-label="Move down" title="Move down">
                  <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                </button>
                <button type="button" className="is-danger" onClick={() => update(rows.filter((_, at) => at !== index))} aria-label="Remove" title="Remove">
                  <i className="fa-solid fa-trash-can" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="set-list-empty">Nothing here yet.</p>
      )}
      <button type="button" className="set-add" onClick={() => update([...rows, { ...blank }])}>
        <i className="fa-solid fa-plus" aria-hidden="true" /> {addLabel}
      </button>
    </div>
  );
}

function Group({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <div className="set-group">
      <div className="set-group-head">
        <h3>{title}</h3>
        {text ? <p>{text}</p> : null}
      </div>
      {children}
    </div>
  );
}

function youtubeId(url: string) {
  return url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1] ?? "";
}

function Thumb({ src, icon }: { src: unknown; icon?: boolean }) {
  if (!src) return <i className="fa-regular fa-image" aria-hidden="true" />;
  return <img className={icon ? "is-icon" : ""} src={String(src)} alt="" />;
}

function SettingsFields({ settings, onEdit }: { settings: Settings; onEdit: (section: SectionId) => void }) {
  const [video, setVideo] = useState(settings.video_url || "");
  const [popup, setPopup] = useState({
    enabled: settings.popup_enabled,
    title: settings.popup_title || "",
    body: settings.popup_body || "",
    label: settings.popup_cta_label || "",
    href: settings.popup_cta_href || "",
  });
  const setPopupField = (key: keyof typeof popup) => (value: string) => setPopup((current) => ({ ...current, [key]: value }));
  const videoId = youtubeId(video);
  const section = (id: SectionId) => SECTIONS.find((item) => item.id === id)!;

  const card = (id: SectionId, children: ReactNode, aside?: ReactNode) => {
    const info = section(id);
    return (
      <section id={`set-${id}`} className="set-card" data-section={id}>
        <header className="set-card-head">
          <span className="set-card-icon"><i className={`fa-solid ${info.icon}`} aria-hidden="true" /></span>
          <div>
            <h2>{info.label}</h2>
            <p>{info.text}</p>
            <ul className="set-where" aria-label="Appears on">
              {info.where.map((place) => <li key={place}>{place}</li>)}
            </ul>
          </div>
          {aside}
        </header>
        <div className="set-card-body">{children}</div>
      </section>
    );
  };

  return (
    <>
      {card(
        "contact",
        <div className="set-fields">
          <Field name="phone" label="Phone number" value={settings.phone || ""} icon="fa-phone" placeholder="+256 …" hint="Used for every “Call” button, so include the country code." />
          <Field name="email" label="Email address" value={settings.email || ""} icon="fa-envelope" type="email" placeholder="info@kja.ug" />
          <Field name="address" label="Address" value={settings.address || ""} icon="fa-location-dot" wide />
          <Field
            name="map_url"
            label="Google Maps link"
            value={settings.map_url || ""}
            icon="fa-map-location-dot"
            wide
            placeholder="https://www.google.com/maps/…"
            hint="Opened when visitors click the address. Copy it from Google Maps → Share."
          />
        </div>,
      )}

      {card(
        "about",
        <div className="set-fields">
          <Field name="about_title" label="Headline" value={settings.about_title || ""} wide hint="The word “Since” is highlighted when the headline includes it." />
          <Field name="about_body" label="Our story" value={settings.about_body || ""} rows={6} wide hint="The opening, up to “since 1993.”, is shown larger as an introduction." />
          <Field name="vision" label="Vision" value={settings.vision || ""} rows={4} />
          <Field name="mission" label="Mission" value={settings.mission || ""} rows={4} />
          <Field name="footer_text" label="Footer blurb" value={settings.footer_text || ""} rows={3} wide hint="A sentence or two shown under the logo in the footer." />
        </div>,
      )}

      {card(
        "homepage",
        <>
          <Group title="Slider" text="Captions for the large photos at the top of the homepage. Change the photos on the Images page.">
            <ListEditor
              name="hero_slides"
              items={settings.hero_slides || []}
              blank={{ title: "", image_url: "" }}
              addLabel="Add slide"
              preview={(row) => <Thumb src={row.image_url} />}
              columns={[
                { key: "title", label: "Caption" },
                { key: "image_url", label: "Photo link", placeholder: "/images/…" },
              ]}
              onEdit={() => onEdit("homepage")}
            />
          </Group>
          <Group title="Learning pillars" text="The four cards below the slider, each linking to a Learning page.">
            <ListEditor
              name="features"
              items={settings.features || []}
              blank={{ title: "", icon: "", href: "/" }}
              addLabel="Add pillar"
              preview={(row) => <Thumb src={row.icon} icon />}
              columns={[
                { key: "title", label: "Title" },
                { key: "href", label: "Links to", placeholder: "/academics" },
                { key: "icon", label: "Icon link", placeholder: "/images/…", wide: true },
              ]}
              onEdit={() => onEdit("homepage")}
            />
          </Group>
          <Group title="Key numbers" text="Start a label with “+” to show the number as “200+”.">
            <ListEditor
              name="counters"
              items={settings.counters || []}
              blank={{ value: 0, label: "", icon: "" }}
              addLabel="Add number"
              preview={(row) => <Thumb src={row.icon} icon />}
              columns={[
                { key: "value", label: "Number", number: true },
                { key: "label", label: "Label" },
                { key: "icon", label: "Icon link", placeholder: "/images/…", wide: true },
              ]}
              onEdit={() => onEdit("homepage")}
            />
          </Group>
          <Group title="Why choose us" text="Short reasons shown beside the school video.">
            <ListEditor
              name="choose_items"
              items={settings.choose_items || []}
              blank={{ title: "", icon: "" }}
              addLabel="Add reason"
              preview={(row) => <Thumb src={row.icon} icon />}
              columns={[
                { key: "title", label: "Title" },
                { key: "icon", label: "Icon link", placeholder: "/images/…" },
              ]}
              onEdit={() => onEdit("homepage")}
            />
          </Group>
          <Group title="Video and campuses">
            <div className="set-fields">
              <div className="set-video is-wide">
                <Field
                  name="video_url"
                  label="School video"
                  value={video}
                  onChange={setVideo}
                  icon="fa-brands fa-youtube"
                  placeholder="https://www.youtube.com/watch?v=…"
                  hint="A YouTube link. It plays when visitors press the play button."
                />
                <a
                  className={`set-video-thumb${videoId ? "" : " is-empty"}`}
                  href={videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={videoId ? "Watch the video on YouTube" : undefined}
                >
                  {videoId ? <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="" /> : null}
                  <i className={`fa-solid ${videoId ? "fa-play" : "fa-video-slash"}`} aria-hidden="true" />
                </a>
              </div>
              <Field
                name="campuses_intro"
                label="Campuses introduction"
                value={settings.campuses_intro || ""}
                rows={5}
                wide
                hint="Shown above “Our campuses”. Text from “Today,” onwards becomes a second paragraph."
              />
            </div>
          </Group>
        </>,
      )}

      {card(
        "popup",
        <div className="set-popup">
          <div className="set-fields">
            <label className="set-switch is-wide">
              <input
                type="checkbox"
                name="popup_enabled"
                checked={popup.enabled}
                onChange={(event) => setPopup((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span aria-hidden="true" />
              <span>
                <strong>{popup.enabled ? "Popup is switched on" : "Popup is switched off"}</strong>
                <small>{popup.enabled ? "Visitors see it when they open the homepage." : "Turn it on when admissions open."}</small>
              </span>
            </label>
            <Field name="popup_title" label="Title" value={popup.title} onChange={setPopupField("title")} wide />
            <Field name="popup_body" label="Message" value={popup.body} onChange={setPopupField("body")} rows={3} wide />
            <Field name="popup_cta_label" label="Button text" value={popup.label} onChange={setPopupField("label")} placeholder="Apply now" />
            <Field name="popup_cta_href" label="Button link" value={popup.href} onChange={setPopupField("href")} placeholder="/apply" icon="fa-link" />
          </div>
          <div className="set-preview">
            <p className="set-preview-label">
              <i className="fa-solid fa-eye" aria-hidden="true" /> Live preview
            </p>
            <div className={`set-popup-card${popup.enabled ? "" : " is-off"}`}>
              <div className="set-popup-band" />
              <span className="set-popup-seal"><span><img src="/images/kja-logo.png" alt="" /></span></span>
              <p className="set-popup-eyebrow">Admissions open</p>
              <h4>{popup.title || "Add a title"}</h4>
              <p className="set-popup-body">{popup.body}</p>
              <span className="set-popup-cta">
                {popup.label || "Apply now"} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </span>
              {popup.enabled ? null : <span className="set-popup-off"><i className="fa-solid fa-eye-slash" aria-hidden="true" /> Hidden from visitors</span>}
            </div>
          </div>
        </div>,
      )}

      {card(
        "social",
        <ListEditor
          name="socials"
          items={settings.socials || []}
          blank={{ label: "", href: "", icon: "" }}
          addLabel="Add profile"
          preview={(row) => <i className={`fa-brands fa-${String(row.icon || "globe")}`} aria-hidden="true" />}
          columns={[
            { key: "label", label: "Name", placeholder: "Facebook" },
            { key: "icon", label: "Icon", placeholder: "facebook-f" },
            { key: "href", label: "Profile link", placeholder: "https://…", wide: true },
          ]}
          onEdit={() => onEdit("social")}
        />,
        <a className="set-card-link" href="https://fontawesome.com/search?o=r&f=brands" target="_blank" rel="noreferrer">
          Find icon names <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
        </a>,
      )}
    </>
  );
}

type Status = { kind: "idle" | "saving" | "saved" | "error"; text?: string };

export function SettingsForm({ settings }: { settings: Settings }) {
  const formRef = useRef<HTMLFormElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState<SectionId[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [active, setActive] = useState<SectionId>("contact");

  const markDirty = useCallback((id: SectionId) => {
    setDirty((current) => (current.includes(id) ? current : [...current, id]));
    setStatus((current) => (current.kind === "saved" ? { kind: "idle" } : current));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!dirty.length) return;
    const onLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty.length]);

  useEffect(() => {
    const cards = SECTIONS.map((item) => document.getElementById(`set-${item.id}`)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.getAttribute("data-section") as SectionId);
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    cards.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [version]);

  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>("a.active");
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2, behavior: "smooth" });
  }, [active]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "saving") return;
    setStatus({ kind: "saving" });
    try {
      await saveSettings(new FormData(event.currentTarget));
      setDirty([]);
      setStatus({
        kind: "saved",
        text: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" }),
      });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Could not save settings." });
    }
  }

  function discard() {
    setDirty([]);
    setStatus({ kind: "idle" });
    setVersion((value) => value + 1);
  }

  const dirtyLabels = SECTIONS.filter((item) => dirty.includes(item.id)).map((item) => item.label);

  return (
    <div className="set-layout">
      <aside className="set-side">
        <nav ref={navRef} className="set-nav" aria-label="Settings sections">
          <p className="set-side-label">Sections</p>
          {SECTIONS.map((item) => (
            <a key={item.id} href={`#set-${item.id}`} className={active === item.id ? "active" : ""} aria-current={active === item.id ? "true" : undefined}>
              <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
              {dirty.includes(item.id) ? <b title="Unsaved changes" aria-label="Unsaved changes" /> : null}
            </a>
          ))}
        </nav>
        <Link className="set-side-card" href="/admin/images">
          <i className="fa-solid fa-images" aria-hidden="true" />
          <span>
            <strong>Looking for photos?</strong>
            <small>Slider photos, logos and icons are on the Images page.</small>
          </span>
          <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </Link>
      </aside>

      <form
        ref={formRef}
        className="set-form"
        onSubmit={onSubmit}
        onInput={(event) => {
          const id = (event.target as HTMLElement).closest("[data-section]")?.getAttribute("data-section");
          if (id) markDirty(id as SectionId);
        }}
      >
        <SettingsFields key={version} settings={settings} onEdit={markDirty} />

        <div className={`set-savebar is-${status.kind}${dirty.length ? " is-dirty" : ""}`}>
          <p role="status">
            {status.kind === "saving" ? (
              <><span className="set-spinner" aria-hidden="true" /> Saving your changes…</>
            ) : status.kind === "error" ? (
              <><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {status.text}</>
            ) : dirty.length ? (
              <><i className="fa-solid fa-pen" aria-hidden="true" /> Unsaved changes in {dirtyLabels.join(", ")}</>
            ) : status.kind === "saved" ? (
              <><i className="fa-solid fa-circle-check" aria-hidden="true" /> All changes saved at {status.text}. They are live on the website.</>
            ) : (
              <><i className="fa-regular fa-circle-check" aria-hidden="true" /> Everything is up to date</>
            )}
          </p>
          <div>
            <span className="set-kbd" aria-hidden="true"><kbd>Ctrl</kbd> <kbd>S</kbd></span>
            {dirty.length ? (
              <button type="button" className="set-discard" onClick={discard} disabled={status.kind === "saving"}>
                Discard
              </button>
            ) : null}
            <button type="submit" className="set-save" disabled={status.kind === "saving" || (!dirty.length && status.kind !== "error")}>
              <i className="fa-solid fa-floppy-disk" aria-hidden="true" /> Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
