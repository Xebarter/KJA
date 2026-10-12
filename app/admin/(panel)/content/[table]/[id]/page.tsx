import { notFound } from "next/navigation";
import { RecordForm } from "@/components/admin/RecordForm";
import { tableKey } from "@/lib/admin";
import { resources } from "@/lib/resources";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export default async function EditPage({ params }: { params: Promise<{ table: string; id: string }> }) {
  const { table, id } = await params;
  const resource = resources[table];
  if (!resource || !tableKey[table]) notFound();
  if (!supabaseConfigured()) {
    return (
      <div className="admin-card">
        <h1>Connect Supabase to edit</h1>
        <p>The public site can still read the imported content file. Add your Supabase keys, then return here to create or edit records.</p>
      </div>
    );
  }
  let record: Record<string, unknown> | null = null;
  if (id !== "new") {
    const supabase = await createClient();
    const { data } = await supabase!.from(table).select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    record = data;
  }
  return (
    <div>
      <div className="admin-page-title">
        <div>
          <h1>{id === "new" ? "Add" : "Edit"} {resource.label.toLowerCase()}</h1>
          <p>Changes appear on the website as soon as you save.</p>
        </div>
      </div>
      <div className="admin-card">
        <RecordForm table={table} fields={resource.fields} record={record} />
      </div>
    </div>
  );
}
