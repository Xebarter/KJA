import { notFound } from "next/navigation";
import { RecordForm } from "@/components/admin/RecordForm";
import { getContent } from "@/lib/content";
import { resources } from "@/lib/resources";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import type { SiteContent } from "@/lib/types";

const tableKey: Record<string, keyof SiteContent> = {
  pages: "pages", campuses: "campuses", campus_sections: "campus_sections", teachers: "teachers",
  events: "events", news: "news", posts: "posts", gallery_items: "gallery", testimonials: "testimonials",
  alumni_news: "alumni_news", alumni_events: "alumni_events", alumni_stories: "alumni_stories",
  alumni_profiles: "alumni_profiles", alumni_photos: "alumni_photos", vacancies: "vacancies",
};

export default async function EditPage({ params }: { params: Promise<{ table: string; id: string }> }) {
  const { table, id } = await params;
  const resource = resources[table];
  const key = tableKey[table];
  if (!resource || !key) notFound();
  if (!supabaseConfigured()) {
    return <div className="admin-card"><h1>Supabase required</h1><p>Connect Supabase before creating or editing records. The public site can still read the imported content file.</p></div>;
  }
  let record: Record<string, unknown> | null = null;
  if (id !== "new") {
    const supabase = await createClient();
    const { data } = await supabase!.from(table).select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    record = data;
  }
  return (
    <div className="admin-card">
      <h1>{id === "new" ? "Add" : "Edit"} {resource.label}</h1>
      <RecordForm table={table} fields={resource.fields} record={record} />
    </div>
  );
}
