"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EventsManager } from "@/components/admin/EventsManager";
import { GalleryManager } from "@/components/admin/GalleryManager";
import type { Article, GalleryItem } from "@/lib/types";

const TABS = [
  { id: "events", label: "Events", icon: "fa-calendar-days" },
  { id: "gallery", label: "Gallery", icon: "fa-camera-retro" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabOf(value: string | null | undefined): TabId {
  return value === "gallery" ? "gallery" : "events";
}

export function EventsPhotosHub({
  events,
  gallery,
  editable,
  today,
  initialTab,
}: {
  events: Article[];
  gallery: GalleryItem[];
  editable: boolean;
  today: string;
  initialTab?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(() => tabOf(initialTab));

  useEffect(() => setTab(tabOf(initialTab)), [initialTab]);

  const select = (next: TabId) => {
    setTab(next);
    router.replace(next === "gallery" ? "/admin/content/events?tab=gallery" : "/admin/content/events");
  };

  return (
    <div className="cms-hub">
      <nav className="cms-hub-tabs" aria-label="Events and photos">
        {TABS.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? "is-active" : undefined} onClick={() => select(item.id)}>
            <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "gallery" ? (
        <GalleryManager items={gallery} editable={editable} />
      ) : (
        <EventsManager events={events} editable={editable} today={today} />
      )}
    </div>
  );
}
