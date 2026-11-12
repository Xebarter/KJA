"use client";
import { askConfirm } from "@/components/AppConfirm";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteRecord, saveRecord } from "@/app/actions";
import { CampusEditor } from "@/components/admin/CampusEditor";
import {
  campusIcon,
  kindOf,
  plainText,
  type CampusInsight,
  type CampusRow,
  type SectionKind,
  type SectionRow,
} from "@/lib/campus-admin";
import "@/app/admin/campuses.css";

const TABS = [
  { id: "overview", label: "Overview", icon: "fa-circle-info" },
  { id: "facility", label: "Facilities", icon: "fa-building-columns" },
  { id: "life", label: "Campus life", icon: "fa-people-group" },
  { id: "activity", label: "Clubs", icon: "fa-medal" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabOf(value: string | null | undefined): TabId {
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : "overview";
}

function CampusSectionsPanel({
  campusId,
  campusSlug,
  campusTitle,
  kind,
  sections,
  editable,
}: {
  campusId: string;
  campusSlug: string;
  campusTitle: string;
  kind: SectionKind;
  sections: SectionRow[];
  editable: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(sections);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null);
  const [, startTransition] = useTransition();
  const meta = kindOf(kind);

  useEffect(() => setRows(sections), [sections]);

  const list = useMemo(
    () =>
      rows
        .filter((row) => row.kind === kind && (!row.campus_slug || row.campus_slug === campusSlug))
        .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title)),
    [rows, kind, campusSlug],
  );

  const remove = async (row: SectionRow) => {
    if (!row.id || !(await askConfirm(`Delete “${row.title}”? This can't be undone.`))) return;
    setBusy(row.id);
    startTransition(async () => {
      try {
        await deleteRecord("campus_sections", row.id!);
        setRows((current) => current.filter((item) => item.id !== row.id));
        setFeedback({ ok: `“${row.title}” deleted.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not delete." });
      } finally {
        setBusy(null);
      }
    });
  };

  const assignHere = (row: SectionRow) => {
    if (!row.id) return;
    setBusy(row.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id!);
      data.set("campus_slug", campusSlug);
      try {
        await saveRecord("campus_sections", data);
        setRows((current) => current.map((item) => (item.id === row.id ? { ...item, campus_slug: campusSlug } : item)));
        setFeedback({ ok: `“${row.title}” assigned to ${campusTitle}.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not update." });
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="cpa-hub-panel">
      <div className="cpa-hub-panel-head">
        <div>
          <h2>{meta.label}</h2>
          <p>{meta.hint} Changes appear on the {campusTitle} campus page as soon as you save.</p>
        </div>
        {editable ? (
          <Link
            className="admin-hero-btn is-primary"
            href={`/admin/content/campus_sections/new?campus=${encodeURIComponent(campusSlug)}&kind=${kind}&return=${encodeURIComponent(`/admin/content/campuses/${campusId}?tab=${kind}`)}`}
          >
            <i className="fa-solid fa-plus" aria-hidden="true" /> Add {meta.short.toLowerCase()}
          </Link>
        ) : null}
      </div>

      <div className="cpa-feedback" aria-live="polite">
        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}
      </div>

      {list.length ? (
        <div className="cpa-hub-sections">
          {list.map((row) => {
            const shared = !row.campus_slug;
            const blurb = plainText(row.body);
            return (
              <article key={row.id ?? row.title} className={`cpa-hub-section${busy === row.id ? " is-busy" : ""}`}>
                <div className="cpa-hub-section-media">
                  {row.image_url ? (
                    <img src={row.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="cpa-hub-section-fallback"><i className={`fa-solid ${campusIcon(row.title, meta.icon)}`} aria-hidden="true" /></span>
                  )}
                </div>
                <div className="cpa-hub-section-body">
                  <h3>{row.title}</h3>
                  {shared ? <p className="cpa-hub-shared">Shared across campuses</p> : null}
                  <p>{blurb || "No description yet."}</p>
                </div>
                <footer className="cpa-hub-section-foot">
                  {shared && editable ? (
                    <button type="button" className="admin-btn admin-btn-ghost" disabled={busy === row.id} onClick={() => assignHere(row)}>
                      Use only here
                    </button>
                  ) : null}
                  {row.id ? (
                    <Link className="admin-btn admin-btn-ghost" href={`/admin/content/campus_sections/${row.id}?return=${encodeURIComponent(`/admin/content/campuses/${campusId}?tab=${kind}`)}`}>
                      <i className="fa-solid fa-pen" aria-hidden="true" /> Edit
                    </Link>
                  ) : null}
                  {editable && row.id ? (
                    <button type="button" className="admin-btn admin-btn-ghost is-danger" disabled={busy === row.id} onClick={() => remove(row)}>
                      <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                  ) : null}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="admin-card apl-empty">
          <span><i className={`fa-solid ${meta.icon}`} aria-hidden="true" /></span>
          <h2>No {meta.label.toLowerCase()} yet</h2>
          <p>Add the first one to show it on the {campusTitle} campus page. Until then the designed layout still fills this section.</p>
        </div>
      )}
    </div>
  );
}

export function CampusHub({
  record,
  insight,
  sections,
  editable = true,
  initialTab,
}: {
  record: CampusRow;
  insight: CampusInsight | null;
  sections: SectionRow[];
  editable?: boolean;
  initialTab?: string;
}) {
  const router = useRouter();
  const [tab, setTabState] = useState<TabId>(() => tabOf(initialTab));
  const isNew = !record.id;

  useEffect(() => setTabState(tabOf(initialTab)), [initialTab]);

  const setTab = (next: TabId) => {
    if (!record.id) return;
    setTabState(next);
    const href = next === "overview" ? `/admin/content/campuses/${record.id}` : `/admin/content/campuses/${record.id}?tab=${next}`;
    router.replace(href);
  };

  if (isNew || tab === "overview") {
    return (
      <div className="cpa-hub">
        {!isNew ? (
          <nav className="cpa-hub-tabs" aria-label="Campus sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? "is-active" : undefined}
                onClick={() => setTab(item.id)}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </nav>
        ) : null}
        <CampusEditor record={record} insight={insight} />
      </div>
    );
  }

  return (
    <div className="cpa-hub app-page">
      <Link className="app-back" href="/admin/content/campuses"><i className="fa-solid fa-arrow-left" /> All campuses</Link>
      <header className="admin-hero pg-editor-hero">
        <div className="admin-hero-main">
          <p className="admin-hero-kicker"><i className="fa-solid fa-school" aria-hidden="true" /> Campuses · Edit campus</p>
          <h1>{record.title ? `KJA ${record.title}` : record.slug}</h1>
        </div>
        {insight?.hasLayout || record.published ? (
          <div className="admin-hero-actions">
            <a className="admin-hero-btn" href={`/branch/${record.slug}`} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View live
            </a>
          </div>
        ) : null}
      </header>
      <nav className="cpa-hub-tabs" aria-label="Campus sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "is-active" : undefined}
            onClick={() => setTab(item.id)}
          >
            <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </nav>
      <CampusSectionsPanel
        campusId={record.id!}
        campusSlug={record.slug}
        campusTitle={record.title || record.slug}
        kind={tab}
        sections={sections}
        editable={editable}
      />
    </div>
  );
}
