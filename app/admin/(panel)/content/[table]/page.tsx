import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionTable } from "@/components/admin/CollectionTable";
import { tableKey } from "@/lib/admin";
import { getAdminContent } from "@/lib/content";
import { resources } from "@/lib/resources";

export default async function CollectionPage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  const resource = resources[table];
  const key = tableKey[table];
  if (!resource || !key) notFound();
  const content = await getAdminContent();
  const rows = content[key] as Record<string, unknown>[];
  return (
    <div>
      <div className="admin-page-title">
        <div>
          <h1>{resource.label}</h1>
          <p>Add, edit, or hide items that appear on the public website.</p>
        </div>
        <Link className="admin-btn" href={`/admin/content/${table}/new`}>Add {resource.label.toLowerCase()}</Link>
      </div>
      <div className="admin-card">
        <CollectionTable table={table} rows={rows} />
      </div>
    </div>
  );
}
