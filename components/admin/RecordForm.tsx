"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteRecord, saveRecord, uploadMedia } from "@/app/actions";
import type { Field } from "@/lib/resources";

export function RecordForm({ table, fields, record }: { table: string; fields: Field[]; record: Record<string, unknown> | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState(String(record?.image_url || ""));

  return (
    <form className="admin-form" action={async (formData) => {
      try {
        if (fields.some((field) => field.name === "image_url")) formData.set("image_url", imageUrl);
        await saveRecord(table, formData);
        router.push(`/admin/content/${table}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    }}>
      {record?.id ? <input type="hidden" name="id" value={String(record.id)} /> : null}
      {fields.map((field) => {
        if (field.name === "image_url") {
          return (
            <label key={field.name}>
              {field.label}
              <input name="image_url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
            </label>
          );
        }
        if (field.type === "checkbox") {
          return (
            <label key={field.name}>
              <input type="hidden" name={field.name} value="off" />
              <input type="checkbox" name={field.name} value="on" defaultChecked={record ? record[field.name] !== false : true} /> {field.label}
            </label>
          );
        }
        if (field.type === "textarea") {
          return (
            <label key={field.name}>
              {field.label}
              <textarea name={field.name} rows={field.name === "body" ? 12 : 4} defaultValue={String(record?.[field.name] ?? "")} />
            </label>
          );
        }
        const value = record?.[field.name];
        const shown = field.type === "date" && typeof value === "string" ? value.slice(0, 10) : String(value ?? "");
        return (
          <label key={field.name}>
            {field.label}
            <input name={field.name} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} defaultValue={record ? shown : ""} />
          </label>
        );
      })}
      {fields.some((field) => field.name === "image_url") ? (
        <label>
          Upload image
          <input type="file" accept="image/*" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const data = new FormData();
            data.set("file", file);
            try {
              setImageUrl(await uploadMedia(data));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed.");
            }
          }} />
        </label>
      ) : null}
      {error ? <p>{error}</p> : null}
      <div className="d-flex gap-2">
        <button className="kja-btn" type="submit">Save</button>
        {record?.id ? (
          <button className="kja-btn" type="button" onClick={async () => {
            if (!confirm("Delete this item?")) return;
            await deleteRecord(table, String(record.id));
            router.push(`/admin/content/${table}`);
            router.refresh();
          }}>Delete</button>
        ) : null}
      </div>
    </form>
  );
}
