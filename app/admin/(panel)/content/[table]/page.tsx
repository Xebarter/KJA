import Link from "next/link";
import { notFound } from "next/navigation";
import { getContent } from "@/lib/content";
import { resources } from "@/lib/resources";
import type { SiteContent } from "@/lib/types";

const tableKey: Record<string, keyof SiteContent> = {
  pages: "pages",
  campuses: "campuses",
  campus_sections: "campus_sections",
  teachers: "teachers",
  events: "events",
  news: "news",
  posts: "posts",
  gallery_items: "gallery",
  testimonials: "testimonials",
  alumni_news: "alumni_news",
  alumni_events: "alumni_events",
  alumni_stories: "alumni_stories",
  alumni_profiles: "alumni_profiles",
  alumni_photos: "alumni_photos",
  vacancies: "vacancies",
};

export default async function CollectionPage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  const resource = resources[table];
  const key = tableKey[table];
  if (!resource || !key) notFound();
  const content = await getContent();
  const rows = content[key] as Record<string, unknown>[];
  return (
    <div className="admin-card">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1>{resource.label}</h1>
        <Link className="kja-btn" href={`/admin/content/${table}/new`}>Add</Link>
      </div>
      <table className="admin-table">
        <thead><tr><th>Title</th><th></th></tr></thead>
        <tbody>
          {rows.map((row) => {
            const id = String(row.id || "");
            const label = String(row.title || row.name || row.slug || "Untitled");
            return (
              <tr key={id || label}>
                <td>{label}</td>
                <td>{id ? <Link href={`/admin/content/${table}/${id}`}>Edit</Link> : "Import to Supabase to edit"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
