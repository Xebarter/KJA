"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlumniEventsManager } from "@/components/admin/AlumniEventsManager";
import { AlumniPhotosManager } from "@/components/admin/AlumniPhotosManager";
import { AlumniProfilesManager } from "@/components/admin/AlumniProfilesManager";
import type { AlumniEventRow, AlumniPhotoRow, AlumniProfileRow } from "@/lib/alumni-admin";

const TABS = [
  { id: "events", label: "Events", icon: "fa-calendar-check" },
  { id: "profiles", label: "Profiles", icon: "fa-user-graduate" },
  { id: "photos", label: "Photos", icon: "fa-images" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabOf(value: string | null | undefined): TabId {
  if (value === "profiles" || value === "photos") return value;
  return "events";
}

export function AlumniHub({
  events,
  profiles,
  photos,
  editable,
  initialTab,
}: {
  events: AlumniEventRow[];
  profiles: AlumniProfileRow[];
  photos: AlumniPhotoRow[];
  editable: boolean;
  initialTab?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(() => tabOf(initialTab));

  useEffect(() => setTab(tabOf(initialTab)), [initialTab]);

  const select = (next: TabId) => {
    setTab(next);
    const href = next === "events" ? "/admin/content/alumni" : `/admin/content/alumni?tab=${next}`;
    router.replace(href);
  };

  return (
    <div className="cms-hub">
      <nav className="cms-hub-tabs" aria-label="Alumni content">
        {TABS.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? "is-active" : undefined} onClick={() => select(item.id)}>
            <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            {item.label}
          </button>
        ))}
        <Link className="cms-hub-stories" href="/admin/stories?type=alumni_news">
          <i className="fa-solid fa-newspaper" aria-hidden="true" /> Alumni news & stories
        </Link>
      </nav>
      {tab === "profiles" ? (
        <AlumniProfilesManager profiles={profiles} editable={editable} />
      ) : tab === "photos" ? (
        <AlumniPhotosManager photos={photos} editable={editable} />
      ) : (
        <AlumniEventsManager events={events} editable={editable} />
      )}
    </div>
  );
}
